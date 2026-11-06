import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import { LOGIN_PLACEMENT, loginSessionKey, orderedLoginPromotions, validatePng } from '../src/lib/loginPromotions';
import LoginPromotions, { PromotionSequence } from '../src/components/LoginPromotions';
import AdminLoginPromotions from '../src/pages/admin/AdminLoginPromotions';

const mocks=vi.hoisted(()=>({token:'test-session',adminPromotions:vi.fn(),upload:vi.fn(),create:vi.fn(),update:vi.fn(),remove:vi.fn()}));
vi.mock('../src/api',()=>({getToken:()=>mocks.token,getAdminToken:()=> 'test-admin',api:{adminPromotions:mocks.adminPromotions,adminUploadPromotionImage:mocks.upload,adminCreatePromotion:mocks.create,adminUpdatePromotion:mocks.update,adminDeletePromotion:mocks.remove}}));
const base='https://example.com';
const items=[{id:2,title:'第二張',placement:LOGIN_PLACEMENT,enabled:1,sort:20,cover_image_url:'/second.png',imageUrl:base+'/second.png'},{id:1,title:'第一張',placement:LOGIN_PLACEMENT,enabled:1,sort:10,cover_image_url:'/first.png',imageUrl:base+'/first.png'}];
beforeEach(()=>{
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('crypto',webcrypto);
  sessionStorage.clear();mocks.token='test-session';
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.clearAllMocks()});

describe('login image selection',()=>{
  it('only includes enabled login images, with stable order and safe image URLs',()=>{
    const result=orderedLoginPromotions([...items,{...items[0],id:3,enabled:0},{...items[0],id:4,placement:'coupon'},{...items[0],id:5,cover_image_url:'javascript:alert(1)'}],base);
    expect(result.map(item=>item.id)).toEqual([1,2]);expect(result[0].imageUrl).toBe(base+'/first.png');
  });
  it('rejects a renamed non-PNG file and oversized images',()=>{
    expect(()=>validatePng(new Uint8Array([1,2,3]),12)).toThrow('PNG');
    expect(()=>validatePng(new Uint8Array([137,80,78,71,13,10,26,10]),9*1024*1024)).toThrow('8 MB');
    expect(()=>validatePng(new Uint8Array([137,80,78,71,13,10,26,10]),100)).not.toThrow();
  });
});

describe('sequential dismissal',()=>{
  it('shows one image at a time and a rapid double click never skips the second',()=>{
    vi.useFakeTimers();const complete=vi.fn(),advance=vi.fn();
    render(<PromotionSequence items={[items[1],items[0]]} onComplete={complete} onAdvance={advance}/>);
    expect(screen.getByRole('img').alt).toBe('第一張');
    fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('dialog').classList.contains('is-closing')).toBe(true);
    act(()=>vi.advanceTimersByTime(230));
    expect(screen.getByRole('img').alt).toBe('第二張');expect(complete).not.toHaveBeenCalled();expect(advance).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button'),{key:'Escape'});
    act(()=>vi.advanceTimersByTime(230));expect(complete).toHaveBeenCalledTimes(1);
  });
  it('clicking the artwork dismisses it and restores body scrolling when unmounted',()=>{
    vi.useFakeTimers();document.body.style.overflow='auto';const complete=vi.fn();
    const view=render(<PromotionSequence items={[items[1]]} onComplete={complete}/>);
    expect(document.body.style.overflow).toBe('hidden');fireEvent.click(screen.getByRole('img'));
    act(()=>vi.advanceTimersByTime(230));expect(complete).toHaveBeenCalledTimes(1);
    view.unmount();expect(document.body.style.overflow).toBe('auto');
  });
});

describe('authenticated gate',()=>{
  it('never fetches or opens promotions for a guest',()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);render(<LoginPromotions authenticated={false}/>);expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('loads ordered images for a login and remembers dismissed images for that session',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({success:true,items})})));
    vi.stubGlobal('Image',class{set src(value){queueMicrotask(()=>this.onload?.())}});
    render(<LoginPromotions authenticated userId={1}/>);
    await waitFor(()=>expect(screen.getByRole('img').alt).toBe('第一張'));
    fireEvent.click(screen.getByRole('button'));
    await waitFor(()=>expect(screen.getByRole('img').alt).toBe('第二張'));
    const key=await loginSessionKey(mocks.token);expect(JSON.parse(sessionStorage.getItem(key))).toEqual(['1']);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(sessionStorage.getItem(key))).toEqual(['1','2']);
  });
});

describe('admin image editor',()=>{
  it('requires confirmation before deletion and clears the editor after deleting its image',async()=>{
    mocks.adminPromotions.mockResolvedValueOnce({success:true,items:[items[1]]}).mockResolvedValue({success:true,items:[]});
    mocks.remove.mockResolvedValue({success:true});
    const confirm=vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);vi.stubGlobal('confirm',confirm);
    render(<AdminLoginPromotions/>);
    await waitFor(()=>expect(screen.getByRole('button',{name:'刪除'})).toBeTruthy());
    fireEvent.click(screen.getByRole('button',{name:'編輯'}));
    fireEvent.click(screen.getByRole('button',{name:'刪除'}));expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'刪除'}));
    await waitFor(()=>expect(screen.getByText('活動圖已刪除')).toBeTruthy());
    expect(mocks.remove).toHaveBeenCalledWith(1);expect(screen.getByLabelText('活動名稱').value).toBe('');
  });
  it('saves a validated PNG through the existing authenticated service with the chosen order',async()=>{
    mocks.adminPromotions.mockResolvedValue({success:true,items:[]});mocks.upload.mockResolvedValue({success:true,url:'/r2/test.png'});mocks.create.mockResolvedValue({success:true});
    vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({success:true,items:[{position_key:LOGIN_PLACEMENT,enabled:1,id:7}]})})));
    vi.stubGlobal('createImageBitmap',vi.fn(async()=>({close(){}})));
    const view=render(<AdminLoginPromotions/>);
    await waitFor(()=>expect(screen.getByText(/尚未設定活動圖/)).toBeTruthy());
    const file=new File([new Uint8Array([137,80,78,71,13,10,26,10])],'活動.png',{type:'image/png'});
    file.slice=()=>({arrayBuffer:async()=>new Uint8Array([137,80,78,71,13,10,26,10]).buffer});
    vi.stubGlobal('URL',class extends URL{static createObjectURL(){return 'blob:test'}static revokeObjectURL(){}});
    fireEvent.change(view.container.querySelector('input[type=file]'),{target:{files:[file]}});
    await waitFor(()=>expect(screen.getByLabelText('活動名稱').value).toBe('活動'));
    fireEvent.change(screen.getByLabelText('顯示順序'),{target:{value:'20'}});
    fireEvent.click(screen.getByRole('button',{name:'儲存活動圖'}));
    await waitFor(()=>expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({title:'活動',sort:20,enabled:1,placement:LOGIN_PLACEMENT,cover_image_url:'/r2/test.png'})));
    expect(mocks.upload).toHaveBeenCalledWith(file);
  });
});

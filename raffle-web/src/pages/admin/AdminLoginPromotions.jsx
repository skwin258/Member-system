import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getAdminToken } from '../../api';
import { LOGIN_PLACEMENT, orderedLoginPromotions, resolvePromotionImage, validatePng } from '../../lib/loginPromotions';
import { PromotionSequence } from '../../components/LoginPromotions';

const API_BASE=import.meta.env.VITE_API_BASE||'http://127.0.0.1:8787';
const empty={id:null,title:'',sort:0,enabled:true,cover_image_url:''};
async function positions(method='GET',body,id=''){
  const token=getAdminToken();
  if(!token)throw new Error('請先登入後台');
  const res=await fetch(`${API_BASE}/admin/promotion-positions${id?'/'+id:''}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();if(!res.ok||!data.success)throw new Error(data.error||'無法讀取活動圖設定');return data;
}
async function ensurePosition(){
  let data=await positions();
  let position=data.items?.find(item=>item.position_key===LOGIN_PLACEMENT);
  if(!position){
    await positions('POST',{position_key:LOGIN_PLACEMENT,position_label:'登入活動圖',sort:999});
    data=await positions();position=data.items?.find(item=>item.position_key===LOGIN_PLACEMENT);
    if(!position)throw new Error('建立登入活動圖位置失敗，請重新整理後再試');
  }
  if(!Number(position.enabled))await positions('PATCH',{enabled:1},position.id);
}
function check(result){if(!result?.success)throw new Error(result?.error||'儲存失敗');return result}

export default function AdminLoginPromotions(){
  const [items,setItems]=useState([]),[form,setForm]=useState(empty),[file,setFile]=useState(null),[previewURL,setPreviewURL]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState(null);
  const fileInput=useRef(null),formRef=useRef(null),fileVersion=useRef(0);
  async function load(){setLoading(true);setError('');try{const data=check(await api.adminPromotions());setItems(orderedLoginPromotions(data.items,API_BASE,false))}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  useEffect(()=>{if(!file){setPreviewURL('');return}const url=URL.createObjectURL(file);setPreviewURL(url);return()=>URL.revokeObjectURL(url)},[file]);
  const enabled=useMemo(()=>items.filter(item=>Number(item.enabled)===1),[items]);
  function reset(){fileVersion.current++;setForm(empty);setFile(null);if(fileInput.current)fileInput.current.value=''}
  async function selectFile(event){
    const chosen=event.target.files?.[0];const version=++fileVersion.current;setError('');setFile(null);
    if(!chosen)return;
    try{
      validatePng(new Uint8Array(await chosen.slice(0,8).arrayBuffer()),chosen.size);
      const bitmap=await createImageBitmap(chosen);bitmap.close();
      if(version!==fileVersion.current)return;
      setFile(chosen);setForm(f=>f.title?f:({...f,title:chosen.name.replace(/\.png$/i,'')}));
    }catch(e){if(version===fileVersion.current){setError(e.message||'PNG 圖片無法讀取');event.target.value=''}}
  }
  async function save(event){
    event.preventDefault();if(busy)return;setError('');setMessage('');
    if(!form.title.trim()){setError('請輸入活動名稱');return}
    if(!file&&!form.cover_image_url){setError('請選擇 PNG 圖片');return}
    if(!Number.isFinite(Number(form.sort))){setError('順序必須是數字');return}
    setBusy(true);
    try{
      await ensurePosition();
      let image=form.cover_image_url;
      if(file){const uploaded=check(await api.adminUploadPromotionImage(file));image=uploaded.url||uploaded.image_url;if(!resolvePromotionImage(image,API_BASE))throw new Error('圖片上傳後未取得有效網址')}
      const payload={title:form.title.trim(),cover_image_url:image,placement:LOGIN_PLACEMENT,enabled:form.enabled?1:0,sort:Number(form.sort),content_html:''};
      check(form.id?await api.adminUpdatePromotion(form.id,payload):await api.adminCreatePromotion(payload));
      reset();await load();setMessage('活動圖已儲存，前台下次登入會依順序顯示啟用圖片。');
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function toggle(item){
    if(busy)return;setBusy(true);setError('');setMessage('');
    try{check(await api.adminUpdatePromotion(item.id,{enabled:Number(item.enabled)?0:1}));await load();setMessage(Number(item.enabled)?'活動圖已停用':'活動圖已啟用')}catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function remove(item){
    if(busy||!window.confirm(`確定刪除「${item.title}」？\n刪除後將不再顯示這張登入活動圖。`))return;
    setBusy(true);setError('');setMessage('');
    try{
      check(await api.adminDeletePromotion(item.id));
      if(form.id===item.id)reset();
      await load();setMessage('活動圖已刪除');
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function edit(item){fileVersion.current++;setFile(null);setForm({...item,enabled:Boolean(Number(item.enabled))});if(fileInput.current)fileInput.current.value='';formRef.current?.scrollIntoView?.({behavior:'smooth',block:'start'})}
  const image=previewURL||resolvePromotionImage(form.cover_image_url,API_BASE);
  return <div className="alp-page">
    <div className="alp-heading"><div><h2>登入活動圖</h2><p>登入後逐張顯示，點擊畫面或 × 會放大淡出，再顯示下一張。</p></div><button className="ra-btn" onClick={()=>setPreview(enabled)} disabled={!enabled.length||busy}>預覽 {enabled.length} 張</button></div>
    <div className="alp-stats"><span><b>{items.length}</b> 張活動圖</span><span><b>{enabled.length}</b> 張啟用中</span><span>順序數字越小，越先顯示</span></div>
    {error&&<div className="alp-message is-error" role="alert">{error}</div>}{message&&<div className="alp-message" role="status">{message}</div>}
    <div className="alp-columns">
      <form ref={formRef} className="alp-panel" onSubmit={save}>
        <h3>{form.id?'編輯活動圖':'新增活動圖'}</h3>
        <label className="alp-field">活動名稱<input maxLength={100} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} required disabled={busy}/></label>
        <label className="alp-upload"><span>選擇 PNG 圖片</span><small>保留透明背景，檔案上限 8 MB</small><input ref={fileInput} type="file" accept="image/png,.png" onChange={selectFile} disabled={busy}/></label>
        <div className="alp-image-preview">{image?<img src={image} alt="活動圖預覽"/>:<span>圖片預覽</span>}</div>
        <div className="alp-form-row"><label className="alp-field">顯示順序<input type="number" step="1" value={form.sort} onChange={e=>setForm({...form,sort:e.target.value})} disabled={busy}/></label><label className="alp-checkbox"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})} disabled={busy}/>啟用顯示</label></div>
        <div className="alp-actions"><button type="submit" className="ra-btn ra-btnPrimary" disabled={busy}>{busy?'儲存中…':'儲存活動圖'}</button><button type="button" className="ra-btn" onClick={reset} disabled={busy}>取消編輯</button></div>
      </form>
      <section className="alp-panel"><div className="alp-heading"><h3>顯示順序</h3><button className="ra-btn" onClick={load} disabled={busy||loading}>重新整理</button></div>
        {loading?<p>載入中…</p>:!items.length?<div className="alp-empty">尚未設定活動圖。上傳 PNG 後即可開始設定。</div>:<ol className="alp-list">{items.map(item=><li key={item.id}><div className="alp-thumb"><img src={item.imageUrl} alt={item.title}/></div><div className="alp-item-meta"><strong>{item.title}</strong><span>順序 {item.sort} · {Number(item.enabled)?'啟用中':'已停用'}</span><div className="alp-actions"><button className="ra-btn" onClick={()=>edit(item)} disabled={busy}>編輯</button><button className="ra-btn" onClick={()=>toggle(item)} disabled={busy}>{Number(item.enabled)?'停用':'啟用'}</button><button className="ra-btn alp-delete" onClick={()=>remove(item)} disabled={busy}>刪除</button></div></div></li>)}</ol>}
      </section>
    </div>
    {preview?.length>0&&<PromotionSequence items={preview} onComplete={()=>setPreview(null)}/>}
  </div>;
}

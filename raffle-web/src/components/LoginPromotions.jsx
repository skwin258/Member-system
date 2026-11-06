import { API_BASE } from '../config';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getToken } from '../api';
import { LOGIN_PLACEMENT, loginSessionKey, orderedLoginPromotions } from '../lib/loginPromotions';
import './loginPromotions.css';



export function PromotionSequence({ items, onComplete, onAdvance }) {
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const closeLock = useRef(false);
  const closeButton = useRef(null);
  const done = useRef(onComplete);
  const advance = useRef(onAdvance);
  useEffect(()=>{done.current=onComplete;advance.current=onAdvance},[onComplete,onAdvance]);
  useEffect(()=>{
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return ()=>{document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()};
  },[]);
  useEffect(()=>{closeButton.current?.focus()},[index]);
  useEffect(()=>{
    if (!closing) return;
    const timeout=setTimeout(()=>{
      advance.current?.(items[index]);
      if(index+1>=items.length){done.current?.();return}
      setIndex(i=>i+1);closeLock.current=false;setClosing(false);
    },matchMedia('(prefers-reduced-motion: reduce)').matches?0:230);
    return ()=>clearTimeout(timeout);
  },[closing,index,items]);
  if(!items[index]) return null;
  const dismiss=()=>{if(closeLock.current)return;closeLock.current=true;setClosing(true)};
  return createPortal(
    <div className="login-promotion-overlay" onClick={dismiss} onKeyDown={e=>{
      e.stopPropagation();
      if(e.key==='Escape'){e.preventDefault();dismiss()}
      if(e.key==='Tab'){e.preventDefault();closeButton.current?.focus()}
    }}>
      <section key={items[index].id} className={`login-promotion-art ${closing?'is-closing':''}`} role="dialog" aria-modal="true" aria-label={items[index].title||'登入優惠'}>
        <button ref={closeButton} type="button" className="login-promotion-close" aria-label="關閉這張活動圖" onClick={e=>{e.stopPropagation();dismiss()}}>×</button>
        <img src={items[index].imageUrl} alt={items[index].title||'登入活動圖'} onError={dismiss}/>
        <span className="login-promotion-sr">第 {index+1} 張，共 {items.length} 張。點擊畫面或關閉按鈕，繼續下一張。</span>
      </section>
    </div>,document.body
  );
}

export default function LoginPromotions({ authenticated, userId }) {
  const [queue,setQueue]=useState([]);
  const storageKey=useRef('');
  useEffect(()=>{
    setQueue([]);
    if(!authenticated || !getToken())return;
    const controller=new AbortController();
    let active=true;
    async function load(){
      try{
        const key=await loginSessionKey(getToken());
        let seen=[];
        try{const stored=JSON.parse(sessionStorage.getItem(key)||'[]');seen=Array.isArray(stored)?stored:[]}catch{/* storage may be unavailable */}
        const res=await fetch(`${API_BASE}/promotions?placement=${LOGIN_PLACEMENT}`,{signal:controller.signal});
        const data=await res.json();
        if(!res.ok||!data.success)return;
        const ordered=orderedLoginPromotions(data.items,API_BASE).filter(item=>!seen.includes(String(item.id)));
        // Decode first so the user never sees an empty backdrop while an image loads.
        const decoded=await Promise.all(ordered.map(item=>new Promise(resolve=>{
          const image=new Image();
          const timeout=setTimeout(()=>resolve(null),10000);
          image.onload=()=>{clearTimeout(timeout);resolve(item)};
          image.onerror=()=>{clearTimeout(timeout);resolve(null)};
          image.src=item.imageUrl;
        })));
        if(active){storageKey.current=key;setQueue(decoded.filter(Boolean))}
      }catch{/* Optional promotion failures must never block login. */}
    }
    load();return()=>{active=false;controller.abort()};
  },[authenticated,userId]);
  if(!queue.length)return null;
  return <PromotionSequence items={queue} onComplete={()=>setQueue([])} onAdvance={item=>{
    try{const stored=JSON.parse(sessionStorage.getItem(storageKey.current)||'[]');const seen=Array.isArray(stored)?stored:[];sessionStorage.setItem(storageKey.current,JSON.stringify([...new Set([...seen,String(item.id)])]))}catch{/* Still allow dismissal when storage is blocked. */}
  }}/>;
}

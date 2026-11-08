import { useEffect, useRef } from 'react';
import { api } from '../api';
import { bannerImage, homeBannersWithDefaults } from '../lib/homeBanners';
import './fantasyHome.css';
const homepageMarkup="<main class=\"fh-scene\" aria-label=\"功能選單\">\n<header class=\"fh-header\"><img class=\"fh-logo fh-logo-image\" src=\"/fantasy/SKLOGO.png\" alt=\"SK LOGO\" draggable=\"false\"><nav class=\"fh-auth\" aria-label=\"會員\"><button type=\"button\">登入</button><span>/</span><button type=\"button\">註冊</button></nav></header><section class=\"fh-banner\" aria-label=\"活動 Banner\" aria-roledescription=\"輪播\" tabindex=\"0\"><div class=\"fh-banner-window\"><div class=\"fh-banner-track\"></div></div><div class=\"fh-banner-dots\" aria-label=\"選擇 Banner\"></div></section><aside class=\"fh-announcement\" aria-label=\"系統公告\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 9h4l6-5v16l-6-5H3zM17 8a7 7 0 0 1 0 8M20 5a11 11 0 0 1 0 14\"/></svg><div class=\"fh-marquee-window\"><div class=\"fh-marquee-text\">系統公告：歡迎來到奇幻世界，最新活動與消息將在此公告！</div></div></aside>\n<div class=\"fh-titles\" aria-live=\"polite\"><img class=\"fh-title fh-active\" src=\"/fantasy/金色奇幻奪寶專區-1.png\" alt=\"奪寶專區\" aria-hidden=\"false\" draggable=\"false\"><img class=\"fh-title\" src=\"/fantasy/積分商城金色字標-5.png\" alt=\"積分商城\" aria-hidden=\"true\" draggable=\"false\"><img class=\"fh-title\" src=\"/fantasy/金色奇幻好友邀請字標-3.png\" alt=\"好友邀請\" aria-hidden=\"true\" draggable=\"false\"><img class=\"fh-title\" src=\"/fantasy/金色抽獎紀錄字標-2.png\" alt=\"抽獎紀錄\" aria-hidden=\"true\" draggable=\"false\"><img class=\"fh-title\" src=\"/fantasy/AI專區金色奇幻標題-4.png\" alt=\"AI專區\" aria-hidden=\"true\" draggable=\"false\"></div>\n<div class=\"fh-ground-shadow\" aria-hidden=\"true\"><div class=\"fh-shadow\"></div><div class=\"fh-shadow\"></div><div class=\"fh-shadow\"></div><div class=\"fh-shadow\"></div><div class=\"fh-shadow\"></div></div><section class=\"fh-carousel\" aria-roledescription=\"輪播\" aria-label=\"功能\" tabindex=\"0\">\n<div class=\"fh-slide fh-active\" aria-hidden=\"false\"><img src=\"/fantasy/奪寶.png\" alt=\"奪寶\" draggable=\"false\"></div>\n<div class=\"fh-slide\" aria-hidden=\"true\"><img src=\"/fantasy/商城.png\" alt=\"商城\" draggable=\"false\"></div>\n<div class=\"fh-slide\" aria-hidden=\"true\"><img src=\"/fantasy/好友.png\" alt=\"好友\" draggable=\"false\"></div>\n<div class=\"fh-slide\" aria-hidden=\"true\"><img src=\"/fantasy/抽獎.png\" alt=\"抽獎\" draggable=\"false\"></div>\n<div class=\"fh-slide\" aria-hidden=\"true\"><img src=\"/fantasy/AI專區.png\" alt=\"AI專區\" draggable=\"false\"></div>\n<button class=\"fh-arrow fh-prev\" aria-label=\"上一個\"></button><button class=\"fh-arrow fh-next\" aria-label=\"下一個\"></button>\n</section>\n\n</main>";
function renderAuth(root, props) {
 const [first, second] = root.querySelectorAll('.fh-auth button');
 if (!first) return;
 first.classList.toggle('fh-notification-bell', !props.isGuest);
 if (props.isGuest) {
  first.textContent = '登入';
  first.removeAttribute('aria-label');
  first.removeAttribute('aria-haspopup');
 } else {
  const unread = Number(props.unreadNotifications || 0);
  first.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
  first.setAttribute('aria-label', unread ? `通知，${unread} 則未讀` : '通知');
  first.setAttribute('aria-haspopup', 'dialog');
  if (unread) {
   const count = document.createElement('span');
   count.className = 'fh-notification-count';
   count.textContent = unread > 99 ? '99+' : String(unread);
   count.setAttribute('aria-hidden','true');
   first.append(count);
  }
 }
 second.textContent = props.isGuest ? '註冊' : '登出';
}

export default function FantasyHome(props){
 const rootRef=useRef(null),callbacks=useRef(props);
 useEffect(()=>{callbacks.current=props;renderAuth(rootRef.current, props)},[props]);
 useEffect(()=>{
 const root=rootRef.current;root.innerHTML=homepageMarkup;
 let disposed=false;
 const controller=new AbortController();
 const listen=(target,type,handler)=>target.addEventListener(type,handler,{signal:controller.signal});
 

const titles=[...root.querySelectorAll('.fh-title')];
const slides=[...root.querySelectorAll('.fh-slide')];
const shadows=[...root.querySelectorAll('.fh-shadow')];
const scene=root.querySelector('.fh-scene');
let current=0,start=null,busy=false,offset=0,suppressClickUntil=0;
const wrap=n=>(n+slides.length)%slides.length;
const duration=()=>matchMedia('(prefers-reduced-motion: reduce)').matches?0:700;
function setTitle(index){titles.forEach((title,i)=>{title.classList.toggle('fh-active',i===index);title.setAttribute('aria-hidden',String(i!==index))})}
function render(degrees=0){
 offset=degrees;
 const radiusX=scene.clientWidth*.95,radiusY=scene.clientHeight*.09;
 slides.forEach((slide,i)=>{
  const angle=((i-current)*72+degrees)*Math.PI/180;
  const depth=(1-Math.cos(angle))/2;
  const x=Math.sin(angle)*radiusX,y=-(1-Math.cos(angle))*radiusY;
  const scale=1-depth*.42;
  slide.style.setProperty('--float-delay',(-i*.63)+'s');
  shadows[i].style.setProperty('--float-delay',(-i*.63)+'s');
  slide.style.transition='none';slide.style.visibility='visible';
  slide.style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';
  slide.style.zIndex=String(10-Math.round(depth*5));
  slide.style.filter='brightness('+(1-depth*.3)+')';
  slide.setAttribute('aria-hidden',String(i!==current));
  slide.querySelector('img').tabIndex=i===current?0:-1;
  shadows[i].style.transition='none';shadows[i].style.visibility='visible';
  shadows[i].style.transform='translate3d('+x+'px,'+y+'px,0) scale('+scale+')';
 });
}
function settle(step){
 if(busy)return;busy=true;
 const from=offset,to=-step*72,target=wrap(current+step),began=performance.now(),ms=duration();
 setTitle(target);
 function frame(now){
 if(disposed)return;
  const progress=ms?Math.min(1,(now-began)/ms):1;
  const eased=1-Math.pow(1-progress,3);
  render(from+(to-from)*eased);
  if(progress<1)requestAnimationFrame(frame);
  else{current=target;render();busy=false}
 }
 requestAnimationFrame(frame);
}
function move(step){if(!busy&&!start)settle(step)}
root.querySelector('.fh-prev').onclick=()=>move(-1);
root.querySelector('.fh-next').onclick=()=>move(1);
listen(document,'keydown',e=>{if(e.target.closest('input,textarea,select,.mbAuthOverlay,.login-promotion-overlay,.daily-tasks-dialog'))return;if(e.key==='ArrowRight'){e.preventDefault();move(1)}if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}});
listen(scene,'pointerdown',e=>{
 if(busy||e.target.closest('button,header,.fh-banner,.fh-announcement')||!e.isPrimary||e.button!==0)return;
 start={x:e.clientX,y:e.clientY,id:e.pointerId,time:performance.now(),horizontal:false};
});
listen(scene,'pointermove',e=>{
 if(!start||start.id!==e.pointerId)return;
 const dx=e.clientX-start.x,dy=e.clientY-start.y;
 if(!start.horizontal&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy))start.horizontal=true;
 if(start.horizontal&&!scene.hasPointerCapture(e.pointerId))scene.setPointerCapture(e.pointerId);
 if(start.horizontal)render(Math.max(-72,Math.min(72,dx/scene.clientWidth*90)));
});
function release(e,cancel=false){
 if(!start||start.id!==e.pointerId)return;
 const dx=e.clientX-start.x,elapsed=performance.now()-start.time;
 const commit=!cancel&&start.horizontal&&(Math.abs(dx)>scene.clientWidth*.15||(Math.abs(dx)>30&&Math.abs(dx)/elapsed>.35));
 if(!start.horizontal){start=null;return} suppressClickUntil=performance.now()+600;start=null;settle(commit?(dx<0?1:-1):0);
}
listen(scene,'pointerup',e=>release(e));listen(scene,'pointercancel',e=>release(e,true));
listen(window,'resize',()=>{if(!busy&&!start)render()});
setTitle(0);render();
const banner=root.querySelector('.fh-banner'),track=banner.querySelector('.fh-banner-track'),windowEl=banner.querySelector('.fh-banner-window'),dots=banner.querySelector('.fh-banner-dots');
let banners = [];
let bannerIndex = 0, bannerStart = null, suppressBannerClickUntil = 0;

function renderBanners() {
 banner.hidden = !banners.length;
 track.replaceChildren();
 dots.replaceChildren();
 banners.forEach((item, i) => {
  const image = document.createElement('img');
  image.src = bannerImage(item.image_url);
  image.alt = '活動 Banner ' + item.slot;
  image.draggable = false;
  if (i !== bannerIndex) image.loading = 'lazy';
  let slide = image;
  if (item.link_url) {
   slide = document.createElement('a');
   slide.href = item.link_url;
   slide.draggable = false;
   slide.append(image);
  }
  slide.className = 'fh-banner-slide';
  track.append(slide);
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = 'fh-banner-dot';
  dot.setAttribute('aria-label', '第 ' + item.slot + ' 張 Banner');
  dot.onclick = () => showBanner(i);
  dots.append(dot);
 });
 showBanner(bannerIndex, false);
}

function showBanner(index,animate=true,dx=0){
 if(!banners.length)return;
 bannerIndex=Math.max(0,Math.min(banners.length-1,index));
 track.style.transition=animate?'transform '+duration()+'ms cubic-bezier(.22,.72,.22,1)':'none';
 track.style.transform='translate3d('+(-bannerIndex*windowEl.clientWidth+dx)+'px,0,0)';
 [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',String(i===bannerIndex)));
 [...track.children].forEach((slide,i)=>{
  slide.setAttribute('aria-hidden',String(i!==bannerIndex));
  if (slide.tagName === 'A') slide.tabIndex = i === bannerIndex ? 0 : -1;
 });
}
listen(windowEl,'pointerdown',e=>{
 if(!e.isPrimary||e.button!==0)return;
 suppressBannerClickUntil=0;
 bannerStart={x:e.clientX,y:e.clientY,id:e.pointerId,time:performance.now(),dx:0,horizontal:false};
});
listen(windowEl,'pointermove',e=>{
 if(!bannerStart||e.pointerId!==bannerStart.id)return;
 let dx=e.clientX-bannerStart.x;
 if(!bannerStart.horizontal){
  if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(e.clientY-bannerStart.y))return;
  bannerStart.horizontal=true;
  windowEl.setPointerCapture(e.pointerId);
 }
 if((bannerIndex===0&&dx>0)||(bannerIndex===banners.length-1&&dx<0))dx*=.25;
 bannerStart.dx=dx;showBanner(bannerIndex,false,dx);
});
function endBanner(e,cancel=false){
 if(!bannerStart||e.pointerId!==bannerStart.id)return;
 const {dx,time,horizontal}=bannerStart;
 bannerStart=null;
 if(!horizontal)return;
 suppressBannerClickUntil=performance.now()+500;
 const changed=!cancel&&(Math.abs(dx)>windowEl.clientWidth*.18||(Math.abs(dx)>25&&Math.abs(dx)/(performance.now()-time)>.35));
 showBanner(bannerIndex+(changed?(dx<0?1:-1):0));
}
listen(window,'pointerup',e=>endBanner(e));listen(window,'pointercancel',e=>endBanner(e,true));
listen(windowEl,'click',e=>{if(e.detail && performance.now()<suppressBannerClickUntil)e.preventDefault()});
listen(banner,'keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();showBanner(bannerIndex+(e.key==='ArrowRight'?1:-1))}});
listen(window,'resize',()=>showBanner(bannerIndex,false));renderBanners();
api.homeBanners({ signal: controller.signal }).then(result => {
 if(disposed || !result?.success)return;
 banners=homeBannersWithDefaults(result.items);
 renderBanners();
}).catch(()=>{ /* Keep the homepage usable without the banner list. */ });


const routes=['treasure','shop','invite','records','ai'];
function enterPage(index){
 if(busy||performance.now()<suppressClickUntil)return;
 const image=slides[index].querySelector('img');
 if(callbacks.current.onNavigate(routes[index],image)){
  busy=true;image.style.visibility='hidden';
 }
}
slides.forEach((slide,index)=>{
 const image=slide.querySelector('img');image.tabIndex=index===current?0:-1;image.setAttribute('role','link');image.setAttribute('aria-label','進入'+image.alt);
 listen(image,'click',()=>enterPage(index));
 listen(image,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();enterPage(index)}});
});
const authButtons=root.querySelectorAll('.fh-auth button');
authButtons[0].onclick=()=>callbacks.current.isGuest?callbacks.current.onAuth('login'):callbacks.current.onNotifications?.();
authButtons[1].onclick=()=>callbacks.current.isGuest?callbacks.current.onAuth('register'):callbacks.current.onLogout();

 renderAuth(root, callbacks.current);
 return ()=>{disposed=true;controller.abort();root.innerHTML=''};
 },[]);
 return <div className="fantasy-home" ref={rootRef}/>;
}

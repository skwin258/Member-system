import { API_BASE } from '../config';
import { useEffect, useMemo, useRef, useState } from 'react';
import './admin/adminShell.css';
import AdminActivitySettings from './admin/AdminActivitySettings.jsx';
import AdminPrizeSettings from './admin/AdminPrizeSettings.jsx';
import AdminUserControl from './admin/AdminUserControl.jsx';
import AdminCreateUser from './admin/AdminCreateUser.jsx';
import AdminAdminRoles from './admin/AdminAdminRoles.jsx';
import AdminWinners from './admin/AdminWinners.jsx';
import AdminChangePassword from './admin/AdminChangePassword.jsx';
import AdminPromotions from './admin/AdminPromotions.jsx';
import AdminShopPage from './admin/AdminShopPage.jsx';
import AdminAiControl from './admin/AdminAiControl.jsx';
import AdminLoginPromotions from './admin/AdminLoginPromotions.jsx';
import AdminHomeBanners from './admin/AdminHomeBanners.jsx';
import AdminTaskNotifications from './admin/AdminTaskNotifications.jsx';

const TABS=[
  {key:'notifications',title:'最新通知',desc:'每日任務驗證待審核',Component:AdminTaskNotifications},
  {key:'activity',title:'活動設定',desc:'活動時間與開關',Component:AdminActivitySettings},
  {key:'prizes',title:'獎項設定',desc:'獎項、機率與輪盤',Component:AdminPrizeSettings},
  {key:'users',title:'使用者管理',desc:'帳戶、授權與用量',Component:AdminUserControl},
  {key:'aiControl',title:'AI 控制',desc:'AI 與電子功能權限',Component:AdminAiControl},
  {key:'createUser',title:'新增使用者',desc:'建立帳戶與初始權限',Component:AdminCreateUser},
  {key:'loginPromotions',title:'登入活動圖',desc:'PNG 上傳與逐張顯示',Component:AdminLoginPromotions},
  {key:'homeBanners',title:'首頁 Banner',desc:'輪播圖片與跳轉連結',Component:AdminHomeBanners},
  {key:'promotions',title:'優惠內容',desc:'優惠圖片與說明',Component:AdminPromotions},
  {key:'shop',title:'商城管理',desc:'商品、公告與兌換',Component:AdminShopPage},
  {key:'admins',title:'管理員權限',desc:'管理員與角色管理',superOnly:true,Component:AdminAdminRoles},
  {key:'winners',title:'中獎資訊',desc:'查詢抽獎與中獎紀錄',Component:AdminWinners},
  {key:'password',title:'修改密碼',desc:'管理員密碼更新',Component:AdminChangePassword},
];

export default function AdminDashboard({adminMe,onAdminLogout}){
  const role=adminMe?.role||adminMe?.admin?.role||adminMe?.user?.role||(adminMe?.admin?.is_superadmin?'superadmin':'admin');
  const isSuper=String(role).toLowerCase()==='superadmin';
  const name=adminMe?.admin?.username||adminMe?.admin?.display_name||adminMe?.user?.username||'管理員';
  const visibleTabs=useMemo(()=>TABS.filter(t=>!t.superOnly||isSuper),[isSuper]);
  const [tab,setTab]=useState(()=>{const key=new URLSearchParams(location.search).get('tab');return visibleTabs.some(t=>t.key===key)?key:'activity'});
  const [targetUser,setTargetUser]=useState(()=>new URLSearchParams(location.search).get('user'));
  const [navOpen,setNavOpen]=useState(false);
  const menuButton=useRef(null),sidebar=useRef(null);
  const current=visibleTabs.find(t=>t.key===tab)||visibleTabs[0];
  const Content=current.Component;
  const live=API_BASE.includes('api.skclub.vip');
  useEffect(()=>{
    const url=new URL(location.href);
    url.searchParams.set('tab',current.key);
    if(current.key==='users' && targetUser)url.searchParams.set('user',targetUser);
    else url.searchParams.delete('user');
    history.replaceState(null,'',url);
  },[current.key,targetUser]);
  useEffect(()=>{
    if(!navOpen)return;
    sidebar.current?.querySelector('button')?.focus();
    const keydown=e=>{if(e.key==='Escape'){setNavOpen(false);menuButton.current?.focus()}};
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[navOpen]);
  function navigate(key,user=null){setTab(key);setTargetUser(user);setNavOpen(false);requestAnimationFrame(()=>document.querySelector('.ra-pageHeading h1')?.focus())}
  function trapNavigation(e){
    if(!navOpen||e.key!=='Tab'||!matchMedia('(max-width: 980px)').matches)return;
    const buttons=[...sidebar.current.querySelectorAll('button:not(:disabled)')];
    const first=buttons[0],last=buttons.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  }
  return <div className={`ra-adminShell ${navOpen?'is-nav-open':''}`}>
    {navOpen&&<button type="button" className="ra-navBackdrop" aria-label="關閉導覽" onClick={()=>{setNavOpen(false);menuButton.current?.focus()}}/>}
    <aside className="ra-adminSidebar" id="admin-navigation" ref={sidebar} onKeyDown={trapNavigation}>
      <button className="ra-mobileClose" type="button" aria-label="關閉導覽" onClick={()=>{setNavOpen(false);menuButton.current?.focus()}}>×</button>
      <div className="ra-brandCard"><img className="ra-brandLogo" src="/fantasy/SKLOGO.png" alt="SK"/><div><strong>SK 管理中心</strong><span>ANCIENT GOLD · ADMIN</span></div></div>
      <div className="ra-navLabel">管理功能</div>
      <nav className="ra-nav" aria-label="後台導覽">{visibleTabs.map((item,index)=><button key={item.key} className={`ra-navBtn ${current.key===item.key?'ra-navBtnActive':''}`} aria-current={current.key===item.key?'page':undefined} onClick={()=>navigate(item.key)}><span className="ra-navNumber">{String(index+1).padStart(2,'0')}</span><span><strong>{item.title}</strong><small>{item.desc}</small></span></button>)}</nav>
      <div className="ra-sideFooter"><div className="ra-userCard"><div className="ra-avatar">{name.slice(0,1).toUpperCase()}</div><div><strong>{name}</strong><span className="ra-userRole">{isSuper?'最高管理員':'管理員'}</span></div></div><div className="ra-footerActions"><a className="ra-btn ra-btnGhost" href="/">返回前台</a><button className="ra-btn" onClick={onAdminLogout}>登出</button></div></div>
    </aside>
    <main className="ra-adminMain">
      <header className="ra-topBar"><button className="ra-menuToggle" type="button" ref={menuButton} aria-controls="admin-navigation" aria-expanded={navOpen} onClick={()=>setNavOpen(v=>!v)}>☰<span>選單</span></button><div className="ra-pageHeading"><h1 tabIndex="-1">{current.title}</h1><p>{current.desc}</p></div><div className="ra-environment"><span/>{live?'正式資料':'本機環境'}</div></header>
      <section className="ra-contentScroll" key={current.key} aria-label={current.title}><Content adminMe={adminMe}
        initialUserId={targetUser} onOpenUser={id=>navigate('users',id)}/></section>
    </main>
  </div>;
}

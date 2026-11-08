import MemberNotifications, { useMemberNotifications } from "./MemberNotifications.jsx";
import React, { useMemo, useRef, useState, useEffect } from "react";
import "./mobileShell.css";
import FantasyHome from './FantasyHome.jsx';
import DailyTasks from './DailyTasks.jsx';
import MobilePageFrame from "./MobilePageFrame.jsx";
import { api } from "../api";
import LoginBox from "../LoginBox";
// import RegisterModal from "../components/RegisterModal.jsx";

import MobilePromoPage from "./MobilePromoPage.jsx";
import ArcadeFrame from "../components/ArcadeFrame.jsx";
import MobileRecordsPage from "./MobileRecordsPage.jsx";
import SupportPage from "../pages/front/SupportPage.jsx";
import MobileShopPage from "./MobileShopPage.jsx";
import InvitePage from "../pages/front/InvitePage.jsx";
import MobileMyPage from "./MobileMyPage.jsx";
import MobileElectronicRoomPage from "./MobileElectronicRoomPage.jsx";
import "./mobileChrome.css";

function BottomNavIcon({ type, active = false }) {
  const cls = active ? "mbBottomSvg isActive" : "mbBottomSvg";

  if (type === "promo") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 9v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M3 9h18V6.5A1.5 1.5 0 0 0 19.5 5h-15A1.5 1.5 0 0 0 3 6.5V9Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 5v16M8.2 5C7.2 3.4 9 2.2 10.5 3.5 11.3 4.2 12 5 12 5s.7-.8 1.5-1.5C15 2.2 16.8 3.4 15.8 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "support") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 13v-1a7 7 0 0 1 14 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 13h3v5H6.5A1.5 1.5 0 0 1 5 16.5V13ZM19 13h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5V13Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M16 18c-.5 1.5-1.8 2.2-4 2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "records") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3.8h7l3 3V20a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 20V5A1.2 1.2 0 0 1 7 3.8Z" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 3.8V7h3M8.5 11h7M8.5 14.5h7M8.5 18h4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.8 20.2a7.2 7.2 0 0 1 14.4 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowBtn() {
  return (
    <span className="mbArrowCircle" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function TrendLine({ color = "cyan" }) {
  return (
    <svg className={`mbTrendLine ${color}`} viewBox="0 0 180 62" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`trendFill-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M0 53 C18 50 22 44 38 47 C55 51 63 35 80 38 C96 40 103 23 117 26 C132 30 132 14 148 17 C163 20 166 8 180 5 L180 62 L0 62 Z" fill={`url(#trendFill-${color})`} />
      <path d="M0 53 C18 50 22 44 38 47 C55 51 63 35 80 38 C96 40 103 23 117 26 C132 30 132 14 148 17 C163 20 166 8 180 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="180" cy="5" r="4.5" fill="currentColor" />
    </svg>
  );
}

function TechIcon({ type }) {
  if (type === "baccarat") {
    return (
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="32" className="iconCircle" />
        <path d="M22 52h10V38H22v14ZM36 52h10V28H36v24ZM50 52h10V20H50v32Z" className="iconFill" />
        <path d="M20 29c12 0 19-9 25-15m0 0h-9m9 0v9" className="iconStroke" />
      </svg>
    );
  }

  /* ✅ 新增奪寶專區圖示，放這裡 */
  if (type === "treasure") {
    return (
      <svg viewBox="0 0 72 72" fill="none">
        <path
          d="M22 29h28v25H22V29Z"
          fill="rgba(255, 90, 105, 0.18)"
          stroke="#ff6677"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M20 24h32v8H20v-8Z"
          fill="rgba(255, 118, 128, 0.28)"
          stroke="#ff6677"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M36 24v30" stroke="#ff6677" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M31 24c-8-6-4-13 3-9 4 2 2 9 2 9s4-7 8-9c7-4 11 3 3 9"
          stroke="#ff6677"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  /* ✅ 新增抽獎紀錄圖示，放這裡 */
  if (type === "record") {
    return (
      <svg viewBox="0 0 72 72" fill="none">
        <path
          d="M24 18h21l7 7v29H24V18Z"
          fill="rgba(47, 156, 255, 0.12)"
          stroke="#4aa6ff"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="M45 18v8h7" stroke="#4aa6ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M30 34h16M30 42h16M30 50h10" stroke="#4aa6ff" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }  

if (type === "sports") {
  return (
    <svg viewBox="0 0 80 80" fill="none">
      <circle cx="40" cy="40" r="32" className="iconCircle purple" />

      {/* 足球 */}
      <g className="sportsBallIcon">
        <circle cx="40" cy="40" r="18" fill="rgba(139,97,255,0.12)" stroke="#8b61ff" strokeWidth="3" />

        {/* 中間五角形 */}
        <path
          d="M40 28.5L48 34.3L44.9 43.7H35.1L32 34.3L40 28.5Z"
          fill="#8b61ff"
        />

        {/* 足球紋路 */}
        <path
          d="M40 28.5V22.5"
          stroke="#8b61ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M48 34.3L54 32"
          stroke="#8b61ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M44.9 43.7L49.5 50"
          stroke="#8b61ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M35.1 43.7L30.5 50"
          stroke="#8b61ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M32 34.3L26 32"
          stroke="#8b61ff"
          strokeWidth="2.5"
          strokeLinecap="round"
        />

        {/* 外圍弧線，讓它更像球 */}
        <path
          d="M27.5 27.5C31 24.2 35.3 22.5 40 22.5C44.7 22.5 49 24.2 52.5 27.5"
          stroke="#8b61ff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.9"
        />
        <path
          d="M24.5 39.5C25.2 47.5 31.7 54 40 54C48.3 54 54.8 47.5 55.5 39.5"
          stroke="#8b61ff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M26 32C24.8 34.4 24.2 36.7 24.2 40"
          stroke="#8b61ff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M54 32C55.2 34.4 55.8 36.7 55.8 40"
          stroke="#8b61ff"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

  if (type === "game") {
    return (
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="40" r="32" className="iconCircle blue" />
        <path d="M40 20c-10 0-17 7-17 16 0 6 3 11 8 14v7h18v-7c5-3 8-8 8-14 0-9-7-16-17-16Z" className="iconStroke blue" />
        <path d="M33 61h14M35 67h10" className="iconStroke blue" />
        <path d="M40 28v10M34 34h12" className="iconStroke blue" />
      </svg>
    );
  }

  if (type === "invite") {
    return (
      <svg viewBox="0 0 72 72" fill="none">
        <path d="M36 12v13M36 47v13M14 36h13M45 36h13" className="wideStroke cyan" />
        <circle cx="36" cy="36" r="9" className="iconFill cyan" />
        <circle cx="17" cy="17" r="5" className="iconFill cyan" opacity=".8" />
        <circle cx="55" cy="17" r="5" className="iconFill cyan" opacity=".8" />
        <circle cx="17" cy="55" r="5" className="iconFill cyan" opacity=".8" />
        <circle cx="55" cy="55" r="5" className="iconFill cyan" opacity=".8" />
        <path d="M21 20l9 9M51 20l-9 9M21 52l9-9M51 52l-9-9" className="wideStroke cyan" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 72 72" fill="none">
      <path d="M20 26l16-8 16 8-16 8-16-8Z" className="iconFill violet" />
      <path d="M20 36l16 8 16-8M20 47l16 8 16-8" className="wideStroke violet" />
      <circle cx="53" cy="44" r="10" className="coinCircle" />
      <text x="53" y="49" textAnchor="middle" className="coinText">S</text>
    </svg>
  );
}

export default function MobileShell({
  me,
  loading,
  onRefresh,
  onRefreshMe,
  onRefreshActivities,
  onLogout,
  isGuest = false,
  onUserLoggedIn,
  refCode = null,
}) {
  const [activeKey, setActiveKey] = useState("home");
  const [homeTransition, setHomeTransition] = useState(null);
  const arcadeFrame = useRef(null);
  const [recordsView, setRecordsView] = useState("raffle");

const [showGuestAuth, setShowGuestAuth] = useState(false);
const [showDailyTasks, setShowDailyTasks] = useState(false);
const [showNotifications, setShowNotifications] = useState(false);
const notifications = useMemberNotifications(!isGuest && activeKey === "home", me?.user?.id);
function openNotifications() {
  setShowNotifications(true);
  void notifications.refresh({ markRead: true });
}
const [authDefaultView, setAuthDefaultView] = useState("login");

const [electronicStatus, setElectronicStatus] = useState({
  loading: false,
  loaded: false,
  allowed: false,
  uses_left: 0,
  unlimited: 0,
  message: "",
});

useEffect(() => {
  if (!isGuest) return;
  const code = String(refCode || "").trim();
  if (!code) return;
  setAuthDefaultView("register");
  setShowGuestAuth(true);
}, [isGuest, refCode]);

  useEffect(() => {
  let alive = true;

  async function loadElectronicStatus() {
    if (isGuest) {
      setElectronicStatus({
        loading: false,
        loaded: true,
        allowed: false,
        uses_left: 0,
        unlimited: 0,
        message: "未登入",
      });
      return;
    }

    setElectronicStatus((prev) => ({
      ...prev,
      loading: true,
    }));

    try {
      const res = await api.getElectronicRoomStatus();

      if (!alive) return;

      if (!res?.success) {
        setElectronicStatus({
          loading: false,
          loaded: true,
          allowed: false,
          uses_left: 0,
          unlimited: 0,
          message: res?.error || "讀取失敗",
        });
        return;
      }

      setElectronicStatus({
        loading: false,
        loaded: true,
        allowed: !!res.allowed,
        uses_left: Number(res.uses_left || 0),
        unlimited: Number(res.unlimited || 0),
        message: res.message || "",
      });
    } catch (err) {
      if (!alive) return;

      setElectronicStatus({
        loading: false,
        loaded: true,
        allowed: false,
        uses_left: 0,
        unlimited: 0,
        message: "讀取失敗",
      });
    }
  }

  loadElectronicStatus();

  return () => {
    alive = false;
  };
}, [isGuest, me?.user?.id]);

  const menu = useMemo(
    () => [
      { key: "ai", title: "AI 專區", guestAllowed: true },
      { key: "promo", title: "活動", guestAllowed: true },
      { key: "treasure", title: "奪寶", guestAllowed: true },
      { key: "records", title: "紀錄", guestAllowed: false },
      { key: "support", title: "客服", guestAllowed: true },
      { key: "shop", title: "商城", guestAllowed: true },
      { key: "invite", title: "邀請", guestAllowed: false },
      { key: "electronicRoom", title: "電子老虎機", guestAllowed: false },
      { key: "my", title: "我的", guestAllowed: false },
    ],
    []
  );

  function money(v) {
    const n = Number(v || 0);
    return n.toLocaleString("en-US");
  }

function needLogin() {
  alert("請先登入");
  setAuthDefaultView("login");
  setShowGuestAuth(true);
}

  function handleGo(key, artwork) {
    if (homeTransition) return false;
    const target = menu.find((m) => m.key === key);
    if (!target) {
      setActiveKey("home");
      return;
    }

    if (isGuest && !target.guestAllowed) {
      needLogin();
      return;
    }

    if (activeKey === "home" && artwork && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const { top, left, width, height } = artwork.getBoundingClientRect();
      if (width && height) {
        setHomeTransition({ key, src: artwork.currentSrc || artwork.src, bounds: { top, left, width, height } });
        return true;
      }
    }
    setActiveKey(key);
  }

  function renderBottomNav() {
    const item=(key,label)=><button key={key} className="fh-nav-item" type="button" aria-current={activeKey===key?'page':undefined} onClick={()=>handleGo(key)}><BottomNavIcon type={key} active={activeKey===key}/><span>{label}</span></button>;
    return <nav className="fh-bottom-nav" aria-label="底部選單">
      {item('promo','活動')}{item('support','客服')}
      <button className="fh-coin-button" type="button" aria-label="回首頁" onClick={()=>setActiveKey('home')}><img className="fh-coin-image" src="/fantasy/scoin.png" alt="" draggable="false"/></button>
      {item('records','紀錄')}{item('my','我的')}
    </nav>;
  }

  function renderContent() {
    if(activeKey==='ai')return <MobilePageFrame title="AI 專區" onBack={()=>setActiveKey('home')} plain><div className="fh-ai-grid"><button type="button" onClick={()=>alert('尚在開發中')}><TechIcon type="baccarat"/><strong>百家樂</strong></button><button type="button" onClick={()=>alert('尚在開發中')}><TechIcon type="sports"/><strong>運彩</strong></button><button type="button" onClick={()=>handleGo('electronicRoom')}><TechIcon type="game"/><strong>電子老虎機</strong><span>{electronicBadgeNumber}</span></button></div></MobilePageFrame>;

    if (activeKey === "promo") {
      return (
        <MobilePageFrame title="優惠活動" onBack={() => setActiveKey("home")} plain={true}>
          <MobilePromoPage />
        </MobilePageFrame>
      );
    }

    if (activeKey === "treasure") {
      return (
        <MobilePageFrame title="奪寶" onBack={() => arcadeFrame.current?.back(() => setActiveKey("home"))} plain topRight={
          <div className="arcade-wallet-balances">
            <span>SC 幣餘額 <strong>{isGuest || me?.user?.sc_balance === undefined ? "—" : Number(me.user.sc_balance).toLocaleString("zh-TW")}</strong></span>
            <span>S 幣餘額 <strong>{isGuest ? "—" : Number(me?.user?.s_balance || 0).toLocaleString("zh-TW")}</strong></span>
          </div>
        }>
          <ArcadeFrame ref={arcadeFrame} onWalletChange={onRefreshMe || onRefresh}
            onLoginRequired={needLogin} loginOpen={showGuestAuth} />
        </MobilePageFrame>
      );
    }

    if (activeKey === "records") {
      if (isGuest) return null;
      return (
        <MobilePageFrame title="抽獎紀錄" onBack={() => setActiveKey("home")} plain={true}>
          <MobileRecordsPage me={me} initialView={recordsView} />
        </MobilePageFrame>
      );
    }

    if (activeKey === "support") {
      return (
        <MobilePageFrame title="聯絡客服" onBack={() => setActiveKey("home")} plain={true}>
          <SupportPage me={me} />
        </MobilePageFrame>
      );
    }

    if (activeKey === "shop") {
      return (
        <MobilePageFrame title="商城中心" onBack={() => setActiveKey("home")} plain={true}>
          <MobileShopPage
            me={me}
            onRefreshMe={onRefreshMe || onRefresh}
            onOpenRedeemRecords={() => {
              if (isGuest) {
                needLogin();
                return;
              }
              setRecordsView("redeem");
              setActiveKey("records");
            }}
          />
        </MobilePageFrame>
      );
    }

    if (activeKey === "invite") {
      if (isGuest) return null;
      return (
        <MobilePageFrame title="邀請朋友" onBack={() => setActiveKey("home")}>
          <InvitePage me={me} />
        </MobilePageFrame>
      );
    }

    if (activeKey === "electronicRoom") {
  if (isGuest) return null;

  return (
    <MobilePageFrame title="電子老虎機" onBack={() => setActiveKey("home")} plain={true}>
      <MobileElectronicRoomPage onRefreshMe={onRefreshMe || onRefresh} />
    </MobilePageFrame>
  );
}

    if (activeKey === "my") {
      if (isGuest) return null;
      return (
        <MobilePageFrame title="我的中心" onBack={() => setActiveKey("home")} plain={true}>
          <MobileMyPage me={me} onRefreshMe={onRefreshMe || onRefresh} goPage={setActiveKey} />
        </MobilePageFrame>
      );
    }

    return null;
  }

  const authModal = showGuestAuth ? (
    <div className="mbAuthOverlay" onClick={() => setShowGuestAuth(false)}>
      <div className="mbAuthBox" onClick={(e) => e.stopPropagation()}>
<LoginBox
  mode="user"
  referralCode={refCode || ""}
  defaultView={authDefaultView}
  onLoggedIn={async () => {
    setShowGuestAuth(false);
    setAuthDefaultView("login");
    await onUserLoggedIn?.();
    arcadeFrame.current?.reset();
  }}
/>
      </div>
    </div>
  ) : null;

const electronicBadgeNumber = (() => {
  if (electronicStatus.loading) return "...";
  if (isGuest) return "0";
  if (electronicStatus.unlimited) return "∞";
  return String(Math.max(0, Number(electronicStatus.uses_left || 0)));
})();

  return <>
    {activeKey !== "home" ? (
        <div className={`mbHome mbHome--inner fh-inner${activeKey === "treasure" ? " fh-inner--arcade" : ""}`}>
          {renderContent()}
          {renderBottomNav()}
        </div>
    ) : <>
      <FantasyHome isGuest={isGuest} unreadNotifications={notifications.unread} onNotifications={openNotifications} onNavigate={handleGo} onAuth={(view)=>{setAuthDefaultView(view);setShowGuestAuth(true)}} onLogout={onLogout}/>
      {!isGuest && showNotifications && <MemberNotifications items={notifications.items} error={notifications.error}
        onClose={() => setShowNotifications(false)} onRetry={() => notifications.refresh({ markRead: true })} />}
      <button className="daily-task-launch" type="button" aria-haspopup="dialog"
        onClick={() => { if (isGuest) needLogin(); else setShowDailyTasks(true); }}>
        <img src="/daily-tasks/icon.png" alt="" />每日任務
      </button>
      {!isGuest && showDailyTasks && <DailyTasks lineUrl={me?.user?.support_line_url}
        onClose={() => setShowDailyTasks(false)} />}
      {renderBottomNav()}
    </>}
    {authModal}
    {homeTransition && <div className="fh-route-transition" aria-hidden="true">
      <img src={homeTransition.src} alt="" style={homeTransition.bounds}
        className={activeKey === "home" ? "fh-route-zoom" : "fh-route-fade"}
        onAnimationEnd={() => {
          if (activeKey === "home") setActiveKey(homeTransition.key);
          else setHomeTransition(null);
        }} />
    </div>}
  </>;
}

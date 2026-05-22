import React, { useMemo, useRef, useState, useEffect } from "react";
import "./mobileShell.css";
import MobilePageFrame from "./MobilePageFrame.jsx";
import { api } from "../api";
import LoginBox from "../LoginBox";
// import RegisterModal from "../components/RegisterModal.jsx";

import MobilePromoPage from "./MobilePromoPage.jsx";
import TreasurePage from "./MobileTreasurePage.jsx";
import MobileRecordsPage from "./MobileRecordsPage.jsx";
import SupportPage from "../pages/front/SupportPage.jsx";
import MobileShopPage from "./MobileShopPage.jsx";
import InvitePage from "../pages/front/InvitePage.jsx";
import MobileMyPage from "./MobileMyPage.jsx";
import MobileElectronicRoomPage from "./MobileElectronicRoomPage.jsx";

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
  activities,
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
  const [recordsView, setRecordsView] = useState("raffle");
  const [treasureTab, setTreasureTab] = useState("redpacket");

const [showGuestAuth, setShowGuestAuth] = useState(false);

const [electronicStatus, setElectronicStatus] = useState({
  loading: false,
  loaded: false,
  allowed: false,
  uses_left: 0,
  unlimited: 0,
  message: "",
});

const [bannerIndex, setBannerIndex] = useState(0);
const bannerTrackRef = useRef(null);

const banners = useMemo(
  () => [
    "/img/BANNER1.png?v=2",
    "/img/BANNER2.png?v=2",
    "/img/BANNER3.png?v=2",
  ],
  []
);

  useEffect(() => {
    const timer = setInterval(() => {
      setBannerIndex((prev) => {
        const next = (prev + 1) % banners.length;
        const track = bannerTrackRef.current;
        if (track) {
          track.scrollTo({
            left: next * track.clientWidth,
            behavior: "smooth",
          });
        }
        return next;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [banners.length]);

useEffect(() => {
  if (!isGuest) return;
  const code = String(refCode || "").trim();
  if (!code) return;
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
    setShowGuestAuth(true);
  }

  function handleGo(key) {
    const target = menu.find((m) => m.key === key);
    if (!target) {
      setActiveKey("home");
      return;
    }

    if (isGuest && !target.guestAllowed) {
      needLogin();
      return;
    }

    setActiveKey(key);
  }

  function handleBannerScroll() {
    const el = bannerTrackRef.current;
    if (!el) return;

    const width = el.clientWidth || 1;
    const idx = Math.round(el.scrollLeft / width);
    const safeIdx = Math.max(0, Math.min(banners.length - 1, idx));
    setBannerIndex(safeIdx);
  }

  function goBanner(idx) {
    const el = bannerTrackRef.current;
    if (!el) return;

    const width = el.clientWidth;
    el.scrollTo({
      left: width * idx,
      behavior: "smooth",
    });

    setBannerIndex(idx);
  }

  function renderBottomNav() {
    const items = [
      { key: "promo", label: "活動", icon: "promo" },
      { key: "support", label: "客服", icon: "support" },
      { key: "records", label: "紀錄", icon: "records" },
      { key: "my", label: "我的", icon: "my" },
    ];

    return (
      <div className="mbBottomNav mbBottomNav--icon">
        <div className="mbBottomNavHalf">
          {items.slice(0, 2).map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                className={`mbBottomIconItem ${isActive ? "isActive" : ""}`}
                type="button"
                onClick={() => handleGo(item.key)}
              >
                <BottomNavIcon type={item.icon} active={isActive} />
                <span className="mbBottomIconLabel">{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="mbBottomNavCenterGap" />

        <div className="mbBottomNavHalf">
          {items.slice(2).map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                className={`mbBottomIconItem ${isActive ? "isActive" : ""}`}
                type="button"
                onClick={() => handleGo(item.key)}
              >
                <BottomNavIcon type={item.icon} active={isActive} />
                <span className="mbBottomIconLabel">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderContent() {
    if (activeKey === "promo") {
      return (
        <MobilePageFrame title="優惠活動" onBack={() => setActiveKey("home")} plain={true}>
          <MobilePromoPage />
        </MobilePageFrame>
      );
    }

    if (activeKey === "treasure") {
      return (
        <MobilePageFrame title="奪寶專區" onBack={() => setActiveKey("home")} plain={true}>
          <TreasurePage
            me={me}
            activities={activities}
            onRefreshMe={onRefreshMe || onRefresh}
            tab={treasureTab}
            onTabChange={setTreasureTab}
            isGuest={isGuest}
            onNeedLogin={needLogin}
          />
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

  const homeFloatButton = (
    <button
      className="mbFloatBtn"
      type="button"
      aria-label="回首頁"
      onClick={() => setActiveKey("home")}
    >
      <span className="mbFloatCoinRing">
        <img src="/img/scoin.png" alt="S Coin" className="mbFloatBtnImg" />
      </span>
    </button>
  );

  const authModal = showGuestAuth ? (
    <div className="mbAuthOverlay" onClick={() => setShowGuestAuth(false)}>
      <div className="mbAuthBox" onClick={(e) => e.stopPropagation()}>
<LoginBox
  mode="user"
  referralCode={refCode || ""}
  onLoggedIn={async () => {
    setShowGuestAuth(false);
    await onUserLoggedIn?.();
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

  if (activeKey !== "home") {
    return (
      <>
        <div className="mbHome mbHome--inner">
          {renderContent()}
          {homeFloatButton}
          {renderBottomNav()}
        </div>
        {authModal}
      </>
    );
  }

  return (
    <>
      <div className="mbHome">
        <div className="mbHomeScroll">
          <section className="mbHeroCard">
            <div className="mbBannerSlider" ref={bannerTrackRef} onScroll={handleBannerScroll}>
{banners.map((src, idx) => (
  <div className="mbBannerSlide" key={idx}>
    <img
      src={src}
      alt={`Banner ${idx + 1}`}
      className="mbBannerImg"
      draggable="false"
    />
  </div>
))}
            </div>

            <div className="mbBannerDots">
              {banners.map((_, idx) => (
                <button
                  key={idx}
                  className={idx === bannerIndex ? "active" : ""}
                  onClick={() => goBanner(idx)}
                  type="button"
                  aria-label={`切換 Banner ${idx + 1}`}
                />
              ))}
            </div>
          </section>

          <section className="mbNoticeBlock">
            <span className="mbNoticeIcon">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 10v4h4l7 5V5l-7 5H4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M18 9c1 1 1 5 0 6M20.5 6.5c2.4 2.8 2.4 8.2 0 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </span>
            <div className="mbNoticeTrack">
              <div className="mbNoticeMarquee">
                系統公告：5/20 系統維護完成，部分功能已優化升級！
              </div>
            </div>
          </section>

<section className="mbInfoPanel">
  <div className="mbInfoActions">
    {!isGuest ? (
      <>
        <button className="mbInfoBtn" type="button" onClick={() => handleGo("my")}>
          我的
        </button>
        <button className="mbInfoBtn" type="button" onClick={onLogout}>
          登出
        </button>
      </>
    ) : (
      <>
        <button
          className="mbInfoBtn"
          type="button"
          onClick={() => setShowGuestAuth(true)}
        >
          登入
        </button>
<button
  className="mbInfoBtn"
  type="button"
  onClick={() => setShowGuestAuth(true)}
>
  註冊
</button>
      </>
    )}
  </div>

  <div className="mbInfoStats">
    <button className="mbInfoStatItem" type="button" onClick={() => handleGo("my")}>
      <span>福利金額</span>
      <strong>{money(me?.user?.welfare_balance)}</strong>
    </button>

    <button className="mbInfoStatItem" type="button" onClick={() => handleGo("my")}>
      <span>折抵金</span>
      <strong>{money(me?.user?.discount_balance)}</strong>
    </button>

    <button className="mbInfoStatItem wide" type="button" onClick={() => handleGo("my")}>
      <span>S幣餘額</span>
      <strong>{money(me?.user?.s_balance)}</strong>
    </button>
  </div>
</section>

          <section className="mbSectionHead">
            <div>
              <span></span>
              <strong>AI 專區</strong>
            </div>
          </section>

<section className="mbAiGrid">
  <button
    className="mbAiCard cyan"
    type="button"
    onClick={() => alert("尚在開發中")}
  >
    <TechIcon type="baccarat" />
    <strong>百家樂</strong>
  </button>

  <button
    className="mbAiCard violet"
    type="button"
    onClick={() => alert("尚在開發中")}
  >
    <TechIcon type="sports" />
    <strong>運彩</strong>
  </button>

<button
  className="mbAiCard blue"
  type="button"
  onClick={() => handleGo("electronicRoom")}
>
<span className="mbAiFlameBadge" aria-hidden="true">
  <span className="mbAiFlameGlow" />

  <svg className="mbAiFlameIcon" viewBox="0 0 64 64" fill="none">
    <defs>
      <linearGradient id="mbAiFlameGradRed" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fff3b0" />
        <stop offset="35%" stopColor="#ffb347" />
        <stop offset="70%" stopColor="#ff5a36" />
        <stop offset="100%" stopColor="#ff1f1f" />
      </linearGradient>
    </defs>

    <path
      d="M36 8c2 8-2 12-6 17-4 4-8 8-8 15 0 8 6 14 14 14s14-6 14-14c0-10-7-14-9-22-1 3-3 5-5 8 1-8-3-13-7-18h-3Z"
      fill="url(#mbAiFlameGradRed)"
    />
    <path
      d="M33 26c1 5-2 7-4 10-2 2-3 4-3 7 0 5 4 9 9 9s9-4 9-9c0-6-4-9-6-13-1 2-2 3-3 5 0-4-2-7-5-9h3Z"
      fill="rgba(255,255,255,0.28)"
    />
  </svg>

  <span className="mbAiFlameCount">{electronicBadgeNumber}</span>
</span>

  <TechIcon type="game" />
  <strong>電子老虎機</strong>
</button>
</section>

<section className="mbFeatureGrid">
  <button className="mbFeatureCard red" type="button" onClick={() => handleGo("treasure")}>
    <TechIcon type="treasure" />
    <div>
      <strong>奪寶專區</strong>
      <span>紅包與輪盤活動</span>
    </div>
  </button>

  <button className="mbFeatureCard violet" type="button" onClick={() => handleGo("shop")}>
    <TechIcon type="shop" />
    <div>
      <strong>積分商城</strong>
      <span>電子積分商城</span>
    </div>
  </button>

  <button className="mbFeatureCard cyan" type="button" onClick={() => handleGo("invite")}>
    <TechIcon type="invite" />
    <div>
      <strong>邀請好友</strong>
      <span>好友邀請獎勵</span>
    </div>
  </button>

  <button className="mbFeatureCard blue" type="button" onClick={() => handleGo("records")}>
    <TechIcon type="record" />
    <div>
      <strong>抽獎紀錄</strong>
      <span>查看中獎明細</span>
    </div>
  </button>
</section>
        </div>

        {homeFloatButton}
        {renderBottomNav()}
      </div>

      {authModal}
    </>
  );
}

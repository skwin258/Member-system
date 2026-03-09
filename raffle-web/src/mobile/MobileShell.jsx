import React, { useMemo, useRef, useState, useEffect } from "react";
import "./mobileShell.css";
import MobilePageFrame from "./MobilePageFrame.jsx";
import LoginBox from "../LoginBox";
import RegisterModal from "../components/RegisterModal.jsx";

import MobilePromoPage from "./MobilePromoPage.jsx";
import TreasurePage from "./MobileTreasurePage.jsx";
import MobileRecordsPage from "./MobileRecordsPage.jsx";
import SupportPage from "../pages/front/SupportPage.jsx";
import MobileShopPage from "./MobileShopPage.jsx";
import InvitePage from "../pages/front/InvitePage.jsx";
import MobileMyPage from "./MobileMyPage.jsx";

import promoImg from "../assets/mobile-home/PromoPage.png";
import treasureImg from "../assets/mobile-home/TreasurePage.png";
import recordsImg from "../assets/mobile-home/RecordsPage.png";
import supportImg from "../assets/mobile-home/SupportPage.png";
import shopImg from "../assets/mobile-home/ShopPage.png";
import inviteImg from "../assets/mobile-home/InvitePage.png";

function BottomNavIcon({ type, active = false }) {
  const cls = active ? "mbBottomSvg isActive" : "mbBottomSvg";

  if (type === "promo") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7.5c0-1.38 1.12-2.5 2.5-2.5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M7 9h10M7 12h10M7 15h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    );
  }

  if (type === "support") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 18v2M8.5 20h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M7.5 14.5A6.5 6.5 0 1 1 18 9.4c0 1.7-.65 3.25-1.72 4.4-.53.57-.78 1.05-.78 1.7H8.5c0-.65-.25-1.13-.78-1.7A6.47 6.47 0 0 1 7.5 14.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    );
  }

  if (type === "records") {
    return (
      <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 4.5V7M17 4.5V7M5.5 8.5h13M6.5 5.5h11A1.5 1.5 0 0 1 19 7v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18V7a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M9 12h6M9 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    );
  }

  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M5 19.5a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
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
  const [showRegister, setShowRegister] = useState(false);

  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTrackRef = useRef(null);

  const banners = ["/img/BANNER1.png", "/img/BANNER2.png", "/img/BANNER3.png"];

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

  // ✅ 修正：只要是訪客且網址/外層有推薦碼，就自動打開註冊視窗
  useEffect(() => {
    if (!isGuest) return;

    const code = String(refCode || "").trim();
    if (!code) return;

    setShowRegister(true);
  }, [isGuest, refCode]);

  const menu = useMemo(
    () => [
      { key: "promo", title: "活動", guestAllowed: true },
      { key: "treasure", title: "奪寶", guestAllowed: true },
      { key: "records", title: "紀錄", guestAllowed: false },
      { key: "support", title: "客服", guestAllowed: true },
      { key: "shop", title: "商城", guestAllowed: true },
      { key: "invite", title: "邀請", guestAllowed: false },
      { key: "my", title: "我的", guestAllowed: false },
    ],
    []
  );

  const cards = [
    { key: "promo", title: "活動公告", sub: "最新優惠資訊", badge: "HOT", image: promoImg },
    { key: "treasure", title: "奪寶專區", sub: "紅包 / 輪盤", badge: "GO", image: treasureImg },
    { key: "records", title: "抽獎紀錄", sub: "查看中獎明細", badge: "LOG", image: recordsImg },
    { key: "support", title: "聯絡客服", sub: "快速處理問題", badge: "HELP", image: supportImg },
    { key: "shop", title: "積分商城", sub: "商品兌換專區", badge: "SHOP", image: shopImg },
    { key: "invite", title: "邀請朋友", sub: "推廣獎勵入口", badge: "NEW", image: inviteImg },
    { key: "my", title: "我的中心", sub: "個人資料錢包", badge: "ME" },
  ];

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
      <img src="/img/scoin.png" alt="S Coin" className="mbFloatBtnImg" />
    </button>
  );

  if (activeKey !== "home") {
    return (
      <>
        <div className="mbHome mbHome--inner">
          {renderContent()}
          {homeFloatButton}
          {renderBottomNav()}
        </div>

        {showGuestAuth ? (
          <div
            onClick={() => setShowGuestAuth(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.58)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 420,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <LoginBox
                mode="user"
                onLoggedIn={async () => {
                  setShowGuestAuth(false);
                  await onUserLoggedIn?.();
                }}
              />
            </div>
          </div>
        ) : null}

        <RegisterModal
          open={showRegister}
          apiBase={import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787"}
          referralCode={refCode || ""}
          onClose={() => setShowRegister(false)}
          onSuccess={() => {
            setShowRegister(false);
            window.location.href = "/";
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="mbHome">
        <div className="mbTopArea">
          <div className="mbBannerBlock">
            <div className="mbBannerSlider" ref={bannerTrackRef} onScroll={handleBannerScroll}>
              {banners.map((src, idx) => (
                <div className="mbBannerSlide" key={idx}>
                  <img src={src} alt={`Banner ${idx + 1}`} className="mbBannerImg" />
                </div>
              ))}
            </div>

            <div className="mbBannerDots">
              {banners.map((_, idx) => (
                <span
                  key={idx}
                  className={idx === bannerIndex ? "active" : ""}
                  onClick={() => goBanner(idx)}
                />
              ))}
            </div>
          </div>

          <div className="mbNoticeBlock">
            <span className="mbNoticeIcon">📢</span>
            <div className="mbNoticeTrack">
              <div className="mbNoticeMarquee">
                平台會即時顯示各項抽獎活動的最新中獎紀錄，並持續更新得獎資訊，讓所有玩家都能清楚掌握目前的得獎動態。
              </div>
            </div>
          </div>

          <div className="mbInfoBlock">
            <div className="mbInfoActions">
              {!isGuest ? (
                <>
                  <button className="mbInfoBtn" type="button" onClick={() => handleGo("my")}>
                    我的
                  </button>
                  <button className="mbInfoBtn ghost" type="button" onClick={onLogout}>
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
                    className="mbInfoBtn ghost"
                    type="button"
                    onClick={() => setShowRegister(true)}
                  >
                    註冊
                  </button>
                </>
              )}
            </div>

            <div className="mbInfoStats">
              <div className="mbStatItem">
                <span className="mbStatLabel">福利金額</span>
                <strong className="mbStatValue">{me?.user?.welfare_balance ?? 0}</strong>
              </div>

              <div className="mbStatItem">
                <span className="mbStatLabel">折抵金</span>
                <strong className="mbStatValue">{me?.user?.discount_balance ?? 0}</strong>
              </div>

              <div className="mbStatItem">
                <span className="mbStatLabel">S幣餘額</span>
                <strong className="mbStatValue">{me?.user?.s_balance ?? 0}</strong>
              </div>
            </div>
          </div>
        </div>

        <div className="mbCardGridWrap">
          <div className="mbCardGrid">
            {cards.map((card) => (
              <button
                key={card.key}
                type="button"
                className="mbMiniCard"
                onClick={() => handleGo(card.key)}
              >
                <div className="mbMiniBadge">{card.badge}</div>

                <div className="mbMiniContent">
                  <div className="mbMiniTitle">{card.title}</div>
                  <div className="mbMiniSub">{card.sub}</div>
                </div>

                {card.image ? (
                  <img
                    src={card.image}
                    alt={card.title}
                    className="mbMiniCardImg"
                    loading="lazy"
                  />
                ) : null}

                <div className="mbMiniGlow" />
              </button>
            ))}
          </div>
        </div>

        {homeFloatButton}
        {renderBottomNav()}
      </div>

      {showGuestAuth ? (
        <div
          onClick={() => setShowGuestAuth(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.58)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 420,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <LoginBox
              mode="user"
              onLoggedIn={async () => {
                setShowGuestAuth(false);
                await onUserLoggedIn?.();
              }}
            />
          </div>
        </div>
      ) : null}

      <RegisterModal
        open={showRegister}
        apiBase={import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787"}
        referralCode={refCode || ""}
        onClose={() => setShowRegister(false)}
        onSuccess={() => {
          setShowRegister(false);
          window.location.href = "/";
        }}
      />
    </>
  );
}
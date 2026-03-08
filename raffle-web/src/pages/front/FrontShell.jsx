// raffle-web/src/pages/front/FrontShell.jsx
import React, { useMemo, useState } from "react";
import "./frontShell.css";

import LoginBox from "../../LoginBox";
import RegisterModal from "../../components/RegisterModal.jsx";

import PromoPage from "./PromoPage.jsx";
import TreasurePage from "./TreasurePage.jsx";
import RecordsPage from "./RecordsPage.jsx";
import SupportPage from "./SupportPage.jsx";
import ShopPage from "./ShopPage.jsx";
import InvitePage from "./InvitePage.jsx";
import MyPage from "./MyPage.jsx";

function TreasureTabs({ value, onChange }) {
  const items = [
    { k: "redpacket", t: "紅包" },
    { k: "wheel", t: "輪盤" },
    { k: "number", t: "數字" },
    { k: "scratch", t: "刮刮樂" },
    { k: "dice", t: "骰子" },
  ];

  const btnBase = {
    height: 38,
    padding: "0 30px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.82)",
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer",
    lineHeight: "38px",
    transition: "all .15s ease",
    whiteSpace: "nowrap",
  };

  const btnActive = {
    ...btnBase,
    border: "1px solid rgba(255,70,70,0.55)",
    background: "rgba(255,70,70,0.14)",
    color: "#ff4d4d",
    boxShadow: "0 0 0 2px rgba(255,70,70,0.08) inset",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginLeft: 10,
        transform: "translateY(-1px)",
      }}
    >
      {items.map((it) => {
        const active = value === it.k;

        return (
          <button
            key={it.k}
            type="button"
            onClick={() => onChange(it.k)}
            style={active ? btnActive : btnBase}
            onMouseEnter={(e) => {
              if (active) return;
              e.currentTarget.style.background = "rgba(255,255,255,0.09)";
            }}
            onMouseLeave={(e) => {
              if (active) return;
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            }}
          >
            {it.t}
          </button>
        );
      })}
    </div>
  );
}

function GuestLoginCard({ onLoginSuccess }) {
  return <LoginBox mode="user" onLoggedIn={onLoginSuccess} compact />;
}

export default function FrontShell({
  me,
  activities,
  loading,
  onRefresh,
  onRefreshMe,
  onRefreshActivities,
  onLogout,
  isGuest = false,
  refCode = null,
  onUserLoggedIn,
}) {
  const u = me?.user || {};
  const limits = me?.limits || {};
  const used = me?.used || {};

  const menu = useMemo(
    () => [
      { key: "promo", title: "活動公告", desc: "抽獎說明/任務/平台優惠",guestAllowed: true },
      { key: "treasure", title: "奪寶", desc: "紅包/輪盤/數字抽獎", guestAllowed: true },
      { key: "records", title: "抽獎紀錄", desc: "中獎清單與明細", guestAllowed: false },
      { key: "support", title: "聯絡客服", desc: "客服/常見問題", guestAllowed: true },
      { key: "shop", title: "商城", desc: "兌換/商品/點數", guestAllowed: true },
      { key: "invite", title: "邀請朋友", desc: "分享連結/邀請碼", guestAllowed: false },
      { key: "my", title: "我的", desc: "帳號資訊/授權/狀態", guestAllowed: false },
    ],
    []
  );

  const [activeKey, setActiveKey] = useState("treasure");
  const [recordsView, setRecordsView] = useState("raffle");
  const [treasureTab, setTreasureTab] = useState("redpacket");

  const [showGuestAuth, setShowGuestAuth] = useState(false);
  const [showRegister, setShowRegister] = useState(false);

  const titleMap = {
    promo: "優惠內容",
    treasure: "奪寶",
    records: "抽獎紀錄",
    support: "聯絡客服",
    shop: "商城",
    invite: "邀請朋友",
    my: "我的",
  };

  const subMap = {
    promo: "活動與福利資訊",
    records: "查詢中獎紀錄與明細",
    support: "客服支援與常見問題",
    shop: "商品與兌換功能",
    invite: "邀請朋友加入",
    my: "帳號與權限資訊",
  };

  function needLogin() {
    alert("請先登入");
    setShowGuestAuth(true);
  }

  function handleMenuClick(m) {
    if (isGuest && !m.guestAllowed) {
      needLogin();
      return;
    }
    setActiveKey(m.key);
  }

  function renderContent() {
    if (activeKey === "promo") return <PromoPage me={me} />;

    if (activeKey === "treasure") {
      return (
        <TreasurePage
          me={me}
          activities={activities}
          onRefreshMe={onRefreshMe || onRefresh}
          tab={treasureTab}
          onTabChange={setTreasureTab}
          isGuest={isGuest}
          onNeedLogin={needLogin}
        />
      );
    }

    if (activeKey === "records") {
      if (isGuest) return null;
      return <RecordsPage me={me} initialView={recordsView} />;
    }

    if (activeKey === "support") return <SupportPage me={me} />;

    if (activeKey === "shop") {
      return (
        <ShopPage
          me={me}
          onRefreshMe={onRefreshMe || onRefresh}
          isGuest={isGuest}
          onNeedLogin={needLogin}
          onOpenRedeemRecords={() => {
            if (isGuest) {
              needLogin();
              return;
            }
            setRecordsView("redeem");
            setActiveKey("records");
          }}
        />
      );
    }

    if (activeKey === "invite") {
      if (isGuest) return null;
      return <InvitePage me={me} />;
    }

    if (activeKey === "my") {
      if (isGuest) return null;
      return <MyPage me={me} onRefreshMe={onRefreshMe || onRefresh} goPage={setActiveKey} />;
    }

    return null;
  }

  return (
    <>
      <div className="frontApp">
        <aside className="frontSidebar">
          <div className="frontBrand">
            <img src="/SKLOGO.png" alt="logo" className="frontLogo" draggable="false" />
          </div>

          <div className="frontMenu">
            {menu.map((m) => (
              <button
                key={m.key}
                className={"frontMenuBtn " + (activeKey === m.key ? "frontMenuBtnActive" : "")}
                onClick={() => handleMenuClick(m)}
              >
                <div className="frontMenuTitle">{m.title}</div>
                <div className="frontMenuDesc">{m.desc}</div>
              </button>
            ))}
          </div>

          <div className="frontSidebarFooter">
            {isGuest ? (
              <GuestLoginCard
                onLoginSuccess={async () => {
                  setShowGuestAuth(false);
                  await onUserLoggedIn?.();
                }}
              />
            ) : (
              <div className="frontUserCard">
                <div className="frontUserName">{u.display_name || u.username}</div>

                <div className="frontUserMeta">
                  <div>S幣：{Number(u.s_balance || 0)}</div>
                  <div>福利金額：{Number(u.welfare_balance || 0)}</div>
                  <div>折抵金：{Number(u.discount_balance || 0)}</div>
                  <div>
                    紅包：{used.redpacket ?? 0}/{limits.redpacket ?? 0}
                  </div>
                  <div>
                    輪盤：{used.wheel ?? 0}/{limits.wheel ?? 0}
                  </div>
                  <div>
                    數字：{used.number ?? 0}/{limits.number ?? 0}
                  </div>
                </div>
              </div>
            )}

            <div className="frontFooterBtns">
              {!isGuest && (
                <>
                  <button className="frontBtn" onClick={onRefresh} disabled={loading}>
                    {loading ? "刷新中..." : "刷新"}
                  </button>

                  <button className="frontBtn" onClick={onLogout}>
                    登出
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>

        <main className={`frontMain frontMain--${activeKey}`}>
          <div className="frontTopbar">
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div className="frontTopbarTitle">{titleMap[activeKey] || "—"}</div>
                {activeKey === "treasure" && (
                  <TreasureTabs value={treasureTab} onChange={setTreasureTab} />
                )}
              </div>

              <div className="frontTopbarSub">{subMap[activeKey] || ""}</div>
            </div>

            <div className="frontPills">
              <div className="frontPill">LIVE</div>
              <div className="frontPill">User: {isGuest ? "guest" : u.username}</div>
            </div>
          </div>

          <div className={`frontContent frontContent--${activeKey}`}>{renderContent()}</div>
        </main>
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
    maxWidth: 520,
    display: "flex",
    justifyContent: "center",
    transform: "scale(1.35)",
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
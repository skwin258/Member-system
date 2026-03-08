// raffle-web/src/pages/admin/AdminShell.jsx
import React, { useMemo } from "react";
import "./adminShell.css";

export default function AdminShell({
  title = "Admin Console",
  subtitle = "Control Center",
  role = "admin",
  adminName = "Admin",
  activeKey = "dashboard",
  onNav,
  onLogout,
  children,
}) {
  const nav = useMemo(
    () => [
      { key: "dashboard", label: "總覽", icon: "📡" },
      { key: "activities", label: "活動管理", icon: "🧩" },
      { key: "winners", label: "中獎名單", icon: "🏆" },
      { key: "users", label: "使用者", icon: "👥" },
      { key: "admins", label: "管理員", icon: "🛡️" },
      { key: "prizes", label: "獎項/機率", icon: "🎯" },
      { key: "settings", label: "系統設定", icon: "⚙️" },
    ],
    []
  );

  const roleText = role === "superadmin" ? "SUPER ADMIN" : "ADMIN";

  return (
    <div className="adminShell">
      {/* LEFT NAV */}
      <aside className="adminNav">
        <div className="brand">
          <div className="brandDot" />
          <div className="brandText">
            <div className="brandTitle">{title}</div>
            <div className="brandSub">{subtitle}</div>
          </div>
        </div>

        <div className="navGroup">
          {nav.map((n) => (
            <button
              key={n.key}
              className={`navBtn ${activeKey === n.key ? "active" : ""}`}
              onClick={() => onNav?.(n.key)}
            >
              <span className="navIcon">{n.icon}</span>
              <span className="navLabel">{n.label}</span>
              <span className="navGlow" />
            </button>
          ))}
        </div>

        <div className="navFooter">
          <div className="userCard">
            <div className="userAvatar">{(adminName || "A").slice(0, 1).toUpperCase()}</div>
            <div className="userMeta">
              <div className="userName">{adminName}</div>
              <div className={`roleBadge ${role === "superadmin" ? "super" : ""}`}>{roleText}</div>
            </div>
          </div>

          <button className="logoutBtn" onClick={onLogout}>
            登出
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main className="adminMain">
        <div className="topbar">
          <div className="topbarLeft">
            <div className="topTitle">{nav.find((x) => x.key === activeKey)?.label || "後台"}</div>
            <div className="topHint">科技感管理介面｜清楚分區｜快速入口</div>
          </div>

          <div className="topbarRight">
            <div className="chip">
              <span className="chipDot" />
              <span>LIVE</span>
            </div>
            <div className="chip subtle">API: Connected</div>
          </div>
        </div>

        <div className="content">{children}</div>
      </main>
    </div>
  );
}
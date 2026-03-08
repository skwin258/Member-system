// raffle-web/src/pages/AdminDashboard.jsx
import React, { useMemo, useState } from "react";
import "./admin/adminShell.css";

import AdminActivitySettings from "./admin/AdminActivitySettings.jsx";
import AdminPrizeSettings from "./admin/AdminPrizeSettings.jsx";
import AdminUserControl from "./admin/AdminUserControl.jsx";
import AdminUsers from "./admin/AdminUsers.jsx";
import AdminCreateUser from "./admin/AdminCreateUser.jsx";
import AdminAdminRoles from "./admin/AdminAdminRoles.jsx";
import AdminWinners from "./admin/AdminWinners.jsx";
import AdminChangePassword from "./admin/AdminChangePassword.jsx";
import AdminPromotions from "./admin/AdminPromotions.jsx";
import AdminShopPage from "./admin/AdminShopPage.jsx";

function isAdminPath() {
  const p = window.location.pathname || "/";
  const h = window.location.hash || "";
  if (p.toLowerCase().startsWith("/admin")) return true;
  if (h.toLowerCase().startsWith("#/admin")) return true;
  return false;
}

export default function AdminDashboard({ adminMe, onAdminLogout }) {
  if (!isAdminPath()) {
    window.location.href = "/";
    return null;
  }

  const role =
    adminMe?.role ||
    adminMe?.admin?.role ||
    adminMe?.user?.role ||
    (adminMe?.admin?.is_superadmin ? "superadmin" : "admin") ||
    "admin";

  const isSuper = String(role).toLowerCase() === "superadmin";

  const adminName =
    adminMe?.admin?.username ||
    adminMe?.admin?.display_name ||
    adminMe?.user?.username ||
    "admin";

  const TABS = useMemo(
    () => [
      { key: "activity", title: "活動設定", desc: "活動時間・狀態與開關" },
      { key: "prizes", title: "獎項設定", desc: "獎率/獎項/輪盤設定" },
      { key: "users", title: "使用者控制", desc: "授權/停用/用量管理" },
      { key: "createUser", title: "新增使用者", desc: "建立帳號與初始權限" },
      { key: "promotions", title: "新增優惠", desc: "優惠圖/內容管理" },
      { key: "shop", title: "商城管理", desc: "跑馬燈/商品列表管理" },
      { key: "admins", title: "管理員權限", desc: "新增管理員/角色管理", superOnly: true },
      { key: "winners", title: "中獎資訊", desc: "查詢中獎紀錄與名單" },
      { key: "password", title: "修改密碼", desc: "管理員帳密更新" },
    ],
    []
  );

  const visibleTabs = useMemo(
    () => TABS.filter((t) => !t.superOnly || isSuper),
    [TABS, isSuper]
  );

  const [tab, setTab] = useState(visibleTabs[0]?.key || "activity");

  React.useEffect(() => {
    const ok = visibleTabs.some((t) => t.key === tab);
    if (!ok) setTab(visibleTabs[0]?.key || "activity");
  }, [tab, visibleTabs]);

  const currentTab = visibleTabs.find((t) => t.key === tab);

  const NavBtn = ({ active, title, desc, onClick }) => (
    <button
      className={active ? "ra-navBtn ra-navBtnActive" : "ra-navBtn"}
      onClick={onClick}
    >
      <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>
        {title}
      </div>
      <div style={{ opacity: 0.75, fontSize: 12, marginTop: 4 }}>{desc}</div>
    </button>
  );

  return (
    <div className="ra-adminShell">
      {/* 左側 */}
      <aside className="ra-adminSidebar">
        <div className="ra-brandCard">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="ra-liveDot" />
            <div>
              <div style={{ fontWeight: 1000, letterSpacing: 0.5 }}>
                SK管理後台
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                SK management background
              </div>
            </div>
          </div>
        </div>

        <div className="ra-nav">
          {visibleTabs.map((t) => (
            <NavBtn
              key={t.key}
              active={tab === t.key}
              title={t.title}
              desc={t.desc}
              onClick={() => setTab(t.key)}
            />
          ))}
        </div>

        <div className="ra-sideFooter">
          <div className="ra-userCard">
            <div className="ra-avatar">
              {String(adminName || "A").slice(0, 1).toUpperCase()}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900 }}>{adminName}</div>

              <div style={{ marginTop: 6 }}>
                <span className="ra-pill">
                  {isSuper ? "SUPER ADMIN" : "ADMIN"}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            <button
              className="ra-btn ra-btnGhost"
              onClick={() => (window.location.href = "/")}
            >
              返回前台
            </button>

            <button className="ra-btn" onClick={() => onAdminLogout?.()}>
              登出
            </button>
          </div>
        </div>
      </aside>

      {/* 右側 */}
      <main className="ra-adminMain">
        <div className="ra-topBar">
          <div>
            <div style={{ fontSize: 18, fontWeight: 1000 }}>
              {currentTab?.title || "控制台"}
            </div>

            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              科技感後台｜左側分頁｜內容區可捲動
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ra-pill">
              <span
                className="ra-liveDot"
                style={{ width: 6, height: 6 }}
              />
              LIVE
            </span>

            <span className="ra-pill">
              API:{" "}
              {import.meta.env.VITE_API_BASE ||
                "http://127.0.0.1:8787"}
            </span>
          </div>
        </div>

        <section className="ra-contentScroll">
          {tab === "activity" && <AdminActivitySettings adminMe={adminMe} />}

          {tab === "prizes" && <AdminPrizeSettings adminMe={adminMe} />}

          {tab === "users" && <AdminUserControl adminMe={adminMe} />}

          {tab === "usersWallet" && <AdminUsers adminMe={adminMe} />}

          {tab === "createUser" && <AdminCreateUser adminMe={adminMe} />}

          {tab === "promotions" && <AdminPromotions adminMe={adminMe} />}

          {tab === "shop" && <AdminShopPage adminMe={adminMe} />}

          {tab === "admins" && isSuper && (
            <AdminAdminRoles adminMe={adminMe} />
          )}

          {tab === "winners" && <AdminWinners adminMe={adminMe} />}

          {tab === "password" && (
            <AdminChangePassword adminMe={adminMe} />
          )}
        </section>
      </main>
    </div>
  );
}
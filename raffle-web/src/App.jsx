import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LoginBox from "./LoginBox";
import {
  api,
  clearToken,
  getToken,
  getAdminToken,
  setAdminToken,
  clearAdminToken,
} from "./api";

import AdminDashboard from "./pages/AdminDashboard.jsx";
import FrontShell from "./pages/front/FrontShell.jsx";
import RegisterModal from "./components/RegisterModal.jsx";

function isAdminPath() {
  const p = window.location.pathname || "/";
  const h = window.location.hash || "";
  if (p.toLowerCase().startsWith("/admin")) return true;
  if (h.toLowerCase().startsWith("#/admin")) return true;
  return false;
}

function isLikelyRefCode(code) {
  return /^[a-f0-9]{8,16}$/i.test(String(code || ""));
}

function getRefCodeFromPath() {
  const p = window.location.pathname || "/";
  if (!p || p === "/") return null;

  const segs = p.split("/").filter(Boolean);
  if (segs[0]?.toLowerCase() === "register") {
    const code = segs[1] || "";
    return isLikelyRefCode(code) ? code : null;
  }

  const seg = segs[0] || "";
  if (!seg) return null;

  const lower = seg.toLowerCase();
  const reserved = new Set(["admin", "login", "logout", "register", "api"]);
  if (reserved.has(lower)) return null;

  return isLikelyRefCode(seg) ? seg : null;
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);

  const [adminReady, setAdminReady] = useState(false);
  const [adminMe, setAdminMe] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const bootedRef = useRef(false);

  const refCode = useMemo(() => {
    if (isAdminPath()) return null;
    return getRefCodeFromPath();
  }, []);

  const refreshMeOnly = useCallback(async ({ silent = true, force = false } = {}) => {
    if (isAdminPath()) return null;
    if (!getToken()) {
      setMe(null);
      return null;
    }

    try {
      if (!silent) setLoading(true);
      const meRes = await api.me({ force });
      if (meRes?.success) {
        setMe(meRes);
        return meRes;
      }

      if (
        meRes?.status === 401 ||
        /unauthorized|invalid token|missing token/i.test(String(meRes?.error || ""))
      ) {
        clearToken();
        setMe(null);
      }
      return meRes;
    } catch (_) {
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshActivitiesOnly = useCallback(async ({ silent = true, force = false } = {}) => {
    if (isAdminPath()) return null;
    try {
      if (!silent) setLoading(true);
      const actRes = await api.activities({ force });
      if (actRes?.success) setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
      else setActivities([]);
      return actRes;
    } catch (_) {
      setActivities([]);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async ({ silent = false, force = false } = {}) => {
    if (isAdminPath()) return;
    try {
      if (!silent) setLoading(true);

      if (getToken()) {
        const [meRes, actRes] = await Promise.all([
          api.me({ force }),
          api.activities({ force }),
        ]);
        if (meRes?.success) setMe(meRes);
        else {
          clearToken();
          setMe(null);
        }
        if (actRes?.success) setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
        else setActivities([]);
      } else {
        setMe(null);
        const actRes = await api.activities({ force });
        if (actRes?.success) setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
        else setActivities([]);
      }
    } finally {
      if (!silent) setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (isAdminPath()) return;
    const t = getToken();
    if (!t) return;
    if (!me?.success) return;

    const timer = setInterval(() => {
      refreshMeOnly({ silent: true, force: true });
    }, 30000);

    return () => clearInterval(timer);
  }, [me?.user?.id, me?.success, refreshMeOnly]);

  const loadAdmin = useCallback(async () => {
    try {
      setAdminLoading(true);
      const res = await api.adminMe();
      if (!res?.success) throw new Error(res?.error || "admin me failed");
      setAdminMe(res);
    } catch (e) {
      clearAdminToken();
      setAdminMe(null);
      alert("後台請重新登入：" + (e?.message || String(e)));
    } finally {
      setAdminLoading(false);
      setAdminReady(true);
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    if (refCode) {
      refreshActivitiesOnly({ silent: false, force: true });
      setReady(true);
      return;
    }

    if (isAdminPath()) {
      if (getAdminToken()) loadAdmin();
      else {
        setAdminReady(true);
        setAdminMe(null);
      }
      return;
    }

    refreshAll({ silent: false, force: true });
  }, [loadAdmin, refCode, refreshActivitiesOnly, refreshAll]);

  if (isAdminPath()) {
    if (!adminReady) return null;

    if (!getAdminToken() || !adminMe) {
      return (
        <div style={{ padding: 40, fontFamily: "Arial" }}>
          <h1 style={{ marginBottom: 16 }}>🛡️ 管理端登入</h1>
          <LoginBox
            mode="admin"
            onLoggedIn={async (loginRes) => {
              const t = loginRes?.token || loginRes?.data?.token || loginRes?.access_token || "";
              if (!t) {
                alert("後台登入成功但沒有拿到 token（請確認 api.adminLogin 回傳 token）");
                return;
              }
              setAdminToken(t);
              await loadAdmin();
            }}
          />
          {adminLoading ? <div style={{ marginTop: 10 }}>載入中...</div> : null}
        </div>
      );
    }

    return (
      <AdminDashboard
        adminMe={adminMe}
        onAdminLogout={() => {
          clearAdminToken();
          setAdminMe(null);
          window.location.href = "/";
        }}
      />
    );
  }

  if (!ready) return null;

  return (
    <>
      <FrontShell
        me={me}
        activities={activities}
        loading={loading}
        isGuest={!getToken() || !me?.success}
        refCode={refCode}
        onRefresh={async () => {
          await refreshAll({ silent: false, force: true });
        }}
        onRefreshMe={async (opts = {}) => {
          await refreshMeOnly(opts);
        }}
        onRefreshActivities={async (opts = {}) => {
          await refreshActivitiesOnly(opts);
        }}
        onUserLoggedIn={async () => {
          await refreshAll({ silent: false, force: true });
        }}
        onLogout={() => {
          clearToken();
          setMe(null);
          window.location.href = "/";
        }}
      />

      <RegisterModal
        open={!!refCode}
        apiBase={import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787"}
        onClose={() => {
          window.location.href = "/";
        }}
        onSuccess={() => {
          window.location.href = "/";
        }}
      />
    </>
  );
}

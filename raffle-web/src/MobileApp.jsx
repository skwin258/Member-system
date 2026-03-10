import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, clearToken, getToken, touchUserActivity, isUserIdleExpired } from "./api";
import MobileShell from "./mobile/MobileShell.jsx";

function isLikelyRefCode(code) {
  return /^[a-zA-Z0-9_-]{4,32}$/.test(String(code || ""));
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

export default function MobileApp() {
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(false);
  const bootedRef = useRef(false);

  const refCode = useMemo(() => getRefCodeFromPath(), []);

  const refreshMeOnly = useCallback(async ({ silent = true, force = false } = {}) => {
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
    } catch (e) {
      console.error("MobileApp refreshMeOnly error:", e);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshActivitiesOnly = useCallback(async ({ silent = true, force = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const actRes = await api.activities({ force });
      if (actRes?.success) {
        setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
      } else {
        setActivities([]);
      }
      return actRes;
    } catch (e) {
      console.error("MobileApp refreshActivitiesOnly error:", e);
      setActivities([]);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async ({ silent = false, force = false } = {}) => {
    try {
      if (!silent) setLoading(true);

      if (getToken()) {
        const [meRes, actRes] = await Promise.all([
          api.me({ force }),
          api.activities({ force }),
        ]);

        if (meRes?.success) setMe(meRes);
        else setMe(null);

        if (actRes?.success) setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
        else setActivities([]);
      } else {
        setMe(null);
        const actRes = await api.activities({ force });
        if (actRes?.success) setActivities(Array.isArray(actRes.activities) ? actRes.activities : []);
        else setActivities([]);
      }
    } catch (e) {
      console.error("MobileApp refreshAll error:", e);
      if (getToken()) setMe(null);
      setActivities([]);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    refreshAll({ silent: false, force: true });
  }, [refreshAll]);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    if (!me?.success) return;

    const timer = setInterval(() => {
      refreshMeOnly({ silent: true, force: true });
    }, 30000);

    return () => clearInterval(timer);
  }, [me?.user?.id, me?.success, refreshMeOnly]);

  useEffect(() => {
    if (!getToken()) return;

    const markActive = () => touchUserActivity();
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    events.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));
    touchUserActivity();

    const timer = setInterval(() => {
      if (!getToken()) return;
      if (!isUserIdleExpired()) return;
      clearToken();
      setMe(null);
      window.alert("已超過 10 分鐘未操作，系統已自動登出");
    }, 5000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(timer);
    };
  }, [me?.success]);

if (!ready) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050d16",
        flexDirection: "column",
      }}
    >
      <img
        src="/cat-loading.webp"
        alt="loading"
        style={{
          width: "120px",
          height: "120px",
          objectFit: "contain",
        }}
      />

      <div
        style={{
          marginTop: "14px",
          color: "#fff",
          fontSize: "16px",
          fontWeight: "700",
          letterSpacing: "1px",
        }}
      >
        載入中...
      </div>
    </div>
  );
}

  return (
    <MobileShell
      me={me}
      activities={activities}
      loading={loading}
      isGuest={!getToken() || !me?.success}
      refCode={refCode}
      onUserLoggedIn={async () => {
        await refreshAll({ silent: false, force: true });
      }}
      onRefresh={async () => {
        await refreshAll({ silent: false, force: true });
      }}
      onRefreshMe={async (opts = {}) => {
        await refreshMeOnly(opts);
      }}
      onRefreshActivities={async (opts = {}) => {
        await refreshActivitiesOnly(opts);
      }}
      onLogout={() => {
        clearToken();
        setMe(null);
        window.location.href = "/";
      }}
    />
  );
}

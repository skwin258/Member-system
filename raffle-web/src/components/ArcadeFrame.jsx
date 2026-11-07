import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { api, getToken } from "../api";
import { API_BASE } from "../config";

const isLocalPreview = ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname);
const arcadeUrl = new URL(
  import.meta.env.VITE_ARCADE_URL || (isLocalPreview ? "http://127.0.0.1:5173/" : "/arcade/"),
  window.location.href,
);
const actions = {
  checkLogin: () => ({ success: true }),
  settings: () => api.arcadeSettings(),
  round: async (game, action, body) => {
    if (!["numbers", "reaction", "claw"].includes(game) || !["prepare", "start", "signal", "finish"].includes(action)) {
      return { success: false, status: 400, error: "這個遊戲操作不受支援，請重新整理會員頁面。" };
    }
    const result = await api.arcadeRound(game, action, body);
    if (action === "prepare" && result?.status === 428) {
      const challengeUrl = new URL(`${API_BASE}/arcade/challenge?game=${game}`, window.location.href);
      return { ...result, challengeUrl: challengeUrl.href };
    }
    return result;
  },
  player: async () => {
    const result = await api.me({ force: true });
    if (!result?.success) return result;
    const { username, s_balance, sc_balance, sc_claimed_today } = result.user;
    return { success: true, user: { username, s_balance, sc_balance, sc_claimed_today }, limits: result.limits, used: result.used, daily: result.daily };
  },
  claimDailySc: async () => {
    const result = await api.claimDailySc();
    if (!result?.success) return result;
    return { success: true, sc_balance: result.user.sc_balance };
  },
  redpacketClaim: () => api.redpacketClaim(),
  redpacketDraw: () => api.redpacketDraw(),
  redpacketHistory: () => api.redpacketHistory({ force: true }),
  wheelPrizes: () => api.wheelPrizes(),
  wheelSpin: () => api.wheelSpin(),
  wheelHistory: () => api.wheelHistory({ force: true }),
  footballConfig: () => api.footballConfig({ force: true }),
  footballStartShoot: (bet, id) => api.footballStartShoot(bet, id),
  footballShoot: (id, step) => api.footballShoot(id, step),
  footballClaim: id => api.footballClaim(id),
};
const walletActions = new Set(["claimDailySc", "redpacketDraw", "wheelSpin", "footballStartShoot", "footballClaim"]);
const updatePending = "會員伺服器尚未更新此功能，目前無法使用。";
const loginRequired = { success: false, status: 401, error: "請先登入會員。" };

export default function ArcadeFrame({ ref, onWalletChange, onLoginRequired, loginOpen }) {
  const frame = useRef(null);
  const pendingBack = useRef(false);
  const loginPrompted = useRef(false);
  const [frameVersion, setFrameVersion] = useState(0);

  useImperativeHandle(ref, () => ({
    reset() {
      setFrameVersion(version => version + 1);
    },
    back(onLobby) {
      const child = frame.current?.contentWindow;
      if (!child || pendingBack.current) return;
      pendingBack.current = true;
      const channel = new MessageChannel();
      function finish() {
        clearTimeout(timeout);
        channel.port1.close();
        pendingBack.current = false;
      }
      const timeout = setTimeout(() => {
        finish();
        setFrameVersion(version => version + 1);
      }, 650);
      channel.port1.onmessage = ({ data: handled }) => {
        finish();
        if (handled === false) onLobby();
      };
      child.postMessage({ type: "skclub-arcade-back" }, arcadeUrl.origin, [channel.port2]);
    },
  }), []);

  useEffect(() => {
    if (!loginOpen) loginPrompted.current = false;
  }, [loginOpen]);

  useEffect(() => {
    async function handleRequest(event) {
      if (event.origin !== arcadeUrl.origin || event.source !== frame.current?.contentWindow) return;
      const { type, action, args } = event.data || {};
      const [port] = event.ports;
      if (!port || type !== "skclub-arcade" || !Object.hasOwn(actions, action) || !Array.isArray(args)) return;
      let result;
      try {
        const token = getToken();
        result = action !== "settings" && !token ? loginRequired : await actions[action](...args);
        if (action !== "settings" && result?.status === 401) {
          result = loginRequired;
          if (token === getToken() && !loginOpen && !loginPrompted.current) {
            loginPrompted.current = true;
            onLoginRequired();
          }
        }
        if (result?.status === 404 && ["round", "claimDailySc"].includes(action)) {
          result = { ...result, error: updatePending };
        }
        port.postMessage(result);
      } catch {
        port.postMessage({ success: false, error: "目前無法連線會員 API，請稍後重試。" });
      } finally {
        port.close();
      }
      if (result?.success && (walletActions.has(action) || (action === "round" && ["start", "finish"].includes(args[1])))) {
        try { await onWalletChange?.({ silent: true, force: true }); }
        catch { /* The game result already settled. */ }
      }
    }
    window.addEventListener("message", handleRequest);
    return () => window.removeEventListener("message", handleRequest);
  }, [loginOpen, onLoginRequired, onWalletChange]);

  return <iframe key={frameVersion} ref={frame} className="arcade-frame" title="SKClub 遊戲大廳" src={arcadeUrl.href} />;
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";

import redpacketImg from "./assets/redpacket.png";
import WinPopup from "./components/WinPopup";

// ✅ 五張圖
import winBig from "./assets/win_big.png";
import winSuper from "./assets/win_super.png";
import winMega from "./assets/win_mega.png";
import winUltra from "./assets/win_ultra.png";
import winLegendary from "./assets/win_legendary.png";

const HISTORY_LIMIT = 12;
const HISTORY_POLL_MS = 2000;

export default function RedPacketPage({ me, onBack, onRefreshMe }) {
  const [openingIndex, setOpeningIndex] = useState(null);
  const [winOpen, setWinOpen] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [busy, setBusy] = useState(false);

  const [winImg, setWinImg] = useState(winBig);
  const [winType, setWinType] = useState("big"); // big|super|mega|ultra|legendary

  // 右側紀錄
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 避免輪詢重複請求
  const loadingHistoryRef = useRef(false);

  /**
   * ✅ 後端回傳
   * limit：可抽上限
   * used：已抽次數
   */
  const limit = Number(me?.limits?.redpacket ?? 0);
  const used = Number(me?.used?.redpacket ?? 0);

  // ✅ 可抽剩餘 = limit - used
  const remaining = Math.max(0, limit - used);

  // ✅ 今日是否已領取（容錯）
  const claimedToday =
    Boolean(me?.daily?.redpacket_claimed) ||
    Boolean(me?.flags?.redpacket_claimed) ||
    Boolean(me?.claimed?.redpacket) ||
    false;

  // ✅ 是否可「領取」：每天一次，只做 +1 次數
  const canClaim = useMemo(() => {
    if (busy) return false;
    if (claimedToday) return false;
    return true;
  }, [busy, claimedToday]);

  // ✅ 是否可「抽紅包」：一定要 remaining > 0
  const canDraw = useMemo(() => {
    if (busy) return false;
    if (limit <= 0) return false;
    if (remaining <= 0) return false;
    return true;
  }, [busy, limit, remaining]);

  // 將各種可能欄位轉成可排序時間
  function getItemTs(it) {
    const raw =
      it?.created_at ||
      it?.createdAt ||
      it?.win_time ||
      it?.won_at ||
      it?.time ||
      it?.updated_at ||
      it?.id ||
      0;

    // 先試日期字串
    const dateTs = new Date(raw).getTime();
    if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

    // 再試數字
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) return num;

    return 0;
  }

  function maskAccount(account) {
  const s = String(account || "").trim();
  if (!s) return "使用者";

  // 兩碼頭 + 三星 + 一碼尾
  if (s.length >= 3) {
    return `${s.slice(0, 2)}***${s.slice(-1)}`;
  }

  // 太短就簡單處理
  if (s.length === 2) return `${s[0]}***${s[1]}`;
  if (s.length === 1) return `${s}***`;
  return "使用者";
}

  // 正規化歷史資料 + 排序 + 限制 12 筆
function normalizeHistory(items) {
  const arr = Array.isArray(items) ? items : [];

  return arr
    .map((it, idx) => ({
      id:
        it?.id ??
        it?.log_id ??
        it?.record_id ??
        `${it?.username || it?.name || "user"}-${it?.amount || 0}-${idx}`,
      username: it?.username || it?.name || it?.user || "",
      display_name: maskAccount(it?.username || it?.name || it?.user || ""),
      amount: Number(it?.amount ?? it?.prize_value ?? it?.prize_amount ?? 0),
      created_at:
        it?.created_at ||
        it?.createdAt ||
        it?.win_time ||
        it?.won_at ||
        it?.time ||
        "",
      _ts: getItemTs(it),
    }))
    .sort((a, b) => b._ts - a._ts)
    .slice(0, HISTORY_LIMIT);
}

  const loadHistory = useCallback(async (silent = false) => {
    if (loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;

    if (!silent) setHistoryLoading(true);

    try {
      if (typeof api.redpacketHistory === "function") {
        try {
          const res = await api.redpacketHistory({ force: silent ? false : true });

          if (res?.success) {
            const items = normalizeHistory(res?.items || []);
            setHistory(items);
            return;
          }
        } catch (_) {
          // ignore fallback
        }
      }

      // placeholder：API 尚未接好時先頂著
      setHistory(
        normalizeHistory([
          { id: "demo1", name: "userA", amount: 50, created_at: "2026-03-06T12:00:05" },
          { id: "demo2", name: "userB", amount: 88, created_at: "2026-03-06T12:00:04" },
          { id: "demo3", name: "userC", amount: 30, created_at: "2026-03-06T12:00:03" },
          { id: "demo4", name: "userD", amount: 66, created_at: "2026-03-06T12:00:02" },
          { id: "demo5", name: "userE", amount: 18, created_at: "2026-03-06T12:00:01" },
        ])
      );
    } finally {
      loadingHistoryRef.current = false;
      if (!silent) setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory(false);

    const timer = setInterval(() => {
      loadHistory(true);
    }, HISTORY_POLL_MS);

    return () => clearInterval(timer);
  }, [loadHistory]);

  // ✅ 金額 -> 等級 + 圖片
  function pickWinVariantAndImg(amount) {
    const a = Number(amount || 0);

    if (a <= 65) return { variant: "big", img: winBig };
    if (a >= 66 && a <= 365) return { variant: "super", img: winSuper };
    if (a >= 366 && a <= 666) return { variant: "mega", img: winMega };
    if (a >= 667 && a <= 888) return { variant: "ultra", img: winUltra };
    if (a >= 1000) return { variant: "legendary", img: winLegendary };
    if (a >= 889 && a <= 999) return { variant: "ultra", img: winUltra };

    return { variant: "big", img: winBig };
  }

  const pushLocalHistory = (amount) => {
    const item = {
      id: `local-${Date.now()}`,
      username: me?.user?.username || me?.user?.display_name || "",
      display_name: maskAccount(me?.user?.username || me?.user?.display_name || ""),
      amount: Number(amount || 0),
      created_at: new Date().toISOString(),
      _ts: Date.now(),
    };
    setHistory((prev) => normalizeHistory([item, ...prev]));
  };

  // ✅ 1) 領取：每天一次，只增加抽獎次數
  const handleClaim = async () => {
    if (!canClaim) return;

    try {
      setBusy(true);

      if (typeof api.redpacketClaim !== "function") {
        throw new Error("缺少 API：api.redpacketClaim()（領取每日一次 +1 次數）");
      }

      const res = await api.redpacketClaim();
      if (!res?.success) throw new Error(res?.error || "領取失敗");

      await onRefreshMe?.();
      await loadHistory(false);
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  // ✅ 2) 抽紅包：抽一次扣一次 remaining
  const handleOpen = async (idx) => {
    if (!canDraw) return;

    try {
      setBusy(true);
      setOpeningIndex(idx);

      const res = await api.redpacketDraw();
      if (!res?.success) throw new Error(res?.error || "抽紅包失敗");

      const amount = Number(res.amount || 0);

      const pick = pickWinVariantAndImg(amount);
      setWinType(pick.variant);
      setWinImg(pick.img);

      setWinAmount(amount);
      setWinOpen(true);
      pushLocalHistory(amount);

      await onRefreshMe?.();
      await loadHistory(false);
      setOpeningIndex(null);
    } catch (e) {
      alert(e?.message || String(e));
      setOpeningIndex(null);
    } finally {
      setBusy(false);
      setOpeningIndex(null);
    }
  };

const lineText = (it) => {
  const name = maskAccount(it?.username || it?.name || it?.user || it?.display_name || "");
  const amt = Number(it?.amount ?? it?.prize_value ?? 0);
  return `${name} 抽中紅包現金 ${amt} 元`;
};

  return (
    <div className="rp-root">
      <div className="rp-bg" />

      <div className="rp-stage">
        <div className="rp-layout">
          {/* 左：主體 */}
          <div className="rp-card rp-left">
            <div className="rp-card-head">
              <div className="rp-card-title">🧧 紅包抽獎</div>
              <div className="rp-card-sub">點任一紅包開啟（需要有剩餘次數）</div>
            </div>

            <div className="rp-grid">
              {Array.from({ length: 30 }).map((_, i) => {
                const isOpening = openingIndex === i;

                return (
                  <button
                    key={i}
                    className={["rp-item", isOpening ? "is-opening" : ""].join(" ")}
                    onClick={() => handleOpen(i)}
                    disabled={!canDraw}
                    title={!canDraw ? "沒有可用抽獎次數" : "點擊開啟"}
                  >
                    <img className="rp-item-img" src={redpacketImg} alt="redpacket" />
                    <div className="rp-item-label">紅包</div>
                    {!canDraw && <div className="rp-item-mask">次數不足</div>}
                  </button>
                );
              })}
            </div>

            <div className="rp-footer">
              <div className="rp-footer-box">
                <div className="rp-footer-k">抽獎次數</div>
                <div className="rp-footer-v">{limit}</div>
              </div>

              <div className="rp-footer-mid">
                <div className="rp-footer-midline">
                  已使用 <b>{used}</b>/<b>{limit}</b> <span className="rp-dot">•</span> 剩餘{" "}
                  <b>{remaining}</b>
                </div>

                <div className="rp-footer-hint">
                  {limit <= 0
                    ? "尚未開放紅包次數"
                    : remaining > 0
                    ? "可直接點紅包抽獎"
                    : "目前沒有可用次數，請先按右側『領取』增加 1 次（每天一次）"}
                </div>
              </div>

              <div className="rp-footer-box rp-footer-right">
                <button
                  className={"rp-claim " + (!canClaim ? "is-disabled" : "")}
                  disabled={!canClaim}
                  onClick={handleClaim}
                  title={!canClaim ? "今日已領取" : "領取一次（今天只可一次）"}
                >
                  領取
                </button>
              </div>
            </div>
          </div>

          {/* 右：紀錄 */}
          <div className="rp-card rp-right">
            <div className="rp-right-head">
              <div className="rp-right-title">中獎紀錄</div>

              <button
                className="rp-right-refresh"
                onClick={() => loadHistory(false)}
                disabled={historyLoading}
              >
                {historyLoading ? "刷新中..." : "刷新"}
              </button>
            </div>

            <div className="rp-right-list">
              {historyLoading && history.length === 0 ? (
                <div className="rp-muted">載入中...</div>
              ) : history.length === 0 ? (
                <div className="rp-muted">目前沒有紀錄</div>
              ) : (
                history.slice(0, HISTORY_LIMIT).map((it, idx) => (
                  <div
                    key={it?.id ?? `${it?.name}-${it?.amount}-${idx}`}
                    className="rp-right-item"
                    title={lineText(it)}
                  >
                    {lineText(it)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <WinPopup
        open={winOpen}
        winImg={winImg}
        amount={winAmount}
        variant={winType}
        onClose={() => setWinOpen(false)}
      />

      <style>{`
        .rp-root{
          min-height:100vh;
          position:relative;
          color:#fff;
          overflow:hidden;
          font-family: Arial, "Microsoft JhengHei", sans-serif;
        }

        .rp-bg:after{ display:none !important; }

        .rp-stage{
          position:relative;
          min-height:auto;
          display:flex;
          align-items:flex-start;
          justify-content:flex-start;
          padding:10px;
        }

        .rp-layout{
          width: min(1320px, 96vw);
          display:grid;
          grid-template-columns: 1fr 360px;
          gap:18px;
          align-items:stretch;
        }

        .rp-card{
          border-radius:22px;
          border:1px solid rgba(255,255,255,0.18);
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: none;
          box-shadow: none;
          padding:18px;
          min-height: auto;
        }

        .rp-card-head{
          margin-bottom:14px;
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }

        .rp-card-title{ font-size:22px; font-weight:1000; }
        .rp-card-sub{ font-size:13px; opacity:.9; }

        .rp-grid{
          display:grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap:12px;
        }

        .rp-item{
          position:relative;
          border-radius:16px;
          border:1px solid rgba(255,255,255,0.18);
          background: linear-gradient(180deg, rgba(255,70,70,0.85), rgba(120,0,20,0.85));
          cursor:pointer;
          overflow:hidden;
          padding:10px 8px 12px;
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:center;
          gap:6px;
          transition: transform .12s ease, filter .12s ease;
        }

        .rp-item:hover{ transform: translateY(-2px); filter: brightness(1.05); }
        .rp-item:disabled{ cursor:not-allowed; filter: grayscale(.2) brightness(.92); }

        .rp-item-img{
          width: 54px;
          height: 54px;
          object-fit: contain;
          filter: drop-shadow(0 8px 10px rgba(0,0,0,.25));
        }

        .rp-item-label{
          font-size:12px;
          font-weight:900;
          opacity:.95;
          text-shadow: 0 2px 6px rgba(0,0,0,.3);
        }

        .rp-item.is-opening{ transform: scale(0.98); }
        .rp-item.is-opening:after{
          content:"";
          position:absolute;
          inset:0;
          background: rgba(255,255,255,0.10);
          animation: rpPulse .6s ease-in-out infinite;
        }

        @keyframes rpPulse{
          0%{opacity:.15}
          50%{opacity:.45}
          100%{opacity:.15}
        }

        .rp-item-mask{
          position:absolute;
          inset:0;
          display:flex;
          align-items:center;
          justify-content:center;
          font-weight:1000;
          font-size:12px;
          background: rgba(0,0,0,0.40);
        }

        .rp-footer{
          margin-top:14px;
          padding-top:14px;
          border-top:1px solid rgba(255,255,255,0.16);
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }

        .rp-footer-box{ min-width:120px; }
        .rp-footer-k{ font-size:12px; opacity:.9; margin-bottom:4px; }
        .rp-footer-v{ font-size:18px; font-weight:1000; }

        .rp-footer-mid{
          flex:1;
          min-width:220px;
          text-align:center;
        }

        .rp-footer-midline{ font-size:16px; font-weight:900; }
        .rp-footer-hint{ margin-top:4px; font-size:12px; opacity:.9; }
        .rp-dot{ opacity:.7; padding:0 6px; }

        .rp-footer-right{
          min-width: 200px;
          text-align:right;
          display:flex;
          flex-direction:column;
          gap:8px;
          align-items:flex-end;
        }

        .rp-claim{
          padding:10px 18px;
          border-radius:14px;
          border:1px solid rgba(255,255,255,0.45);
          background: rgba(255,255,255,0.10);
          color:#fff;
          cursor:pointer;
          font-weight:1000;
          min-width: 120px;
        }

        .rp-claim:hover{ filter: brightness(1.05); }
        .rp-claim.is-disabled{ cursor:not-allowed; opacity:.55; filter: grayscale(.3); }
        .rp-status{ font-size:12px; opacity:.92; }

        .rp-right{
          background: rgba(0,0,0,0.35);
          border: 1px solid rgba(255,255,255,0.14);
        }

        .rp-right-head{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:12px;
        }

        .rp-right-title{ font-size:16px; font-weight:1000; }

        .rp-right-refresh{
          padding:8px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,0.22);
          background: rgba(255,255,255,0.08);
          color:#fff;
          cursor:pointer;
          font-weight:900;
        }

        .rp-right-refresh:disabled{ opacity:.6; cursor:not-allowed; }

        .rp-right-list{
          height: 520px;
          overflow:auto;
          padding-right:6px;
        }

        .rp-right-item{
          padding:10px 12px;
          border-radius:12px;
          border:1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          margin-bottom:10px;
          font-size:13px;
          line-height:1.4;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }

        .rp-right-foot{
          margin-top:10px;
          font-size:12px;
          opacity:.85;
          border-top:1px solid rgba(255,255,255,0.10);
          padding-top:10px;
        }

        .rp-muted{ opacity:.85; font-size:13px; padding:12px; }

        @media (max-width: 980px){
          .rp-layout{ grid-template-columns: 1fr; }
          .rp-right-list{ height: 280px; }
        }

        @media (max-width: 720px){
          .rp-grid{ grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .rp-item-img{ width: 48px; height: 48px; }
        }
      `}</style>
    </div>
  );
}
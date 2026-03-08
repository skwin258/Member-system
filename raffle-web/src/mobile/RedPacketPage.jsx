import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import redpacketImg from "../assets/redpacket.png";
import "./redPacketPage.css";

const REDPACKET_TOTAL = 30;
const HISTORY_POLL_MS = 20000;
const MARQUEE_DURATION_MS = 10000;

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

  const dateTs = new Date(raw).getTime();
  if (Number.isFinite(dateTs) && dateTs > 0) return dateTs;

  const num = Number(raw);
  if (Number.isFinite(num) && num > 0) return num;

  return 0;
}

function maskAccount(account) {
  const s = String(account || "").trim();
  if (!s) return "使用者";
  if (s.length >= 3) return `${s.slice(0, 2)}***${s.slice(-1)}`;
  if (s.length === 2) return `${s[0]}***${s[1]}`;
  if (s.length === 1) return `${s}***`;
  return "使用者";
}

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
    .sort((a, b) => b._ts - a._ts);
}

function lineText(it) {
  const name = maskAccount(it?.username || it?.name || it?.user || "");
  const amt = Number(it?.amount ?? it?.prize_value ?? it?.prize_amount ?? 0);
  return `${name} 抽中紅包現金 ${amt} 元`;
}

function resolveWinMeta(amount) {
  const n = Number(amount || 0);

  if (n <= 65) {
    return { variant: "big", img: "/img/win_big.png" };
  }
  if (n >= 66 && n <= 365) {
    return { variant: "super", img: "/img/win_super.png" };
  }
  if (n >= 366 && n <= 666) {
    return { variant: "mega", img: "/img/win_mega.png" };
  }
  if (n >= 667 && n <= 999) {
    return { variant: "ultra", img: "/img/win_ultra.png" };
  }
  if (n >= 1000) {
    return { variant: "legendary", img: "/img/win_legendary.png" };
  }

  return { variant: "big", img: "/img/win_big.png" };
}

export default function RedPacketPage({ me, onRefreshMe, onTabChange, onWin, isGuest = false, onNeedLogin }) {
  const [openingIndex, setOpeningIndex] = useState(null);
  const [busy, setBusy] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const loadingHistoryRef = useRef(false);

  const [feedType, setFeedType] = useState("redpacket");

  const [marqueeText, setMarqueeText] = useState("");
  const [marqueeRunId, setMarqueeRunId] = useState(0);
  const [marqueeAnimating, setMarqueeAnimating] = useState(false);
  const [marqueeVisible, setMarqueeVisible] = useState(false);
  const lastSeenTopIdRef = useRef("");

  const limit = Number(me?.limits?.redpacket ?? 0);
  const used = Number(me?.used?.redpacket ?? 0);
  const remaining = Math.max(0, limit - used);

  const claimedToday =
    Boolean(me?.daily?.redpacket_claimed) ||
    Boolean(me?.flags?.redpacket_claimed) ||
    Boolean(me?.claimed?.redpacket) ||
    false;

  const canClaim = useMemo(() => {
    if (busy) return false;
    if (claimedToday) return false;
    return true;
  }, [busy, claimedToday]);

  const canDraw = useMemo(() => {
    if (busy) return false;
    if (limit <= 0) return false;
    if (remaining <= 0) return false;
    return true;
  }, [busy, limit, remaining]);

  const loadHistory = useCallback(async (force = false) => {
    if (loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;
    setHistoryLoading(true);

    try {
      if (feedType === "redpacket" && typeof api.redpacketHistory === "function") {
        const res = await api.redpacketHistory({ force });

        if (res?.success) {
          const rows = normalizeHistory(res?.items || []);
          const latest = rows[0];

          if (latest) {
            const latestId = String(latest.id || "");
            const latestText = lineText(latest);

            if (latestId && latestId !== lastSeenTopIdRef.current) {
              lastSeenTopIdRef.current = latestId;
              setMarqueeText(latestText);
              setMarqueeVisible(true);
              setMarqueeAnimating(false);

              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  setMarqueeRunId((v) => v + 1);
                  setMarqueeAnimating(true);
                });
              });
            }
          }
        }
      }
    } catch (_) {
      // ignore
    } finally {
      loadingHistoryRef.current = false;
      setHistoryLoading(false);
    }
  }, [feedType]);

  useEffect(() => {
    loadHistory(true);
    const timer = setInterval(() => loadHistory(), HISTORY_POLL_MS);
    return () => clearInterval(timer);
  }, [loadHistory]);

  const pushLocalHistory = (amount) => {
    const latestId = `local-${Date.now()}`;
    lastSeenTopIdRef.current = latestId;
    const latestText = lineText({ username: me?.user?.username || me?.user?.display_name || "使用者", amount });
    setMarqueeText(latestText);
    setMarqueeVisible(true);
    setMarqueeAnimating(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setMarqueeRunId((v) => v + 1);
        setMarqueeAnimating(true);
      });
    });
  };

  const handleClaim = async () => {
    if (isGuest) {
      onNeedLogin?.();
      return;
    }
    if (!canClaim) return;

    try {
      setBusy(true);

      if (typeof api.redpacketClaim !== "function") {
        throw new Error("缺少 api.redpacketClaim()");
      }

      const res = await api.redpacketClaim();
      if (!res?.success) throw new Error(res?.error || "領取失敗");

      queueMicrotask(() => {
        onRefreshMe?.({ silent: true, force: true });
        loadHistory(true);
      });
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

const handleOpen = async (idx) => {
  if (isGuest) {
    onNeedLogin?.();
    return;
  }
  if (!canDraw) return;

  try {
    setBusy(true);
    setOpeningIndex(idx);

    if (typeof api.redpacketDraw !== "function") {
      throw new Error("缺少 api.redpacketDraw()");
    }

    const res = await api.redpacketDraw();
    if (!res?.success) throw new Error(res?.error || "抽紅包失敗");

    const amount = Number(res?.amount || 0);
    console.log("抽中金額 =", amount);

    const meta = resolveWinMeta(amount);

    console.log("onWin typeof =", typeof onWin);
    console.log("準備呼叫 onWin", { amount, meta });

// 先開 popup
onWin?.(amount, meta);
pushLocalHistory(amount);

setMarqueeText(`${maskAccount(me?.user?.username || me?.user?.display_name || "使用者")} 抽中紅包現金 ${amount} 元`);
setMarqueeVisible(true);
setMarqueeAnimating(false);
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    setMarqueeRunId((v) => v + 1);
    setMarqueeAnimating(true);
  });
});

setTimeout(() => {
  onRefreshMe?.({ silent: true, force: true });
  loadHistory(true);
}, 250);

    console.log("set 完成後準備開窗", {
      amount,
      variant: meta.variant,
      img: meta.img,
    });
  } catch (e) {
    alert(e?.message || String(e));
  } finally {
    setBusy(false);
    setOpeningIndex(null);
  }
};

  return (
    <>
      <div className="mRpPage">
        <div className="mRpBody">
          <section className="mRpSectionPlain">
            <section className="mRpFeedSection mRpFeedSection--top">
              <div className="mRpMarqueeViewport mRpMarqueeViewport--plain">
                {marqueeVisible ? (
                  <div
                    key={marqueeRunId}
                    className={`mRpMarqueeSingle ${marqueeAnimating ? "is-animating" : ""}`}
                    onAnimationEnd={() => {
                      setMarqueeAnimating(false);
                      setMarqueeVisible(false);
                      setMarqueeText("");
                    }}
                  >
                    {marqueeText}
                  </div>
                ) : null}
              </div>

              <div className="mRpFeedSelectWrap">
                <select
                  className="mRpFeedSelect"
                  value={feedType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFeedType(v);
                    if (v === "redpacket") onTabChange?.("redpacket");
                    if (v === "wheel") onTabChange?.("wheel");
                    if (v === "number") onTabChange?.("number");
                  }}
                >
                  <option value="redpacket">紅包</option>
                  <option value="wheel">輪盤</option>
                  <option value="number">數字抽獎</option>
                </select>
              </div>
            </section>

            <div className="mRpGrid">
              {Array.from({ length: REDPACKET_TOTAL }).map((_, i) => {
                const isOpening = openingIndex === i;
                return (
                  <button
                    key={i}
                    className={`mRpPacketOnlyBtn ${isOpening ? "is-opening" : ""}`}
                    onClick={() => handleOpen(i)}
                    disabled={!canDraw}
                    title={!canDraw ? "沒有可用抽獎次數" : "點擊開啟"}
                  >
                    <img
                      src={redpacketImg}
                      alt="redpacket"
                      className="mRpPacketOnlyImg"
                    />
                  </button>
                );
              })}
            </div>

            <div className="mRpStatsCard">
              <div className="mRpStatsTriple">
                <div className="mRpStatsMiniCard">
                  <div className="mRpStatsMiniLabel">剩餘抽獎次數</div>
                  <div className="mRpStatsMiniValue">{remaining}</div>
                </div>

                <div className="mRpStatsCenterBtn">
                  <button
                    className={`mRpClaimBtn ${!canClaim ? "is-disabled" : ""}`}
                    disabled={!canClaim}
                    onClick={handleClaim}
                  >
                    領取
                  </button>
                </div>

                <div className="mRpStatsMiniCard">
                  <div className="mRpStatsMiniLabel">已使用</div>
                  <div className="mRpStatsMiniValue">{used}</div>
                </div>
              </div>

              <div className="mRpHint mRpHint--center">
                {limit <= 0
                  ? "尚未開放紅包次數"
                  : remaining > 0
                  ? "可直接點紅包抽獎"
                  : "目前沒有可用次數"}
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
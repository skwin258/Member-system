import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import "./mobileWheel.css";
import scoinIcon from "../assets/scoin.png";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

const HISTORY_POLL_MS = 20000;
const MARQUEE_DURATION_MS = 10000;

const WAIT_SPIN_RAD_PER_SEC = 5.4;
const SETTLE_EXTRA_TURNS_MIN = 3;
const SETTLE_EXTRA_TURNS_MAX = 4;

function resolveImageUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/r2/")) return API_BASE + s;
  return s;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function maskAccount(account) {
  const s = String(account || "").trim();
  if (!s) return "使用者";
  if (s.length >= 3) return `${s.slice(0, 2)}***${s.slice(-1)}`;
  if (s.length === 2) return `${s[0]}***${s[1]}`;
  if (s.length === 1) return `${s}***`;
  return "使用者";
}

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

function normalizeHistory(items) {
  const arr = Array.isArray(items) ? items : [];

  return arr
    .map((it, idx) => {
      const username = it?.username || it?.display_name || it?.name || "";
      const prizeName = it?.prize_name || it?.prize_title || it?.name || "輪盤獎項";
      const amount = Number(it?.amount ?? it?.prize_amount ?? it?.prize_value ?? 0);
      const createdAt =
        it?.created_at ||
        it?.createdAt ||
        it?.win_time ||
        it?.won_at ||
        it?.time ||
        "";

      return {
        id:
          it?.id ??
          it?.log_id ??
          it?.record_id ??
          `${username}-${prizeName}-${amount}-${createdAt}-${idx}`,
        username,
        prize_name: prizeName,
        amount,
        created_at: createdAt,
        _ts: getItemTs(it),
      };
    })
    .sort((a, b) => b._ts - a._ts);
}

function lineText(it) {
  const name = maskAccount(it?.username || "");
  const prize = String(it?.prize_name || "輪盤獎項").trim();
  return `${name} 抽中 ${prize}`;
}

function normName(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
}

const normAngle = (a) => {
  const twopi = Math.PI * 2;
  return ((a % twopi) + twopi) % twopi;
};

const EPS = 1e-6;

const segmentAtPointer = (angle, n) => {
  const twopi = Math.PI * 2;
  const slice = twopi / (n || 1);
  const pointerAngle = -Math.PI / 2;
  const relative = normAngle(pointerAngle - normAngle(angle) + EPS);
  const idx = Math.floor(relative / slice);
  return Math.max(0, Math.min((n || 1) - 1, idx));
};

const targetAngleForIndex = (idx, n) => {
  const slice = (Math.PI * 2) / (n || 1);
  const pointerAngle = -Math.PI / 2;
  const target = pointerAngle - (idx * slice + slice / 2);
  return normAngle(target);
};

function stableSortPrizes(list) {
  const arr = Array.isArray(list) ? list.slice() : [];
  arr.sort((a, b) => {
    const ai = Number(a?.id);
    const bi = Number(b?.id);
    const aOk = Number.isFinite(ai);
    const bOk = Number.isFinite(bi);
    if (aOk && bOk) return ai - bi;
    if (aOk) return -1;
    if (bOk) return 1;
    return normName(a?.name).localeCompare(normName(b?.name));
  });
  return arr;
}

function calcStopAbs(fromAbs, targetNorm, minTurns = 3, maxTurns = 4) {
  const twopi = Math.PI * 2;
  const turns = minTurns + Math.floor(Math.random() * (maxTurns - minTurns + 1));
  let k = Math.floor((fromAbs - targetNorm) / twopi);
  if (!Number.isFinite(k)) k = 0;

  let candidate = targetNorm + (k + 1) * twopi;
  candidate += turns * twopi;
  return candidate;
}

function resolvePrizeImage(pick) {
  const u =
    pick?.prize_image_url ||
    pick?.image_url ||
    pick?.img_url ||
    pick?.prize_img ||
    pick?.image ||
    "";
  return resolveImageUrl(u);
}

function extractNumberFromName(name) {
  const s = String(name || "");
  const m = s.replace(/,/g, "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function buildWinPayload(pick) {
  const name = String(pick?.name || pick?.prize_name || pick?.prize || pick?.title || "");
  const t = String(pick?.prize_type || pick?.type || "").toLowerCase();

  let v =
    toNum(pick?.prize_value, 0) ||
    toNum(pick?.value, 0) ||
    toNum(pick?.amount, 0) ||
    toNum(pick?.prize_amount, 0) ||
    toNum(pick?.s_amount, 0) ||
    toNum(pick?.coin, 0);

  if (!v) v = extractNumberFromName(name);

  const hasScoin =
    name.includes("S幣") || name.includes("S币") || t === "scoin" || t === "coin";
  const hasDiscount = name.includes("折抵") || name.includes("折抵金") || t === "discount";
  const hasCash = name.includes("現金") || t === "cash" || t === "money";

  if (hasScoin) return { kind: "scoin", amount: v, img: scoinIcon };
  if (hasDiscount) return { kind: "discount", amount: v };
  if (hasCash) return { kind: "cash", amount: v };

  const img = resolvePrizeImage(pick);
  if (img) return { kind: "image", img };

  return { kind: "text", text: name || "已領取獎勵" };
}

function buildMarqueeTextFromPick(pick, me) {
  const rawName = me?.user?.username || me?.user?.display_name || me?.user?.name || "";
  const name = maskAccount(rawName);
  const prize = String(pick?.prize_name || pick?.name || pick?.title || "輪盤獎項").trim();
  return `${name} 抽中 ${prize}`;
}

export default function MobileWheelPage({
  me,
  onRefreshMe,
  onTabChange,
  isGuest = false,
  onNeedLogin,
}) {
  const [feedType, setFeedType] = useState("wheel");

  const [historyLoading, setHistoryLoading] = useState(false);
  const loadingHistoryRef = useRef(false);

  const [marqueeText, setMarqueeText] = useState("");
  const [marqueeRunId, setMarqueeRunId] = useState(0);
  const [marqueeAnimating, setMarqueeAnimating] = useState(false);
  const [marqueeVisible, setMarqueeVisible] = useState(false);

  const lastSeenTopIdRef = useRef("");
  const marqueeQueueRef = useRef([]);
  const marqueeVisibleRef = useRef(false);
  const marqueeAnimatingRef = useRef(false);
  const recentMarqueeTextRef = useRef("");

  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const [result, setResult] = useState(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [winPayload, setWinPayload] = useState(null);
  const [displayWinNumber, setDisplayWinNumber] = useState(null);

  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const angleRef = useRef(0);
  const bulbPhaseRef = useRef(0);
  const pressedRef = useRef(false);
  const modeRef = useRef("idle");
  const spinLockRef = useRef(false);
  const pauseHistoryPollRef = useRef(false);
  const waitSpinRafRef = useRef(null);

  const wheelSlotsRef = useRef([]);

  const size = 350;

  const limit = Number(me?.limits?.wheel ?? 0);
  const used = Number(me?.used?.wheel ?? 0);
  const remaining = Math.max(0, limit - used);

  const claimedToday =
    Boolean(me?.daily?.wheel_claimed) ||
    Boolean(me?.flags?.wheel_claimed) ||
    Boolean(me?.claimed?.wheel) ||
    false;

  const canClaim = useMemo(() => {
    if (spinning) return false;
    if (claimedToday) return false;
    return true;
  }, [spinning, claimedToday]);

  const canDraw = useMemo(() => {
    if (spinning) return false;
    if (limit <= 0) return false;
    if (remaining <= 0) return false;
    return true;
  }, [spinning, limit, remaining]);

  useEffect(() => {
    marqueeVisibleRef.current = marqueeVisible;
    marqueeAnimatingRef.current = marqueeAnimating;
  }, [marqueeVisible, marqueeAnimating]);

  const playMarqueeNow = useCallback((text) => {
    if (!text) return;

    marqueeVisibleRef.current = true;
    marqueeAnimatingRef.current = false;

    setMarqueeText(text);
    setMarqueeVisible(true);
    setMarqueeAnimating(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        marqueeAnimatingRef.current = true;
        setMarqueeRunId((v) => v + 1);
        setMarqueeAnimating(true);
      });
    });
  }, []);

  const triggerMarquee = useCallback(
    (text) => {
      if (!text) return;
      if (recentMarqueeTextRef.current === text) return;

      recentMarqueeTextRef.current = text;

      if (marqueeVisibleRef.current || marqueeAnimatingRef.current) {
        marqueeQueueRef.current.push({ text });
        return;
      }

      playMarqueeNow(text);
    },
    [playMarqueeNow]
  );

  const loadHistory = useCallback(
    async (force = false) => {
      if (pauseHistoryPollRef.current) return;
      if (loadingHistoryRef.current) return;

      loadingHistoryRef.current = true;
      setHistoryLoading(true);

      try {
        if (feedType === "wheel" && typeof api.wheelHistory === "function") {
          const res = await api.wheelHistory({ force });

          if (res?.success) {
            const rows = normalizeHistory(res?.items || []);
            const latest = rows[0];

            if (latest) {
              const latestId = String(latest.id || "");
              const latestText = lineText(latest);

              if (latestId && latestId !== lastSeenTopIdRef.current) {
                lastSeenTopIdRef.current = latestId;
                triggerMarquee(latestText);
              }
            }
          }
        }
      } catch (_) {
      } finally {
        loadingHistoryRef.current = false;
        setHistoryLoading(false);
      }
    },
    [feedType, triggerMarquee]
  );

  useEffect(() => {
    loadHistory();

    const timer = setInterval(() => {
      if (pauseHistoryPollRef.current) return;
      loadHistory();
    }, HISTORY_POLL_MS);

    return () => clearInterval(timer);
  }, [loadHistory]);

  const loadPrizes = useCallback(async () => {
    try {
      setLoading(true);
      const d = await api.wheelPrizes("wheel");
      if (!d?.success) throw new Error(d?.error || "讀取輪盤獎項失敗");

      const list = stableSortPrizes(Array.isArray(d?.prizes) ? d.prizes : []);
      setPrizes(list);
      wheelSlotsRef.current = list.slice();
    } catch (e) {
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPrizes();
  }, [loadPrizes]);

  const drawWheel = useCallback((ctx, list, angle) => {
    const n = list.length || 1;
    const cx = size / 2;
    const cy = size / 2;

    const outerR = size / 2 - 4;
    const rimR = outerR - 8;
    const wheelR = rimR - 14;
    const slice = (Math.PI * 2) / n;

    ctx.clearRect(0, 0, size, size);

    {
      const g = ctx.createRadialGradient(cx, cy, wheelR, cx, cy, outerR);
      g.addColorStop(0, "#ffe8a3");
      g.addColorStop(0.55, "#f3b12a");
      g.addColorStop(1, "#b56b06");

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    {
      const bulbs = 18;
      const phase = bulbPhaseRef.current;
      for (let i = 0; i < bulbs; i++) {
        const a = (Math.PI * 2 * i) / bulbs - Math.PI / 2;
        const r = outerR - 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        const on = ((i + phase) % 2) === 0;
        const alpha = on ? 0.95 : 0.35;

        ctx.beginPath();
        ctx.arc(x, y, 2.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
    }

    {
      ctx.beginPath();
      ctx.arc(cx, cy, wheelR + 2, 0, Math.PI * 2);
      ctx.fillStyle = "#d79b2a";
      ctx.fill();
    }

    for (let i = 0; i < n; i++) {
      const start = angle + i * slice;
      const end = start + slice;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, wheelR, start, end);
      ctx.closePath();

      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, wheelR);
      if (i % 2 === 0) {
        g.addColorStop(0, "#fff6c8");
        g.addColorStop(1, "#f2d27e");
      } else {
        g.addColorStop(0, "#fff2b0");
        g.addColorStop(1, "#e9c25f");
      }
      ctx.fillStyle = g;
      ctx.fill();

      ctx.strokeStyle = "rgba(140,90,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const label = String(list[i]?.name ?? `獎項${i + 1}`);
      const mid = (start + end) / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);
      ctx.textAlign = "right";
      ctx.fillStyle = "#7a3d00";
      ctx.font = "bold 12px Arial";
      ctx.fillText(label, wheelR - 12, 4);
      ctx.restore();
    }

    {
      const pressed = pressedRef.current;
      const scale = pressed ? 0.96 : 1.0;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fillStyle = "#b11616";
      ctx.fill();

      const g = ctx.createRadialGradient(cx - 8, cy - 8, 8, cx, cy, 30);
      g.addColorStop(0, "#ff6a6a");
      g.addColorStop(1, "#b11616");

      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 13px Arial";
      ctx.fillText("抽獎", cx, cy + 4);

      ctx.restore();
    }

    {
      const tipY = 42;
      const baseY = 13;
      const halfW = 9;

      ctx.beginPath();
      ctx.moveTo(cx, tipY);
      ctx.lineTo(cx - halfW, baseY);
      ctx.lineTo(cx + halfW, baseY);
      ctx.closePath();

      ctx.fillStyle = "#c01818";
      ctx.fill();

      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const ctx = c.getContext("2d");
    let last = performance.now();

    const loop = (now) => {
      const dt = now - last;
      last = now;

      const speed = modeRef.current === "spinning" ? 1 : 0.25;
      const inc = (dt * speed) / 220;
      if (inc >= 1) {
        bulbPhaseRef.current = (bulbPhaseRef.current + Math.floor(inc)) % 999999;
      }

      drawWheel(ctx, wheelSlotsRef.current, angleRef.current);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawWheel]);

  const animateSpinSettle = (toAbs, startVelocity = WAIT_SPIN_RAD_PER_SEC) => {
    const from = angleRef.current;
    const distance = Math.max(0, toAbs - from);

    if (distance <= 0.0001) {
      angleRef.current = toAbs;
      return Promise.resolve();
    }

    const minMs = 3200;
    const maxMs = 5200;

    let ms = (distance / Math.max(startVelocity, 0.001)) * 1000 * 1.2;
    ms = clamp(ms, minMs, maxMs);

    return new Promise((resolve) => {
      const t0 = performance.now();
      const T = ms / 1000;

      const step = (now) => {
        const elapsed = (now - t0) / 1000;
        const s = clamp(elapsed / T, 0, 1);

        const h00 = 2 * s * s * s - 3 * s * s + 1;
        const h10 = s * s * s - 2 * s * s + s;
        const h01 = -2 * s * s * s + 3 * s * s;

        const value = h00 * from + h10 * T * startVelocity + h01 * toAbs;
        angleRef.current = value;

        if (s < 1) {
          requestAnimationFrame(step);
        } else {
          angleRef.current = toAbs;
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  };

  const startWaitingSpin = () => {
    let last = performance.now();

    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      angleRef.current += dt * WAIT_SPIN_RAD_PER_SEC;
      waitSpinRafRef.current = requestAnimationFrame(tick);
    };

    waitSpinRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (waitSpinRafRef.current) {
        cancelAnimationFrame(waitSpinRafRef.current);
        waitSpinRafRef.current = null;
      }
    };
  };

  const animateWinNumber = (target, ms = 900) => {
    const start = performance.now();
    const from = 0;
    const to = toNum(target, 0);

    return new Promise((resolve) => {
      const tick = (now) => {
        const t = clamp((now - start) / ms, 0, 1);
        const cur = Math.floor(from + (to - from) * (1 - Math.pow(1 - t, 3)));
        setDisplayWinNumber(cur);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  };

  const findPickIndex = (pick, wheelList) => {
    const pid = pick?.id ?? pick?.prize_id ?? null;
    if (pid != null) {
      const i = wheelList.findIndex((p) => String(p.id) === String(pid));
      if (i >= 0) return i;
    }

    const pn = normName(pick?.name || pick?.prize_name);
    if (pn) {
      const i = wheelList.findIndex((p) => normName(p?.name) === pn);
      if (i >= 0) return i;
    }

    return -1;
  };

  const handleClaim = async () => {
    if (isGuest) {
      onNeedLogin?.();
      return;
    }
    if (!canClaim) return;

    try {
      if (typeof api.wheelClaim !== "function") {
        throw new Error("缺少 api.wheelClaim()");
      }

      const res = await api.wheelClaim();
      if (!res?.success) throw new Error(res?.error || "領取失敗");

      setTimeout(async () => {
        try {
          queueMicrotask(() => {
            onRefreshMe?.({ silent: true, force: true });
            loadHistory();
          });
        } catch (_) {
        }
      }, 300);
    } catch (e) {
      alert(e?.message || String(e));
    }
  };

  const pushLocalHistory = (pick) => {
    triggerMarquee(buildMarqueeTextFromPick(pick, me));
  };

  const spin = async () => {
    if (isGuest) {
      onNeedLogin?.();
      return;
    }

    if (!canDraw) return;
    if (spinning) return;
    if (spinLockRef.current) return;

    spinLockRef.current = true;
    pauseHistoryPollRef.current = true;

    let stopWaitingSpin = () => {};

    try {
      if ((wheelSlotsRef.current?.length || 0) === 0) {
        await loadPrizes();
      }

      setSpinning(true);
      modeRef.current = "spinning";
      setResult(null);
      setShowWinModal(false);
      setWinPayload(null);
      setDisplayWinNumber(null);

      stopWaitingSpin = startWaitingSpin();
      const d = await api.wheelSpin("wheel");
      stopWaitingSpin();

      if (!d?.success) throw new Error(d?.error || "抽獎失敗");

      const pick = d.result;
      const wheelList = wheelSlotsRef.current || [];
      const n = wheelList.length || 1;

      let idx = findPickIndex(pick, wheelList);

      if (idx < 0) {
        setResult(pick);
        const payload = buildWinPayload(pick);
        setWinPayload(payload);
        setShowWinModal(true);
        pushLocalHistory(pick);

        if (
          payload?.kind === "discount" ||
          payload?.kind === "cash" ||
          payload?.kind === "scoin"
        ) {
          setDisplayWinNumber(0);
          await animateWinNumber(payload.amount ?? 0, 900);
        }

        setTimeout(() => {
          pauseHistoryPollRef.current = false;
          onRefreshMe?.({ silent: true, force: true });
          loadHistory(true);
        }, 1200);

        return;
      }

      idx = Math.max(0, Math.min(n - 1, idx));

      const targetNorm = targetAngleForIndex(idx, n);
      const toAbs = calcStopAbs(
        angleRef.current,
        targetNorm,
        SETTLE_EXTRA_TURNS_MIN,
        SETTLE_EXTRA_TURNS_MAX
      );

      await animateSpinSettle(toAbs, WAIT_SPIN_RAD_PER_SEC);

      const landed = segmentAtPointer(angleRef.current, n);
      if (landed !== idx) {
        console.warn("[mobile wheel] landed != idx", {
          idx,
          landed,
          pick: pick?.name,
        });
      }

      setResult(pick);
      const payload = buildWinPayload(pick);
      setWinPayload(payload);
      setShowWinModal(true);
      pushLocalHistory(pick);

      if (
        payload?.kind === "discount" ||
        payload?.kind === "cash" ||
        payload?.kind === "scoin"
      ) {
        setDisplayWinNumber(0);
        await animateWinNumber(payload.amount ?? 0, 900);
      }

      setTimeout(() => {
        pauseHistoryPollRef.current = false;
        onRefreshMe?.({ silent: true, force: true });
        loadHistory(true);
      }, 1200);
    } catch (e) {
      stopWaitingSpin();
      pauseHistoryPollRef.current = false;
      alert(e?.message || String(e));
    } finally {
      modeRef.current = "idle";
      setSpinning(false);
      spinLockRef.current = false;
      pressedRef.current = false;
    }
  };

  const closeWin = () => {
    setShowWinModal(false);
    setResult(null);
    setWinPayload(null);
    setDisplayWinNumber(null);
  };

  const renderWinContent = () => {
    if (!winPayload) return null;

    const Title = () => <div className="mWheelWinTitle">恭喜您獲得</div>;

    if (winPayload.kind === "discount") {
      return (
        <div className="mWheelWinStack">
          <Title />
          <div className="mWheelWinLine mWheelWinLine--discount">
            <span className="mWheelWinLabel">折抵金</span>
            <span className="mWheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="mWheelWinUnit">元</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "cash") {
      return (
        <div className="mWheelWinStack">
          <Title />
          <div className="mWheelWinLine mWheelWinLine--cash">
            <span className="mWheelWinLabel">現金</span>
            <span className="mWheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="mWheelWinUnit">元</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "scoin") {
      return (
        <div className="mWheelWinStack">
          <Title />
          <div className="mWheelWinLine mWheelWinLine--img">
            <img className="mWheelWinIcon" src={winPayload.img} alt="S幣" />
            <span className="mWheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="mWheelWinUnit">枚</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "image") {
      return (
        <div className="mWheelWinStack">
          <Title />
          <img className="mWheelWinPrizeImg" src={winPayload.img} alt="prize" />
        </div>
      );
    }

    return (
      <div className="mWheelWinStack">
        <Title />
        <div className="mWheelWinText">{winPayload.text}</div>
      </div>
    );
  };

  return (
    <>
      <div className="mWheelPage">
        <div className="mWheelBody">
          <section className="mWheelSectionPlain">
            <section className="mWheelFeedSection mWheelFeedSection--top">
              <div className="mWheelMarqueeViewport mWheelMarqueeViewport--plain">
                {marqueeVisible ? (
                  <div
                    key={marqueeRunId}
                    className={`mWheelMarqueeSingle ${marqueeAnimating ? "is-animating" : ""}`}
                    onAnimationEnd={() => {
                      marqueeAnimatingRef.current = false;
                      marqueeVisibleRef.current = false;

                      setMarqueeAnimating(false);
                      setMarqueeVisible(false);
                      setMarqueeText("");

                      const next = marqueeQueueRef.current.shift();
                      if (next) {
                        playMarqueeNow(next.text);
                      } else {
                        recentMarqueeTextRef.current = "";
                      }
                    }}
                    style={{ animationDuration: `${MARQUEE_DURATION_MS}ms` }}
                  >
                    {marqueeText}
                  </div>
                ) : null}
              </div>

              <div className="mWheelFeedSelectWrap">
                <select
                  className="mWheelFeedSelect"
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

            <div className="mWheelCanvasSection">
              <div className="mWheelCanvasWrap">
                <canvas
                  ref={canvasRef}
                  width={size}
                  height={size}
                  className={`mWheelCanvas ${spinning ? "isSpinning" : ""}`}
                />

                <button
                  type="button"
                  className={`mWheelCenterHit ${spinning ? "isDisabled" : ""}`}
                  onClick={() => {
                    if (!spinning) spin();
                  }}
                  onPointerDown={() => {
                    if (!spinning) pressedRef.current = true;
                  }}
                  onPointerUp={() => {
                    pressedRef.current = false;
                  }}
                  onPointerCancel={() => {
                    pressedRef.current = false;
                  }}
                  onPointerLeave={() => {
                    pressedRef.current = false;
                  }}
                  aria-label="點擊抽獎"
                  disabled={!canDraw || spinning}
                />
              </div>

              {loading ? <div className="mWheelMuted">獎項載入中...</div> : null}
            </div>

            <div className="mWheelStatsCard">
              <div className="mWheelStatsSingle">
                <div className="mWheelStatsMiniCard">
                  <div className="mWheelStatsMiniLabel">剩餘抽獎次數</div>
                  <div className="mWheelStatsMiniValue">{remaining}</div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {showWinModal && result && (
        <div className="mWheelWinMask" onClick={closeWin}>
          <div className="mWheelWinCenter">{renderWinContent()}</div>
        </div>
      )}
    </>
  );
}
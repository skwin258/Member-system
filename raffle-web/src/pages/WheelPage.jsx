import { useCallback, useEffect, useRef, useState } from "react";
import { api, clearToken } from "../api";
import "./WheelPage.css";
import scoinIcon from "../assets/scoin.png";
import { formatTaipeiDateTime } from "../utils/taipeiTime";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

const WINNERS_LIMIT = 12;
const WINNERS_POLL_MS = 5000;

/**
 * ✅ 你要調輪盤手感，主要看這兩個
 * WAIT_SPIN_RAD_PER_SEC：等待 API 時固定轉速（越小越慢）
 * SETTLE_EXTRA_TURNS_MIN/MAX：API 回來後還要多轉幾圈再停（越大越久）
 */
const WAIT_SPIN_RAD_PER_SEC = 5.4; // 約 309 度/秒，較自然、不突兀
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

function maskAccount(account) {
  const s = String(account || "").trim();
  if (!s) return "使用者";

  if (s.length >= 3) {
    return `${s.slice(0, 2)}***${s.slice(-1)}`;
  }

  if (s.length === 2) return `${s[0]}***${s[1]}`;
  if (s.length === 1) return `${s}***`;
  return "使用者";
}

// ✅ 安全轉數字：避免 NaN 顯示「非數值」
function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ✅ 名稱正規化：trim / 去空白 / 全形數字轉半形
function normName(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
}

// ✅ 角度正規化到 [0, 2π)
const normAngle = (a) => {
  const twopi = Math.PI * 2;
  return ((a % twopi) + twopi) % twopi;
};

// ✅ 極小偏移：避免剛好落在邊界造成 floor 算到隔壁格
const EPS = 1e-6;

/**
 * ✅ 指針落在哪一格（以「輪盤畫法」為準）
 * - 扇形：start = angle + i*slice, end = start+slice
 * - Canvas 角度 0 在「正右方」，指針畫在「正上方」
 * - 所以 pointerAngle = -π/2
 */
const segmentAtPointer = (angle, n) => {
  const twopi = Math.PI * 2;
  const slice = twopi / (n || 1);
  const pointerAngle = -Math.PI / 2;

  const relative = normAngle(pointerAngle - normAngle(angle) + EPS);
  const idx = Math.floor(relative / slice);
  return Math.max(0, Math.min((n || 1) - 1, idx));
};

/**
 * ✅ 目標角度（norm）：讓 idx 的「中心」對準指針
 * pointerAngle = angle + (idx + 0.5)*slice  =>  angle = pointerAngle - (idx+0.5)*slice
 */
const targetAngleForIndex = (idx, n) => {
  const twopi = Math.PI * 2;
  const slice = twopi / (n || 1);
  const pointerAngle = -Math.PI / 2;

  const target = pointerAngle - (idx * slice + slice / 2);
  return normAngle(target);
};

/**
 * ✅ 穩定排序（關鍵修正）
 * 這裡統一用 id 由小到大排序（沒有 id 就用 name）
 */
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

/* =========================
 * ✅ Session persistence keys
 * ========================= */
const SS_ANGLE_ABS = "sk_wheel_angle_abs";
const SS_ORDER = "sk_wheel_prize_order"; // JSON: [id,id,id...]

function loadSavedAngleAbs() {
  try {
    const v = sessionStorage.getItem(SS_ANGLE_ABS);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
function saveAngleAbs(a) {
  try {
    sessionStorage.setItem(SS_ANGLE_ABS, String(a));
  } catch {}
}
function loadSavedOrder() {
  try {
    const s = sessionStorage.getItem(SS_ORDER);
    if (!s) return null;
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return null;
    return arr.map(String);
  } catch {
    return null;
  }
}
function saveOrder(list) {
  try {
    const ids = (Array.isArray(list) ? list : []).map((p) => String(p?.id ?? ""));
    const cleaned = ids.filter((x) => x);
    sessionStorage.setItem(SS_ORDER, JSON.stringify(cleaned));
  } catch {}
}

/**
 * ✅ 若曾保存過 order，就用保存的順序重排（避免 remount 後跳格）
 * - 有 id 才能穩定重排，沒 id 就回到 stableSort
 */
function applySavedOrder(list, savedOrder) {
  if (!Array.isArray(list)) return [];
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return list;

  const map = new Map();
  for (const p of list) {
    const id = p?.id == null ? "" : String(p.id);
    if (id) map.set(id, p);
  }
  if (map.size === 0) return list;

  const used = new Set();
  const out = [];

  for (const id of savedOrder) {
    const p = map.get(String(id));
    if (p && !used.has(String(id))) {
      out.push(p);
      used.add(String(id));
    }
  }

  const rest = list.filter((p) => {
    const id = p?.id == null ? "" : String(p.id);
    return id && !used.has(id);
  });
  const restNoId = list.filter((p) => p?.id == null);

  const mergedRest = stableSortPrizes([...rest, ...restNoId]);
  return [...out, ...mergedRest];
}

/**
 * ✅ 核心：算「一定停在 targetNorm」的絕對角度（toAbs）
 * 這裡圈數改少一點，搭配平滑減速，整體會更自然
 */
function calcStopAbs(fromAbs, targetNorm, minTurns = 3, maxTurns = 4) {
  const twopi = Math.PI * 2;
  const turns = minTurns + Math.floor(Math.random() * (maxTurns - minTurns + 1));
  let k = Math.floor((fromAbs - targetNorm) / twopi);
  if (!Number.isFinite(k)) k = 0;

  let candidate = targetNorm + (k + 1) * twopi;
  candidate += turns * twopi;
  return candidate;
}

/* =========================
 * ✅ Wheel Win Popup (no card)
 * ========================= */

function resolvePrizeImage(pick) {
  const u =
    pick?.prize_image_url ||
    pick?.image_url ||
    pick?.img_url ||
    pick?.prize_img ||
    pick?.image ||
    "";
  const s = String(u || "").trim();
  return resolveImageUrl(s);
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

  if (!v) {
    v = extractNumberFromName(name);
  }

  const hasScoin =
    name.includes("S幣") || name.includes("S币") || t === "scoin" || t === "coin";

  const hasDiscount = name.includes("折抵") || name.includes("折抵金") || t === "discount";

  const hasCash = name.includes("現金") || t === "cash" || t === "money";

  if (hasScoin) {
    return { kind: "scoin", amount: v, img: scoinIcon };
  }

  if (hasDiscount) {
    return { kind: "discount", amount: v };
  }

  if (hasCash) {
    return { kind: "cash", amount: v };
  }

  const img = resolvePrizeImage(pick);
  if (img) {
    return { kind: "image", img };
  }

  return { kind: "text", text: name || "已領取獎勵" };
}

export default function WheelPage({ me, onBack, onRefreshMe }) {
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);

  const [winners, setWinners] = useState([]);
  const [winnersLoading, setWinnersLoading] = useState(false);

  const [result, setResult] = useState(null);

  const [displayWelfare, setDisplayWelfare] = useState(() =>
    toNum(me?.user?.welfare_balance, 0)
  );

  const [displayWinNumber, setDisplayWinNumber] = useState(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [winPayload, setWinPayload] = useState(null);

  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const angleRef = useRef(loadSavedAngleAbs());

  const bulbPhaseRef = useRef(0);
  const pressedRef = useRef(false);
  const modeRef = useRef("idle");

  const spinLockRef = useRef(false);
  const pauseWinnersPollRef = useRef(false);
  const waitSpinRafRef = useRef(null);
  const localWinnerQueueRef = useRef([]);

  const size = 520;
  const CENTER_BTN_R = 56;

  const u = me?.user || {};
  const limits = me?.limits || {};
  const used = me?.used || {};
  const wheelLimit = toNum(limits.wheel ?? 0, 0);
  const wheelUsed = toNum(used.wheel ?? 0, 0);

  const drawCount = wheelUsed;
  const claimText = `領取 ${wheelUsed}/${wheelLimit}`;

  const wheelSlotsRef = useRef([]);

  const loadPrizes = async () => {
    try {
      setLoading(true);
      const d = await api.wheelPrizes("wheel");
      if (!d?.success) throw new Error(d?.error || "load prizes failed");

      const raw = Array.isArray(d.prizes) ? d.prizes : [];
      const base = stableSortPrizes(raw);
      const savedOrder = loadSavedOrder();
      const list = applySavedOrder(base, savedOrder);

      setPrizes(list);
      wheelSlotsRef.current = list.slice();
      saveOrder(list);

      setResult(null);
      setShowWinModal(false);
      setWinPayload(null);
      setDisplayWinNumber(null);
    } catch (e) {
      alert("讀取輪盤獎項失敗：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const loadWinners = useCallback(async (silent = false, force = false) => {
    try {
      if (!silent) setWinnersLoading(true);

      if (typeof api.wheelHistory !== "function") {
        setWinners([]);
        return;
      }

      const d = await api.wheelHistory({ force });
      if (!d?.success) throw new Error(d?.error || "load winners failed");

      const rows = Array.isArray(d.items) ? d.items : [];

      const normalized = rows
        .map((it, idx) => ({
          id:
            it?.id ??
            `${it?.username || it?.display_name || "user"}-${it?.amount || 0}-${idx}`,
          display_name: it?.display_name || "",
          username: it?.username || "",
          prize_name: it?.prize_name || it?.prize_title || it?.name || "輪盤獎項",
          amount: Number(it?.amount ?? it?.prize_amount ?? 0),
          created_at: it?.created_at || "",
        }))
        .slice(0, WINNERS_LIMIT);

const localRows = Array.isArray(localWinnerQueueRef.current)
  ? localWinnerQueueRef.current
  : [];

localWinnerQueueRef.current = localRows.filter((local) => {
  return !normalized.some((srv) => {
    const sameUser =
      String(srv?.username || srv?.display_name || "") ===
      String(local?.username || local?.display_name || "");

    const samePrize =
      String(srv?.prize_name || srv?.prize || srv?.name || "") ===
      String(local?.prize_name || local?.prize || local?.name || "");

    const sameAmount =
      Number(srv?.amount ?? srv?.prize_amount ?? 0) ===
      Number(local?.amount ?? local?.prize_amount ?? 0);

    return sameUser && samePrize && sameAmount;
  });
});

const mergedRows = mergeWinnersKeepLocal(normalized);

setWinners((prev) => {
  if (JSON.stringify(prev) === JSON.stringify(mergedRows)) return prev;
  return mergedRows;
});

    } catch (e) {
      console.warn("[wheel] loadWinners failed:", e);
      if (!silent) setWinners([]);
    } finally {
      if (!silent) setWinnersLoading(false);
    }
  }, []);

  const drawWheel = (ctx, list, angle) => {
    const n = list.length || 1;
    const cx = size / 2;
    const cy = size / 2;

    const outerR = size / 2 - 6;
    const rimR = outerR - 10;
    const wheelR = rimR - 18;
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
        const r = outerR - 6;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        const on = ((i + phase) % 2) === 0;
        const alpha = on ? 0.95 : 0.35;

        ctx.beginPath();
        ctx.arc(x, y, 3.2, 0, Math.PI * 2);
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
      ctx.font = "bold 15px Arial";
      ctx.fillText(label, wheelR - 16, 6);

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
      ctx.arc(cx, cy, 56, 0, Math.PI * 2);
      ctx.fillStyle = "#b11616";
      ctx.fill();

      const g = ctx.createRadialGradient(cx - 10, cy - 10, 10, cx, cy, 52);
      g.addColorStop(0, "#ff6a6a");
      g.addColorStop(1, "#b11616");

      ctx.beginPath();
      ctx.arc(cx, cy, 50, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.font = "bold 16px Arial";
      ctx.fillText("點擊", cx, cy - 4);
      ctx.fillText("抽獎", cx, cy + 18);

      ctx.restore();
    }

    {
      const tipY = 58;
      const baseY = 18;
      const halfW = 10;

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
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    let last = performance.now();
    let saveT = 0;

    const loop = (now) => {
      const dt = now - last;
      last = now;

      const speed = modeRef.current === "spinning" ? 1 : 0.25;
      const inc = (dt * speed) / 220;
      if (inc >= 1) {
        bulbPhaseRef.current = (bulbPhaseRef.current + Math.floor(inc)) % 999999;
      }

      drawWheel(ctx, wheelSlotsRef.current, angleRef.current);

      saveT += dt;
      if (saveT >= 250) {
        saveT = 0;
        saveAngleAbs(angleRef.current);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    loadPrizes();
    loadWinners(false);

    const timer = setInterval(() => {
      if (pauseWinnersPollRef.current) return;
      loadWinners(true);
    }, WINNERS_POLL_MS);

    return () => clearInterval(timer);
  }, [loadWinners]);

  useEffect(() => {
    const next = toNum(me?.user?.welfare_balance, 0);
    const from = toNum(displayWelfare, 0);
    if (next === from) return;

    const start = performance.now();
    const ms = 700;

    const tick = (now) => {
      const t = clamp((now - start) / ms, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.floor(from + (next - from) * eased);
      setDisplayWelfare(cur);
      if (t < 1) requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }, [me?.user?.welfare_balance, displayWelfare]);

  /**
   * ✅ 平滑收尾：保留當前速度，不會 API 回來突然爆衝加速
   * 用 cubic Hermite，讓起始速度連續、終點速度為 0
   */
  const animateSpinSettle = (toAbs, startVelocity = WAIT_SPIN_RAD_PER_SEC) => {
    const from = angleRef.current;
    const distance = Math.max(0, toAbs - from);

    if (distance <= 0.0001) {
      angleRef.current = toAbs;
      saveAngleAbs(angleRef.current);
      return Promise.resolve();
    }

    // 時間依距離自動調整，讓它偏慢、偏順
    // 但不要長到太拖
    const minMs = 3200;
    const maxMs = 5200;

    // 這邊乘 1.2，會比單純等速更柔順
    let ms = (distance / Math.max(startVelocity, 0.001)) * 1000 * 1.2;
    ms = clamp(ms, minMs, maxMs);

    return new Promise((resolve) => {
      const t0 = performance.now();
      const T = ms / 1000;

      const step = (now) => {
        const elapsed = (now - t0) / 1000;
        const s = clamp(elapsed / T, 0, 1);

        // Hermite basis
        const h00 = 2 * s * s * s - 3 * s * s + 1;
        const h10 = s * s * s - 2 * s * s + s;
        const h01 = -2 * s * s * s + 3 * s * s;

        const value = h00 * from + h10 * T * startVelocity + h01 * toAbs;

        angleRef.current = value;

        if (s < 1) {
          requestAnimationFrame(step);
        } else {
          angleRef.current = toAbs;
          saveAngleAbs(angleRef.current);
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  };

  /**
   * ✅ 這個用在彈窗：0→目標數字（折抵金/現金/S幣）
   */
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
    const pn = normName(pick?.name);
    if (pn) {
      const i = wheelList.findIndex((p) => normName(p?.name) === pn);
      if (i >= 0) return i;
    }
    return -1;
  };

  const mergeWinnersKeepLocal = (serverRows) => {
  const localRows = Array.isArray(localWinnerQueueRef.current)
    ? localWinnerQueueRef.current
    : [];

  const all = [...localRows, ...(Array.isArray(serverRows) ? serverRows : [])];

  const seen = new Set();
  const merged = [];

  for (const row of all) {
    const key = [
      row?.username || row?.display_name || "",
      row?.prize_name || row?.prize || row?.name || "",
      Number(row?.amount ?? row?.prize_amount ?? 0),
      row?.created_at || row?.createdAt || "",
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }

  return merged.slice(0, WINNERS_LIMIT);
};

const pushLocalWinner = (pick) => {
  const item = {
    id: `local-${Date.now()}`,
    display_name: me?.user?.display_name || "",
    username: me?.user?.username || me?.user?.name || "",
    prize_name: String(pick?.name || pick?.prize_name || "輪盤獎項"),
    amount: Number(pick?.prize_value ?? pick?.amount ?? pick?.prize_amount ?? 0),
    created_at: new Date().toISOString(),
  };

  localWinnerQueueRef.current = [item, ...(localWinnerQueueRef.current || [])].slice(
    0,
    WINNERS_LIMIT
  );

  setWinners((prev) => mergeWinnersKeepLocal(prev));
};

  const spin = async () => {
    if (wheelLimit > 0 && wheelUsed >= wheelLimit) {
      alert("抽獎次數已用完");
      return;
    }
    if (spinning) return;
    if (spinLockRef.current) return;

    spinLockRef.current = true;
    pauseWinnersPollRef.current = true;

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

      // ✅ 先固定速度轉，不等 API
      stopWaitingSpin = startWaitingSpin();

      const d = await api.wheelSpin("wheel");

      // ✅ API 回來只停止等待圈，不再突然重拉高速動畫
      stopWaitingSpin();

      if (!d?.success) throw new Error(d?.error || "spin failed");
      const pick = d.result;

      const wheelList = wheelSlotsRef.current || [];
      const n = wheelList.length || 1;

      let idx = findPickIndex(pick, wheelList);
      if (idx < 0) {
        console.warn("[wheel] pick not found in wheelList", { pick, wheelList });
        setResult(pick);
        setWinPayload(buildWinPayload(pick));
        setShowWinModal(true);
        pushLocalWinner(pick);

        setTimeout(() => {
          loadWinners(false, true);
          pauseWinnersPollRef.current = false;
        }, 1800);

        return;
      }
      idx = Math.max(0, Math.min(n - 1, idx));

      const targetNorm = targetAngleForIndex(idx, n);

      // ✅ 圈數減少，但改成平順收尾，所以看起來不會爆衝
      const toAbs = calcStopAbs(
        angleRef.current,
        targetNorm,
        SETTLE_EXTRA_TURNS_MIN,
        SETTLE_EXTRA_TURNS_MAX
      );

      await animateSpinSettle(toAbs, WAIT_SPIN_RAD_PER_SEC);

      const landed = segmentAtPointer(angleRef.current, n);
      if (landed !== idx) {
        console.warn("[wheel] landed != idx (debug)", {
          idx,
          landed,
          pick: pick?.name,
          landedName: wheelList[landed]?.name,
          idxName: wheelList[idx]?.name,
          targetNorm,
          angleNorm: normAngle(angleRef.current),
        });
      }

      saveAngleAbs(angleRef.current);

      setResult(pick);
      const payload = buildWinPayload(pick);
      setWinPayload(payload);

      setShowWinModal(true);
      pushLocalWinner(pick);

      if (
        payload?.kind === "discount" ||
        payload?.kind === "cash" ||
        payload?.kind === "scoin"
      ) {
        setDisplayWinNumber(0);
        await animateWinNumber(payload.amount ?? 0, 900);
      }

      if (typeof onRefreshMe === "function") {
        setTimeout(async () => {
          saveAngleAbs(angleRef.current);
          await onRefreshMe?.();
        }, 650);
      }

      setTimeout(() => {
        loadWinners(false, true);
        pauseWinnersPollRef.current = false;
      }, 1800);
    } catch (e) {
      pauseWinnersPollRef.current = false;

      const msg = e?.message || String(e);
      if (/invalid token|missing token|401/i.test(msg)) {
        clearToken();
        onBack?.();
        return;
      }
      alert("抽獎失敗：" + msg);
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
    pauseWinnersPollRef.current = false;
  };

  function formatWinnerTime(v) {
  return formatTaipeiDateTime(v);
}

  const renderWinnerRow = (w, i) => {
    const who = maskAccount(w?.username || w?.display_name || "");
    const prize = w?.prize_name || w?.prize || w?.name || "輪盤獎項";
    const amount = Number(w?.amount ?? w?.prize_amount ?? 0);
    const atRaw = w?.created_at || w?.createdAt || w?.time || "";
    const at = formatWinnerTime(atRaw);

    return (
      <div key={w?.id ?? `${who}-${prize}-${i}`} className="wheelWinnerRow">
        <div className="wheelWinnerLeft">
          <div className="wheelWinnerName">{who}</div>
          <div className="wheelWinnerPrize">
            {prize}
            {amount > 0 ? ` ${amount}` : ""}
          </div>
        </div>
        <div className="wheelWinnerRight">
          {at ? <div className="wheelWinnerTime">{String(at)}</div> : null}
        </div>
      </div>
    );
  };

  const renderWinContent = () => {
    if (!winPayload) return null;

    const Title = () => <div className="wheelWinTitle">恭喜您獲得</div>;

    if (winPayload.kind === "discount") {
      return (
        <div className="wheelWinStack">
          <Title />
          <div className="wheelWinLine wheelWinLine--discount">
            <span className="wheelWinLabel">折抵金</span>
            <span className="wheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="wheelWinUnit">元</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "cash") {
      return (
        <div className="wheelWinStack">
          <Title />
          <div className="wheelWinLine wheelWinLine--cash">
            <span className="wheelWinLabel">現金</span>
            <span className="wheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="wheelWinUnit">元</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "scoin") {
      return (
        <div className="wheelWinStack">
          <Title />
          <div className="wheelWinLine wheelWinLine--img">
            <img className="wheelWinIcon" src={winPayload.img} alt="S幣" />
            <span className="wheelWinNum">{toNum(displayWinNumber, 0)}</span>
            <span className="wheelWinUnit">枚</span>
          </div>
        </div>
      );
    }

    if (winPayload.kind === "image") {
      return (
        <div className="wheelWinStack">
          <Title />
          <img className="wheelWinPrizeImg" src={winPayload.img} alt="prize" />
        </div>
      );
    }

    return (
      <div className="wheelWinStack">
        <Title />
        <div className="wheelWinText">{winPayload.text}</div>
      </div>
    );
  };

  return (
    <div className="wheelPage">
      <div className="wheelTopCard">
        <div className="wheelTitle">輪盤抽獎</div>

        <div className="wheelSub">
          使用者：<b>{u.display_name || u.username || "-"}</b>
          <span className="wheelDot">•</span>
          抽獎次數：<b>{drawCount}</b>
          <span className="wheelDot">•</span>
          <span className="wheelClaim">{claimText}</span>
          <span className="wheelDot">•</span>
          福利金：<b>{displayWelfare}</b>
        </div>
      </div>

      <div className="wheelBody3">
        <div className="wheelCard wheelCard--leftList">
          <div className="wheelCardTitleRow">
            <div className="wheelCardTitle">獎項列表</div>
            <button className="wheelMiniBtn" disabled={loading} onClick={loadPrizes}>
              {loading ? "刷新中..." : "刷新"}
            </button>
          </div>

          {loading ? (
            <div className="wheelMuted">載入中...</div>
          ) : prizes.length === 0 ? (
            <div className="wheelMuted">
              目前沒有獎項（確認 wheel_prizes 有資料、enabled=1）
            </div>
          ) : (
            <div className="wheelPrizeList">
              {prizes.map((p) => (
                <div key={p.id ?? p.name} className="wheelPrizeRow">
                  <div className="wheelPrizeName">{p.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="wheelCenterWrap">
          <div className="wheelCenterPlain">
            <div className="wheelCanvasWrap wheelCanvasWrap--big">
              <canvas
                ref={canvasRef}
                width={size}
                height={size}
                className={"wheelCanvas " + (spinning ? "isSpinning" : "")}
              />

              <button
                type="button"
                className={"wheelCenterHit " + (spinning ? "isDisabled" : "")}
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
                disabled={spinning}
              />
            </div>

            <div className="wheelActions wheelActions--center"></div>
          </div>
        </div>

        <div className="wheelRightCol">
          <div className="wheelCard wheelCard--rightHistory">
            <div className="wheelCardTitleRow">
              <div className="wheelCardTitle">歷史中獎</div>
              <button className="wheelMiniBtn" disabled={winnersLoading} onClick={loadWinners}>
                {winnersLoading ? "刷新中..." : "刷新"}
              </button>
            </div>

            {winnersLoading ? (
              <div className="wheelMuted">載入中...</div>
            ) : winners.length === 0 ? (
              <div className="wheelMuted">尚無資料（或你後端還沒提供 winners API）</div>
            ) : (
              <div className="wheelWinnersList">
                {winners.slice(0, WINNERS_LIMIT).map(renderWinnerRow)}
              </div>
            )}
          </div>
        </div>
      </div>

      {showWinModal && result && (
        <div className="wheelWinMask" onClick={closeWin}>
          <div className="wheelWinCenter">{renderWinContent()}</div>
        </div>
      )}
    </div>
  );
}
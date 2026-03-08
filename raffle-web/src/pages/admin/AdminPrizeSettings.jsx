// raffle-web/src/pages/admin/AdminPrizeSettings.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import "./AdminPrizeSettings.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

function resolveImageUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/r2/")) return API_BASE + s;
  return s;
}

function getUserActivityTimes(u) {
  return {
    redpacket: Number(
      u?.redpacket_times ??
      u?.redpacket_times_left ??
      u?.redpacket_left ??
      u?.redpacketTimesLeft ??
      u?.times_left_redpacket ??
      0
    ),
    wheel: Number(
      u?.wheel_times ??
      u?.wheel_times_left ??
      u?.wheel_left ??
      u?.wheelTimesLeft ??
      u?.times_left_wheel ??
      0
    ),
    number: Number(
      u?.number_times ??
      u?.number_times_left ??
      u?.number_left ??
      u?.numberTimesLeft ??
      u?.times_left_number ??
      0
    ),
  };
}

export default function AdminPrizeSettings() {
  const [tab, setTab] = useState("redpacket");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const [showGiveModal, setShowGiveModal] = useState(false);

  // redpacket
  const [rpCount, setRpCount] = useState(30);
  const [rpMode, setRpMode] = useState("pool");
  const [rpFixedAmount, setRpFixedAmount] = useState(66);
  const [rpAllowRepeat, setRpAllowRepeat] = useState(1);
  const [rpLockWhenAllOpened, setRpLockWhenAllOpened] = useState(1);
  const [rpPool, setRpPool] = useState([
    { amount: 10, prob: 40, enabled: 1, sort: 0 },
    { amount: 66, prob: 30, enabled: 1, sort: 1 },
    { amount: 188, prob: 20, enabled: 1, sort: 2 },
    { amount: 666, prob: 10, enabled: 1, sort: 3 },
  ]);

  // wheel
  const [wheelPrizes, setWheelPrizes] = useState([
    { name: "獎項A", prize_type: "welfare", prize_value: 50, prize_text: "", probability: 40, enabled: 1, sort: 0, image_url: "" },
    { name: "獎項B", prize_type: "welfare", prize_value: 100, prize_text: "", probability: 30, enabled: 1, sort: 1, image_url: "" },
    { name: "獎項C", prize_type: "physical", prize_value: 0, prize_text: "再接再厲", probability: 20, enabled: 1, sort: 2, image_url: "" },
    { name: "獎項D", prize_type: "none", prize_value: 0, prize_text: "", probability: 10, enabled: 1, sort: 3, image_url: "" },
  ]);

  // give times
  const [giveUserId, setGiveUserId] = useState("");
  const [giveActivityKey, setGiveActivityKey] = useState("wheel");
  const [giveMode, setGiveMode] = useState("add"); // add / set / subtract
  const [giveAmount, setGiveAmount] = useState(1);
  const [giveMsg, setGiveMsg] = useState("");
  const [giveBusy, setGiveBusy] = useState(false);

  // ✅ 新增：目前選中的使用者 + 目前抽獎次數
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedTimes, setSelectedTimes] = useState({
    redpacket: 0,
    wheel: 0,
    number: 0,
  });

  // modal 搜尋使用者
  const [userQ, setUserQ] = useState("");
  const [userList, setUserList] = useState([]);
  const [userLoading, setUserLoading] = useState(false);
  const userQTimer = useRef(null);

  const [uploadingIdx, setUploadingIdx] = useState(-1);
  const fileRefs = useRef({});

  const loadRedpacket = async () => {
    setErr("");
    setLoading(true);
    const r = await api.adminRedpacketGetConfig();
    setLoading(false);
    if (!r.success) {
      setErr(r.error || "讀取失敗");
      return;
    }

    const cfg = r.config || {};
    setRpCount(Number(cfg.count || 30));
    setRpMode(String(cfg.mode || "pool"));
    setRpFixedAmount(Number(cfg.fixed_amount || 0));
    setRpAllowRepeat(Number(cfg.allow_repeat ?? 1));
    setRpLockWhenAllOpened(Number(cfg.lock_when_all_opened ?? 0));

    let pool = [];
    try {
      pool = JSON.parse(cfg.pool_json || "[]");
    } catch {
      pool = [];
    }
    if (Array.isArray(pool) && pool.length) {
      setRpPool(
        pool.map((p, idx) => ({
          amount: Number(p.amount || 0),
          prob: Number(p.prob || p.weight || 0),
          enabled: Number(p.enabled ?? 1) ? 1 : 0,
          sort: Number(p.sort ?? idx),
        }))
      );
    }
  };

  const loadWheel = async () => {
    setErr("");
    setLoading(true);
    const r = await api.adminWheelPrizesList();
    setLoading(false);
    if (!r.success) {
      setErr(r.error || "讀取失敗");
      return;
    }
    const list = Array.isArray(r.items) ? r.items : [];
    if (list.length) {
      setWheelPrizes(
        list.map((x, idx) => ({
          name: x.name || `獎項${idx + 1}`,
          prize_type: x.prize_type || "none",
          prize_value: Number(x.prize_value || 0),
          prize_text: x.prize_text || "",
          image_url: x.image_url || "",
          probability: Number(x.probability || 0),
          enabled: Number(x.enabled || 0),
          sort: Number(x.sort ?? idx),
        }))
      );
    }
  };

  const load = async () => {
    if (tab === "redpacket") return await loadRedpacket();
    if (tab === "wheel") return await loadWheel();
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const saveRedpacket = async () => {
    setErr("");
    setSaving(true);

    const payload = {
      config: {
        count: Number(rpCount || 30),
        mode: rpMode,
        fixed_amount: Number(rpFixedAmount || 0),
        allow_repeat: Number(rpAllowRepeat || 0),
        lock_when_all_opened: Number(rpLockWhenAllOpened || 0),
      },
      pool: rpPool
        .map((x, idx) => ({
          amount: Number(x.amount || 0),
          prob: Number(x.prob || 0),
          enabled: Number(x.enabled || 0),
          sort: Number(x.sort ?? idx),
        }))
        .filter((x) => x.amount >= 0),
    };

    const r = await api.adminRedpacketSaveConfig(payload);
    setSaving(false);
    if (!r.success) {
      setErr(r.error || "儲存失敗");
      return;
    }
    await loadRedpacket();
  };

  const saveWheel = async () => {
    setErr("");
    setSaving(true);

    const items = wheelPrizes
      .map((x, idx) => ({
        name: String(x.name || "").trim(),
        prize_type: x.prize_type || "none",
        prize_value: Number(x.prize_value || 0),
        prize_text: x.prize_text || "",
        image_url: x.image_url || "",
        probability: Number(x.probability || 0),
        enabled: Number(x.enabled || 0),
        sort: Number(x.sort ?? idx),
      }))
      .filter((x) => x.name);

    const r = await api.adminWheelPrizesReplace(items);
    setSaving(false);
    if (!r.success) {
      setErr(r.error || "儲存失敗");
      return;
    }
    await loadWheel();
  };

  const totalRpProb = useMemo(() => {
    return rpPool.reduce((s, x) => s + Number(x.prob || 0) * (Number(x.enabled) ? 1 : 0), 0);
  }, [rpPool]);

  const totalWheelProb = useMemo(() => {
    return wheelPrizes.reduce((s, x) => s + Number(x.probability || 0) * (Number(x.enabled) ? 1 : 0), 0);
  }, [wheelPrizes]);

  async function uploadWheelImage(idx, file) {
    if (!file) return;

    setErr("");
    setUploadingIdx(idx);
    try {
      const r = await api.adminUploadPromotionImage(file);
      if (!r?.success) {
        setErr(r?.error || "上傳失敗");
        return;
      }
      const url = r.url || r.path || r.image_url || "";
      if (!url) {
        setErr("上傳成功但沒拿到 url/path，請確認後端回傳格式");
        return;
      }
      setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, image_url: url } : x)));
    } catch (e) {
      console.error(e);
      setErr("上傳失敗（例外）");
    } finally {
      setUploadingIdx(-1);
      try {
        if (fileRefs.current[idx]) fileRefs.current[idx].value = "";
      } catch {}
    }
  }

  function prizeTypeLabel(t) {
    if (t === "physical") return "實體獎品";
    if (t === "welfare") return "福利金";
    if (t === "scoin") return "S幣";
    if (t === "discount") return "折抵金";
    if (t === "none") return "無獎";
    return t || "—";
  }

  function prizeValueLabel(t) {
    if (t === "welfare") return "福利金";
    if (t === "scoin") return "S幣";
    if (t === "discount") return "折抵金";
    return "數值";
  }

  function shouldEnableValue(t) {
    return t === "welfare" || t === "scoin" || t === "discount";
  }

  useEffect(() => {
    if (!showGiveModal) return;
    setGiveMsg("");
    setErr("");
    setUserList([]);
    setUserQ("");
    setSelectedUser(null);
    setSelectedTimes({
      redpacket: 0,
      wheel: 0,
      number: 0,
    });
  }, [showGiveModal]);

  useEffect(() => {
    if (!showGiveModal) return;

    const html = document.documentElement;
    const body = document.body;

    html.classList.add("aps-modal-open");
    body.classList.add("aps-modal-open");

    const lockSelectors = [
      "#root",
      ".adminShellMain",
      ".adminShellBody",
      ".adminMain",
      ".adminContent",
      ".adminRight",
      ".adminPage",
      ".pageBody",
      ".content",
    ];

    const lockedEls = [];
    lockSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!el || lockedEls.find((x) => x.el === el)) return;
        lockedEls.push({
          el,
          overflow: el.style.overflow,
          overflowY: el.style.overflowY,
          overscroll: el.style.overscrollBehavior,
        });
        el.style.overflow = "hidden";
        el.style.overflowY = "hidden";
        el.style.overscrollBehavior = "none";
      });
    });

    const preventScroll = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest(".apsModalCard")) return;
      e.preventDefault();
    };

    const preventKeys = (e) => {
      const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
      if (!keys.includes(e.key)) return;

      const active = document.activeElement;
      if (active && active.closest && active.closest(".apsModalCard")) {
        if (e.key === " " || e.key === "PageDown" || e.key === "PageUp") e.preventDefault();
        return;
      }
      e.preventDefault();
    };

    window.addEventListener("wheel", preventScroll, { passive: false });
    window.addEventListener("touchmove", preventScroll, { passive: false });
    window.addEventListener("keydown", preventKeys, { passive: false });

    return () => {
      html.classList.remove("aps-modal-open");
      body.classList.remove("aps-modal-open");

      lockedEls.forEach(({ el, overflow, overflowY, overscroll }) => {
        el.style.overflow = overflow || "";
        el.style.overflowY = overflowY || "";
        el.style.overscrollBehavior = overscroll || "";
      });

      window.removeEventListener("wheel", preventScroll);
      window.removeEventListener("touchmove", preventScroll);
      window.removeEventListener("keydown", preventKeys);
    };
  }, [showGiveModal]);

  useEffect(() => {
    if (!showGiveModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") setShowGiveModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showGiveModal]);

  useEffect(() => {
    if (!showGiveModal) return;

    if (userQTimer.current) clearTimeout(userQTimer.current);

    userQTimer.current = setTimeout(async () => {
      const q = String(userQ || "").trim();

      if (!q) {
        setUserList([]);
        return;
      }

      if (q.length < 2) {
        setUserList([]);
        return;
      }

      setUserLoading(true);
      try {
        const r = await api.adminListUsers(q);
        const items = Array.isArray(r?.items) ? r.items : Array.isArray(r?.users) ? r.users : [];

        const isDigits = /^[0-9]+$/.test(q);
        const qLower = q.toLowerCase();

        const filtered = items.filter((u) => {
          const idStr = String(u?.id ?? "");
          const username = String(u?.username ?? u?.account ?? "").toLowerCase();
          const lineId = String(u?.line_id ?? "").toLowerCase();

          if (isDigits) {
            return idStr === q || username.includes(qLower) || lineId.includes(qLower);
          }
          return idStr.includes(q) || username.includes(qLower) || lineId.includes(qLower);
        });

        setUserList(filtered);
      } catch (e) {
        console.error(e);
        setUserList([]);
      } finally {
        setUserLoading(false);
      }
    }, 350);

    return () => {
      if (userQTimer.current) clearTimeout(userQTimer.current);
    };
  }, [userQ, showGiveModal]);

  function pickUser(u) {
    const times = getUserActivityTimes(u);
    setSelectedUser(u);
    setSelectedTimes(times);
    setGiveUserId(String(u.id || ""));
    setGiveMsg(`已選擇：${u.username || u.account || "user"}（ID=${u.id}）`);
  }

  async function applyGiveTimes() {
    setGiveMsg("");
    setErr("");

    const uid = Number(giveUserId || 0);
    if (!uid) {
      setGiveMsg("請輸入或選擇使用者 ID");
      return;
    }

    const amount = Number(giveAmount || 0);
    if (Number.isNaN(amount) || amount < 0) {
      setGiveMsg("請輸入正確次數");
      return;
    }

    setGiveBusy(true);
    try {
      const mode = giveMode === "subtract" ? "subtract" : giveMode === "set" ? "set" : "add";

      const r = await api.adminUserSetActivityTimes(uid, {
        activity_key: giveActivityKey,
        mode,
        amount,
      });

      if (!r.success) {
        setGiveMsg(r.error || "操作失敗");
        return;
      }

      const nextValue =
        r.row?.times_left ??
        r.times_left ??
        r.current_times_left ??
        null;

      if (nextValue !== null && selectedUser && Number(selectedUser.id) === uid) {
        setSelectedTimes((prev) => ({
          ...prev,
          [giveActivityKey]: Number(nextValue || 0),
        }));
      } else if (selectedUser && Number(selectedUser.id) === uid) {
        setSelectedTimes((prev) => {
          const current = Number(prev[giveActivityKey] || 0);
          let next = current;
          if (mode === "add") next = current + amount;
          if (mode === "subtract") next = Math.max(0, current - amount);
          if (mode === "set") next = amount;
          return { ...prev, [giveActivityKey]: next };
        });
      }

      setGiveMsg(`✅ 已更新：user ${uid} / ${giveActivityKey} 次數 = ${nextValue ?? "已套用"}`);
    } catch (e) {
      console.error(e);
      setGiveMsg("操作失敗（例外）");
    } finally {
      setGiveBusy(false);
    }
  }

  return (
    <div style={{ textAlign: "left" }}>
      <h2 style={{ marginTop: 0 }}>獎項設定</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <button className={`btn ${tab === "redpacket" ? "btnActive" : ""}`} onClick={() => setTab("redpacket")}>
          紅包抽獎
        </button>

        <button className={`btn ${tab === "wheel" ? "btnActive" : ""}`} onClick={() => setTab("wheel")}>
          輪盤抽獎
        </button>

        <button className="btn" onClick={() => setShowGiveModal(true)} title="給使用者抽獎次數">
          給次數
        </button>
      </div>

      <div style={{ opacity: 0.85, marginBottom: 12, lineHeight: 1.6 }}>
        此頁面調整的設定會直接影響前台抽獎結果與顯示。
      </div>

      {err ? <div style={{ marginBottom: 12, color: "#ffb3b3" }}>{err}</div> : null}

      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "讀取中..." : "重新讀取"}
        </button>
      </div>

      {tab === "redpacket" ? (
        <div className="cardBox">
          <h3 style={{ marginTop: 0 }}>紅包抽獎設定</h3>

          <div className="formRow">
            <label>紅包總數</label>
            <input className="input" type="number" value={rpCount} onChange={(e) => setRpCount(Number(e.target.value))} />
          </div>

          <div className="formRow">
            <label>模式</label>
            <select className="input" value={rpMode} onChange={(e) => setRpMode(e.target.value)}>
              <option value="pool">機率池</option>
              <option value="fixed">固定金額</option>
            </select>
          </div>

          <div className="formRow">
            <label>固定金額</label>
            <input className="input" type="number" value={rpFixedAmount} onChange={(e) => setRpFixedAmount(Number(e.target.value))} disabled={rpMode !== "fixed"} />
          </div>

          <div className="formRow">
            <label>允許重複抽到同金額</label>
            <select className="input" value={rpAllowRepeat} onChange={(e) => setRpAllowRepeat(Number(e.target.value))}>
              <option value={1}>是</option>
              <option value={0}>否</option>
            </select>
          </div>

          <div className="formRow">
            <label>全部打開後鎖定</label>
            <select className="input" value={rpLockWhenAllOpened} onChange={(e) => setRpLockWhenAllOpened(Number(e.target.value))}>
              <option value={1}>是</option>
              <option value={0}>否</option>
            </select>
          </div>

          <h4 style={{ marginTop: 18 }}>機率池（只在模式=機率池生效）</h4>

          <div style={{ overflowX: "auto" }}>
            <table className="adminTable" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 80 }}>金額</th>
                  <th style={{ minWidth: 80 }}>機率</th>
                  <th style={{ minWidth: 80 }}>啟用</th>
                  <th style={{ minWidth: 80 }}>排序</th>
                  <th style={{ minWidth: 80 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {rpPool
                  .slice()
                  .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
                  .map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.amount || 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRpPool((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: v } : x)));
                          }}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.prob || 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRpPool((prev) => prev.map((x, i) => (i === idx ? { ...x, prob: v } : x)));
                          }}
                          style={{ width: 90 }}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          value={Number(row.enabled || 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRpPool((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: v } : x)));
                          }}
                        >
                          <option value={1}>是</option>
                          <option value={0}>否</option>
                        </select>
                      </td>
                      <td>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.sort || 0)}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setRpPool((prev) => prev.map((x, i) => (i === idx ? { ...x, sort: v } : x)));
                          }}
                          style={{ width: 80 }}
                        />
                      </td>
                      <td>
                        <button className="btn" onClick={() => setRpPool((prev) => prev.filter((_, i) => i !== idx))}>
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, opacity: 0.8 }}>目前啟用總機率：{totalRpProb}</div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => setRpPool((prev) => [...prev, { amount: 0, prob: 0, enabled: 1, sort: prev.length }])}>
              新增一列
            </button>
            <button className="btn btnPrimary" onClick={saveRedpacket} disabled={saving}>
              {saving ? "儲存中..." : "儲存紅包設定"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "wheel" ? (
        <div className="cardBox">
          <h3 style={{ marginTop: 0 }}>輪盤獎項設定</h3>

          <div style={{ overflowX: "auto" }}>
            <table className="adminTable" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>名稱</th>
                  <th style={{ minWidth: 140 }}>類型</th>
                  <th style={{ minWidth: 120 }}>數值</th>
                  <th style={{ minWidth: 220 }}>說明（實體/備註）</th>
                  <th style={{ minWidth: 260 }}>圖片（可上傳）</th>
                  <th style={{ minWidth: 100 }}>機率</th>
                  <th style={{ minWidth: 90 }}>啟用</th>
                  <th style={{ minWidth: 80 }}>排序</th>
                  <th style={{ minWidth: 90 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {wheelPrizes
                  .slice()
                  .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0))
                  .map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="input"
                          value={row.name || ""}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                          style={{ width: 150 }}
                        />
                      </td>

                      <td>
                        <select
                          className="input"
                          value={row.prize_type || "none"}
                          onChange={(e) => {
                            const t = e.target.value;
                            setWheelPrizes((prev) =>
                              prev.map((x, i) => {
                                if (i !== idx) return x;
                                const next = { ...x, prize_type: t };
                                if (!shouldEnableValue(t)) next.prize_value = 0;
                                if (t === "none") {
                                  next.prize_value = 0;
                                  next.prize_text = "";
                                }
                                return next;
                              })
                            );
                          }}
                        >
                          <option value="none">無獎</option>
                          <option value="physical">實體獎品</option>
                          <option value="welfare">福利金</option>
                          <option value="scoin">S幣</option>
                          <option value="discount">折抵金</option>
                        </select>

                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>目前：{prizeTypeLabel(row.prize_type)}</div>
                      </td>

                      <td>
                        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{prizeValueLabel(row.prize_type)}</div>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.prize_value || 0)}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, prize_value: Number(e.target.value) } : x)))}
                          style={{ width: 90 }}
                          disabled={!shouldEnableValue(row.prize_type)}
                        />
                      </td>

                      <td>
                        <input
                          className="input"
                          value={row.prize_text || ""}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, prize_text: e.target.value } : x)))}
                          style={{ width: 210 }}
                          placeholder={row.prize_type === "physical" ? "例如：iPhone / AirPods / 禮盒" : "備註（可留空）"}
                          disabled={row.prize_type === "none"}
                        />
                      </td>

                      <td>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            className="input"
                            value={row.image_url || ""}
                            onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, image_url: e.target.value } : x)))}
                            style={{ width: 220 }}
                            placeholder="image_url（可手貼 /r2/...）"
                          />

                          <input
                            ref={(el) => (fileRefs.current[idx] = el)}
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => uploadWheelImage(idx, e.target.files?.[0])}
                          />

                          <button className="btn" onClick={() => fileRefs.current[idx]?.click?.()} disabled={uploadingIdx === idx}>
                            {uploadingIdx === idx ? "上傳中..." : "上傳"}
                          </button>

                          {row.image_url ? (
                            <img
                              src={resolveImageUrl(row.image_url)}
                              alt=""
                              style={{
                                width: 48,
                                height: 48,
                                objectFit: "cover",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.15)",
                              }}
                              onError={(e) => {
                                console.log("admin preview img fail:", e.currentTarget.src);
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                          提示：你可以直接上傳，也可以手貼 /r2/xxx.png
                        </div>
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.probability || 0)}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, probability: Number(e.target.value) } : x)))}
                          style={{ width: 80 }}
                        />
                      </td>

                      <td>
                        <select
                          className="input"
                          value={Number(row.enabled || 0)}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, enabled: Number(e.target.value) } : x)))}
                        >
                          <option value={1}>是</option>
                          <option value={0}>否</option>
                        </select>
                      </td>

                      <td>
                        <input
                          className="input"
                          type="number"
                          value={Number(row.sort || 0)}
                          onChange={(e) => setWheelPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, sort: Number(e.target.value) } : x)))}
                          style={{ width: 70 }}
                        />
                      </td>

                      <td>
                        <button className="btn" onClick={() => setWheelPrizes((prev) => prev.filter((_, i) => i !== idx))}>
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, opacity: 0.8 }}>目前啟用總機率：{totalWheelProb}</div>

          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button
              className="btn"
              onClick={() =>
                setWheelPrizes((prev) => [
                  ...prev,
                  { name: "", prize_type: "none", prize_value: 0, prize_text: "", image_url: "", probability: 0, enabled: 1, sort: prev.length },
                ])
              }
            >
              新增一列
            </button>
            <button className="btn btnPrimary" onClick={saveWheel} disabled={saving}>
              {saving ? "儲存中..." : "儲存輪盤設定"}
            </button>
          </div>
        </div>
      ) : null}

      {showGiveModal ? (
        <div
          className="apsModalOverlay"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowGiveModal(false);
          }}
        >
          <div className="apsModalCard">
            <div className="apsModalHeader">
              <h3 style={{ margin: 0 }}>給使用者抽獎次數</h3>
              <button className="btn apsModalCloseBtn" onClick={() => setShowGiveModal(false)}>
                關閉
              </button>
            </div>

            <div className="apsModalBody">
              {giveMsg ? <div style={{ marginTop: 12, marginBottom: 6, opacity: 0.95 }}>{giveMsg}</div> : null}

              <div className="apsModalGrid" style={{ marginTop: 14 }}>
                {/* 左 */}
                <div className="apsModalPanel">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>搜尋使用者</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input
                      className="input"
                      placeholder="至少 2 個字元（例：1234 / abcd）"
                      value={userQ}
                      onChange={(e) => setUserQ(e.target.value)}
                      style={{ width: 360 }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      {userLoading ? "搜尋中..." : userQ.trim().length < 2 ? "請輸入至少 2 個字元" : `結果：${userList.length}`}
                    </div>
                  </div>

                  {userList.length ? (
                    <div className="apsUserList">
                      {userList.slice(0, 50).map((u) => (
                        <button
                          key={u.id}
                          className="btn apsUserRow"
                          onClick={() => pickUser(u)}
                        >
                          <span>
                            <b style={{ marginRight: 10 }}>#{u.id}</b>
                            {u.username || u.account || "(no name)"}
                          </span>
                          <span style={{ opacity: 0.7 }}>{u.line_id ? `LINE: ${u.line_id}` : ""}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, opacity: 0.6, fontSize: 13 }}>
                      {userQ.trim().length < 2 ? "（請輸入至少 2 個字元）" : "（尚無結果）"}
                    </div>
                  )}
                </div>

                {/* 右 */}
                <div className="apsModalPanel">
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>設定次數</div>

                  <input
                    className="input"
                    placeholder="使用者 ID（例如 1234）"
                    value={giveUserId}
                    onChange={(e) => setGiveUserId(e.target.value)}
                    style={{ width: "100%", marginBottom: 10 }}
                  />

                  {selectedUser ? (
                    <div className="apsCurrentTimesBox">
                      <div className="apsCurrentTimesTitle">
                        目前抽獎次數：{selectedUser.username || selectedUser.account || "user"}（ID: {selectedUser.id}）
                      </div>

                      <div className="apsCurrentTimesGrid">
                        <div className="apsCurrentTimesItem">
                          <div className="apsCurrentTimesLabel">紅包</div>
                          <div className="apsCurrentTimesNum">{selectedTimes.redpacket}</div>
                        </div>

                        <div className="apsCurrentTimesItem">
                          <div className="apsCurrentTimesLabel">輪盤</div>
                          <div className="apsCurrentTimesNum">{selectedTimes.wheel}</div>
                        </div>

                        <div className="apsCurrentTimesItem">
                          <div className="apsCurrentTimesLabel">數字</div>
                          <div className="apsCurrentTimesNum">{selectedTimes.number}</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="apsCurrentTimesEmpty">
                      請先從左邊搜尋並點選使用者
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <select className="input" value={giveActivityKey} onChange={(e) => setGiveActivityKey(e.target.value)}>
                      <option value="redpacket">紅包抽獎</option>
                      <option value="wheel">輪盤抽獎</option>
                      <option value="number">數字抽獎</option>
                    </select>

                    <select className="input" value={giveMode} onChange={(e) => setGiveMode(e.target.value)}>
                      <option value="add">+次數</option>
                      <option value="subtract">-次數</option>
                      <option value="set">設定次數</option>
                    </select>

                    <div style={{ display: "flex", gap: 10 }}>
                      <input
                        className="input"
                        type="number"
                        value={giveAmount}
                        onChange={(e) => setGiveAmount(Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                      <button className="btn btnPrimary" disabled={giveBusy} onClick={applyGiveTimes}>
                        {giveBusy ? "套用中..." : "套用"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
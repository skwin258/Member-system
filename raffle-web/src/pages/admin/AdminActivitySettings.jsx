import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import AdminArcadeRules, { ARCADE_GAME_TABS } from "./AdminArcadeRules";

export default function AdminActivitySettings() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [tab, setTab] = useState("redpacket");

  const load = async () => {
    setErr("");
    setLoading(true);
    try {
      const r = await api.adminActivities();
      if (!r?.success) throw new Error(r?.error || "讀取失敗");
      setItems(Array.isArray(r.items) ? r.items : []);
    } catch(e) {
      setErr(e.message || "讀取失敗，請重新整理");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const tabs = [["redpacket", "紅包抽獎"], ["wheel", "輪盤抽獎"], ...ARCADE_GAME_TABS, ["number", "數字抽獎"]];
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (Number(a.sort || 0) - Number(b.sort || 0)) || String(a.key).localeCompare(String(b.key)));
  }, [items]);
  for (const row of sorted) {
    if (!tabs.some(([key]) => key === row.key)) tabs.push([row.key, row.name || row.key]);
  }
  const activity = sorted.filter(row => row.key === tab);
  const hasGameRules = tab === "redpacket" || tab === "wheel" || ARCADE_GAME_TABS.some(([key]) => key === tab);

  const setRow = (key, patch) => {
    setItems((prev) =>
      prev.map((x) => (x.key === key ? { ...x, ...patch } : x))
    );
  };

  const saveRow = async (row) => {
    setErr("");
    setSavingKey(row.key);
    const patch = {
      name: row.name,
      enabled: row.enabled,
      sort: row.sort,
      startAt: row.startAt,
      endAt: row.endAt,
      defaultTimes: row.defaultTimes,
      allowOverrideTimes: row.allowOverrideTimes,
      dailyReset: row.dailyReset,
      requireAuthorized: row.requireAuthorized,
    };
    try {
      const r = await api.adminPatchActivity(row.key, patch);
      if (!r?.success) throw new Error(r?.error || "儲存失敗");
      await load();
    } catch(e) {
      setErr(e.message || "儲存失敗，請再試一次");
    } finally {
      setSavingKey("");
    }
  };

  return (
    <div style={{ textAlign: "left" }}>
      <h2 style={{ marginTop: 0 }}>活動設定</h2>
      <div className="admin-settings-tabs" aria-label="活動與遊戲">
        {tabs.map(([key, name]) => <button key={key} type="button" className={`btn ${tab === key ? "btnActive" : ""}`}
          aria-pressed={tab === key} onClick={() => setTab(key)}>{name}</button>)}
      </div>

      <div style={{ opacity: 0.85, marginBottom: 12, lineHeight: 1.6 }}>
        此頁面控制前台活動的開啟/關閉與基本規則。變更後前台會即時生效。
      </div>

      {err ? (
        <div style={{ marginBottom: 12, color: "#ffb3b3" }}>{err}</div>
      ) : null}

      {(activity.length > 0 || loading || err) && <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "讀取中..." : "重新讀取"}
        </button>
      </div>}

      {activity.length > 0 && <div style={{ overflowX: "auto" }}>
        <div className="temple-table-scroll"><table className="adminTable" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 120 }}>Key</th>
              <th style={{ minWidth: 150 }}>名稱</th>
              <th style={{ minWidth: 90 }}>開關</th>
              <th style={{ minWidth: 80 }}>排序</th>
              <th style={{ minWidth: 180 }}>開始時間</th>
              <th style={{ minWidth: 180 }}>結束時間</th>
              <th style={{ minWidth: 110 }}>預設次數</th>
              <th style={{ minWidth: 140 }}>允許覆蓋次數</th>
              <th style={{ minWidth: 110 }}>每日重置</th>
              <th style={{ minWidth: 120 }}>需授權</th>
              <th style={{ minWidth: 120 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>
                  <input
                    className="input"
                    value={row.name || ""}
                    onChange={(e) => setRow(row.key, { name: e.target.value })}
                    style={{ width: 140 }}
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={Number(row.enabled || 0)}
                    onChange={(e) => setRow(row.key, { enabled: Number(e.target.value) })}
                  >
                    <option value={1}>開啟</option>
                    <option value={0}>關閉</option>
                  </select>
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    value={Number(row.sort || 0)}
                    onChange={(e) => setRow(row.key, { sort: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={row.startAt || ""}
                    onChange={(e) => setRow(row.key, { startAt: e.target.value })}
                    placeholder="YYYY-MM-DD HH:mm"
                    style={{ width: 170 }}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    value={row.endAt || ""}
                    onChange={(e) => setRow(row.key, { endAt: e.target.value })}
                    placeholder="YYYY-MM-DD HH:mm"
                    style={{ width: 170 }}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    value={Number(row.defaultTimes || 0)}
                    onChange={(e) => setRow(row.key, { defaultTimes: Number(e.target.value) })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <select
                    className="input"
                    value={Number(row.allowOverrideTimes || 0)}
                    onChange={(e) => setRow(row.key, { allowOverrideTimes: Number(e.target.value) })}
                  >
                    <option value={1}>允許</option>
                    <option value={0}>不允許</option>
                  </select>
                </td>
                <td>
                  <select
                    className="input"
                    value={Number(row.dailyReset || 0)}
                    onChange={(e) => setRow(row.key, { dailyReset: Number(e.target.value) })}
                  >
                    <option value={1}>是</option>
                    <option value={0}>否</option>
                  </select>
                </td>
                <td>
                  <select
                    className="input"
                    value={Number(row.requireAuthorized || 0)}
                    onChange={(e) => setRow(row.key, { requireAuthorized: Number(e.target.value) })}
                  >
                    <option value={1}>是</option>
                    <option value={0}>否</option>
                  </select>
                </td>
                <td>
                  <button
                    className="btn"
                    onClick={() => saveRow(row)}
                    disabled={savingKey === row.key}
                  >
                    {savingKey === row.key ? "儲存中..." : "儲存"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>}

      {activity.length > 0 && <div style={{ marginTop: 12, opacity: 0.75, lineHeight: 1.6 }}>
        注意：活動時間欄位若留空，代表不限制；若填寫，格式建議使用 （例如 2026-03-01 12:00）。
      </div>}
      {hasGameRules && <AdminArcadeRules key={tab} game={tab} />}
    </div>
  );
}

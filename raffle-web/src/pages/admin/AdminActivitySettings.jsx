import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

export default function AdminActivitySettings() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [savingKey, setSavingKey] = useState("");

  const load = async () => {
    setErr("");
    setLoading(true);
    const r = await api.adminActivities();
    setLoading(false);
    if (!r.success) {
      setErr(r.error || "讀取失敗");
      return;
    }
    setItems(Array.isArray(r.items) ? r.items : []);
  };

  useEffect(() => {
    load();
  }, []);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => (Number(a.sort || 0) - Number(b.sort || 0)) || String(a.key).localeCompare(String(b.key)));
  }, [items]);

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
    const r = await api.adminPatchActivity(row.key, patch);
    setSavingKey("");
    if (!r.success) {
      setErr(r.error || "儲存失敗");
      return;
    }
    await load();
  };

  return (
    <div style={{ textAlign: "left" }}>
      <h2 style={{ marginTop: 0 }}>活動設定</h2>

      <div style={{ opacity: 0.85, marginBottom: 12, lineHeight: 1.6 }}>
        此頁面控制前台活動的開啟/關閉與基本規則。變更後前台會即時生效。
      </div>

      {err ? (
        <div style={{ marginBottom: 12, color: "#ffb3b3" }}>{err}</div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "讀取中..." : "重新讀取"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="adminTable" style={{ width: "100%" }}>
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
            {sorted.map((row) => (
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
        </table>
      </div>

      <div style={{ marginTop: 12, opacity: 0.75, lineHeight: 1.6 }}>
        注意：活動時間欄位若留空，代表不限制；若填寫，格式建議使用 （例如 2026-03-01 12:00）。
      </div>
    </div>
  );
}

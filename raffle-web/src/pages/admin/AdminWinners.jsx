import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import { formatTaipeiDateTime } from "../../utils/taipeiTime";

const TYPE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "redpacket", label: "紅包" },
  { value: "wheel", label: "輪盤" },
  { value: "number", label: "數字" },
  { value: "redeem", label: "兌換" },
];

export default function AdminWinners() {
  const [type, setType] = useState("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);

  const load = async () => {
    setErr("");
    setLoading(true);
    const r = await api.adminWinners(type);
    setLoading(false);

    if (!r.success) {
      setErr(r.error || "讀取失敗");
      setItems([]);
      return;
    }

    setItems(Array.isArray(r.items) ? r.items : []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }, [items]);

  return (
    <div style={{ textAlign: "left" }}>
      <h2 style={{ marginTop: 0 }}>中獎資訊</h2>

      {err ? <div style={{ marginBottom: 12, color: "#ffb3b3" }}>{err}</div> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {TYPE_OPTIONS.map((x) => (
            <option key={x.value} value={x.value}>
              {x.label}
            </option>
          ))}
        </select>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "讀取中..." : "重新讀取"}
        </button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="adminTable" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 140 }}>時間</th>
              <th style={{ minWidth: 140 }}>使用者</th>
              <th style={{ minWidth: 140 }}>類型</th>
              <th style={{ minWidth: 220 }}>內容</th>
              <th style={{ minWidth: 120 }}>金額/值</th>
              <th style={{ minWidth: 120 }}>序號</th>
              <th style={{ minWidth: 120 }}>活動</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((w) => (
              <tr key={w.id}>
                <td>{formatTaipeiDateTime(w.created_at)}</td>
                <td>{w.username || w.user_id}</td>
                <td>{w.type}</td>
                <td>{w.title || w.prize_name || w.prize_text || ""}</td>
                <td>{w.value ?? w.amount ?? ""}</td>
                <td>{w.serial || ""}</td>
                <td>{w.activity_key || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

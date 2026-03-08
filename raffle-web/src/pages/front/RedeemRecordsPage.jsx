// raffle-web/src/pages/front/RedeemRecordsPage.jsx
import React, { useEffect, useState } from "react";
import { api } from "../../api";
import "./redeemRecordsPage.css";

function fmtDT(s){ return String(s||"").replace("T"," ").slice(0,19); }

export default function RedeemRecordsPage({ me, onBack }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [orders, setOrders] = useState([]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await api.shopOrders({ days: 90 });
      setOrders(data.orders || []);
    } catch (e) {
      setErr(e.message || "讀取失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="rrZ">
      <div className="rrHead">
        <div className="rrTitle">兌換紀錄（近90天）</div>
        <div className="rrBtns">
          <button className="rrBtn ghost" onClick={onBack}>返回商城</button>
          <button className="rrBtn" onClick={load} disabled={loading}>{loading ? "載入中..." : "重新整理"}</button>
        </div>
      </div>

      {err ? <div className="rrErr">{err}</div> : null}

      <div className="rrTableWrap">
        <table className="rrTable">
          <thead>
            <tr>
              <th>時間</th>
              <th>帳號</th>
              <th>類型</th>
              <th>狀態</th>
              <th>結果</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((x) => (
              <tr key={x.id}>
                <td className="mono">{fmtDT(x.created_at)}</td>
                <td className="mono">{x.account}</td>
                <td>商城</td>
                <td className={String(x.status)==="success" ? "ok":"fail"}>{x.status}</td>
                <td>扣除 S幣{Number(x.price_s||0)}</td>
                <td className="note">兌換{x.product_title}</td>
              </tr>
            ))}
            {!orders.length ? (
              <tr><td colSpan={6} className="empty">{loading ? "載入中..." : "目前沒有兌換紀錄"}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import "./mobileRecords.css";
import { formatTaipeiDateTime, getTaipeiTodayYmd } from "../utils/taipeiTime";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toYMD(d) {
  const parsed = parseYMD(d instanceof Date ? `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}` : String(d || ""));
  return parsed ? `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}` : getTaipeiTodayYmd();
}
function parseYMD(s) {
  const [y, m, d] = String(s || "")
    .split("-")
    .map((v) => Number(v));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function diffDays(a, b) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}
function clampRangeMax30(fromStr, toStr) {
  const f = parseYMD(fromStr);
  const t = parseYMD(toStr);
  if (!f || !t) return { fromStr, toStr };

  let from = f;
  let to = t;
  if (from.getTime() > to.getTime()) [from, to] = [to, from];

  const days = diffDays(from, to);
  if (days > 29) {
    const to2 = new Date(from);
    to2.setDate(to2.getDate() + 29);
    return { fromStr: toYMD(from), toStr: toYMD(to2) };
  }
  return { fromStr: toYMD(from), toStr: toYMD(to) };
}

function getQuickRange(key) {
  const today = parseYMD(getTaipeiTodayYmd()) || startOfDay(new Date());

  if (key === "today") return { from: today, to: today };

  if (key === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { from: d, to: d };
  }

  if (key === "thisWeek") {
    const day = (today.getDay() + 6) % 7;
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() - day);
    const thisSun = new Date(thisMon);
    thisSun.setDate(thisSun.getDate() + 6);
    return { from: thisMon, to: thisSun };
  }

  if (key === "thisMonth") {
    const y = today.getFullYear();
    const m = today.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    return { from: first, to: last };
  }

  return { from: today, to: today };
}

function activityLabel(k) {
  if (k === "redpacket") return "紅包抽獎";
  if (k === "wheel") return "輪盤抽獎";
  if (k === "number") return "數字抽獎";
  return k || "-";
}
function statusLabel(s) {
  if (s === "win") return "中獎";
  if (s === "lose") return "未中";
  return s || "-";
}
function fmtTs(s) {
  return formatTaipeiDateTime(s) || "-";
}

export default function MobileRecordsPage({ me, initialView = "raffle" }) {
  const u = me?.user || {};

  const [view, setView] = useState(initialView);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // raffle
  const [fromDate, setFromDate] = useState(getTaipeiTodayYmd());
  const [toDate, setToDate] = useState(getTaipeiTodayYmd());
  const [status, setStatus] = useState("all");
  const [activity, setActivity] = useState("all");
  const [account, setAccount] = useState(u?.username || "");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // wallet
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletErr, setWalletErr] = useState("");
  const [walletRows, setWalletRows] = useState([]);

  // redeem
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderErr, setOrderErr] = useState("");
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const fixed = clampRangeMax30(fromDate, toDate);
    if (fixed.fromStr !== fromDate) setFromDate(fixed.fromStr);
    if (fixed.toStr !== toDate) setToDate(fixed.toStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const rangeHint = useMemo(() => {
    const f = parseYMD(fromDate);
    const t = parseYMD(toDate);
    if (!f || !t) return "";
    let from = f;
    let to = t;
    if (from > to) [from, to] = [to, from];
    return `已選 ${diffDays(from, to) + 1} 天（最多 30 天）`;
  }, [fromDate, toDate]);

  async function doSearch() {
    setErr("");
    setLoading(true);
    try {
      const res = await api.records({
        from: fromDate,
        to: toDate,
        status,
        activity,
        account: String(account || "").trim(),
        q: String(keyword || "").trim(),
      });
      if (!res?.success) throw new Error(res?.error || "records failed");
      setRows(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setRows([]);
      setErr(String(e?.message || e || "查詢失敗"));
    } finally {
      setLoading(false);
    }
  }

  async function loadWallet(days = 90) {
    setWalletLoading(true);
    setWalletErr("");
    try {
      const r = await api.walletLogs({ days });
      if (r?.success === false) throw new Error(r?.error || "讀取失敗");
      setWalletRows(r.logs || r.items || []);
    } catch (e) {
      setWalletErr(String(e?.message || e || "讀取失敗"));
      setWalletRows([]);
    } finally {
      setWalletLoading(false);
    }
  }

  async function loadOrders(days = 90) {
    setOrderLoading(true);
    setOrderErr("");
    try {
      const r = await api.shopOrders({ days });
      if (r?.success === false) throw new Error(r?.error || "讀取失敗");
      setOrders(r.orders || r.items || []);
    } catch (e) {
      setOrderErr(String(e?.message || e || "讀取失敗"));
      setOrders([]);
    } finally {
      setOrderLoading(false);
    }
  }

  useEffect(() => {
    if (view === "wallet") loadWallet(90);
    if (view === "redeem") loadOrders(90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === "raffle") {
      doSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function quick(key) {
    const { from, to } = getQuickRange(key);
    const fixed = clampRangeMax30(toYMD(from), toYMD(to));
    setFromDate(fixed.fromStr);
    setToDate(fixed.toStr);
  }

  return (
    <div className="mRecPage">
      <div className="mRecTabs">
        <button
          className={`mRecTab ${view === "raffle" ? "active" : ""}`}
          onClick={() => setView("raffle")}
        >
          抽獎紀錄
        </button>
        <button
          className={`mRecTab ${view === "wallet" ? "active" : ""}`}
          onClick={() => setView("wallet")}
        >
          錢包流水
        </button>
        <button
          className={`mRecTab ${view === "redeem" ? "active" : ""}`}
          onClick={() => setView("redeem")}
        >
          兌換紀錄
        </button>
      </div>

      {view === "raffle" && (
        <>
<div className="mRecFilterCard">
  <div className="mRecQuickBar">
    <button className="mRecQuickChip" onClick={() => quick("today")}>今日</button>
    <button className="mRecQuickChip" onClick={() => quick("yesterday")}>昨日</button>
    <button className="mRecQuickChip" onClick={() => quick("thisWeek")}>本週</button>
    <button className="mRecQuickChip" onClick={() => quick("thisMonth")}>本月</button>
  </div>

  <div className="mRecStackFields">
    <label className="mRecSelectRow">
      <select value={activity} onChange={(e) => setActivity(e.target.value)}>
        <option value="all">遊戲合作夥伴</option>
        <option value="redpacket">紅包抽獎</option>
        <option value="wheel">輪盤抽獎</option>
        <option value="number">數字抽獎</option>
      </select>
    </label>

    <label className="mRecSelectRow">
      <select value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="all">類型</option>
        <option value="win">中獎</option>
        <option value="lose">未中</option>
      </select>
    </label>
  </div>

  <button className="mRecSearchBtn mRecSearchBtn--block" onClick={doSearch} disabled={loading}>
    {loading ? "查詢中..." : "搜尋"}
  </button>

  {err ? <div className="mRecError">{err}</div> : null}
</div>

<div className="mRecRecordsPanel">
  <div className="mRecScrollArea">
    <div className="mRecList">
      {loading ? (
        <div className="mRecEmpty">查詢中…</div>
      ) : rows.length === 0 ? (
        <div className="mRecEmpty">尚無資料</div>
      ) : (
        rows.map((r) => (
          <div className="mRecItemCard" key={r.id}>
            <div className="mRecItemTop">
              <div className="mRecTime">{r.time || "-"}</div>
              <div className={`mRecStatus ${r.status === "win" ? "win" : "lose"}`}>
                {statusLabel(r.status)}
              </div>
            </div>

            <div className="mRecMainPrize">
              {r.prize_title ? r.prize_title : "未中獎"}
              {Number(r.prize_amount || 0)
                ? `（${Number(r.prize_amount)}）`
                : ""}
            </div>

            <div className="mRecMetaGrid">
              <div className="mRecMetaBox">
                <span>帳號</span>
                <strong>{r.username || "-"}</strong>
              </div>
              <div className="mRecMetaBox">
                <span>類型</span>
                <strong>{activityLabel(r.type)}</strong>
              </div>
            </div>

            {r.note ? (
              <div className="mRecNote">
                <span>備註</span>
                <p>{r.note}</p>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  </div>
</div>
        </>
      )}

{view === "wallet" && (
  <div className="mRecRecordsPanel">
    <div className="mRecScrollArea">
      <div className="mRecList">
        <div className="mRecSectionHead">
          <div className="mRecSectionTitle">錢包流水</div>
          <div className="mRecSectionCount">近 90 天</div>
        </div>

        {walletLoading ? (
          <div className="mRecEmpty">載入中…</div>
        ) : walletErr ? (
          <div className="mRecError">{walletErr}</div>
        ) : walletRows.length === 0 ? (
          <div className="mRecEmpty">目前沒有流水</div>
        ) : (
          walletRows.map((r, idx) => (
            <div className="mRecItemCard" key={r.id || idx}>
              <div className="mRecItemTop">
                <div className="mRecTime">{fmtTs(r.created_at || r.ts)}</div>
                <div className="mRecTag">流水</div>
              </div>

              <div className="mRecMetaStack">
                <div className="mRecMetaLine">
                  <span>類別</span>
                  <strong>{r.category || "-"}</strong>
                </div>
                <div className="mRecMetaLine">
                  <span>變動</span>
                  <strong>
                    {r.delta_s ? `S${r.delta_s}` : ""}
                    {r.delta_welfare ? ` 福利${r.delta_welfare}` : ""}
                    {r.delta_discount ? ` 折抵${r.delta_discount}` : ""}
                  </strong>
                </div>
                <div className="mRecMetaLine">
                  <span>備註</span>
                  <strong>{r.note || r.action || "-"}</strong>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
)}

{view === "redeem" && (
  <div className="mRecRecordsPanel">
    <div className="mRecScrollArea">
      <div className="mRecList">
        <div className="mRecSectionHead">
          <div className="mRecSectionTitle">兌換紀錄</div>
          <div className="mRecSectionCount">近 90 天</div>
        </div>

        {orderLoading ? (
          <div className="mRecEmpty">載入中…</div>
        ) : orderErr ? (
          <div className="mRecError">{orderErr}</div>
        ) : orders.length === 0 ? (
          <div className="mRecEmpty">目前沒有兌換紀錄</div>
        ) : (
          orders.map((o, idx) => (
            <div className="mRecItemCard" key={o.id || idx}>
              <div className="mRecItemTop">
                <div className="mRecTime">{fmtTs(o.created_at)}</div>
                <div className="mRecTag">{o.status || "-"}</div>
              </div>

              <div className="mRecMainPrize">{o.product_name || o.title || o.product_title || "-"}</div>

              <div className="mRecMetaStack">
                <div className="mRecMetaLine">
                  <span>S幣</span>
                  <strong>{o.price_s ?? o.cost_s ?? "-"}</strong>
                </div>
                <div className="mRecMetaLine">
                  <span>狀態</span>
                  <strong>{o.status || "-"}</strong>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
)}
    </div>
  );
}
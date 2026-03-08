// raffle-web/src/pages/front/RecordsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import "./recordsPage.css";

/* =========================
 * Date utils (no deps)
 * ========================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toYMD(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
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

  // max 30 days (inclusive => from + 29)
  const days = diffDays(from, to);
  if (days > 29) {
    const to2 = new Date(from);
    to2.setDate(to2.getDate() + 29);
    return { fromStr: toYMD(from), toStr: toYMD(to2) };
  }
  return { fromStr: toYMD(from), toStr: toYMD(to) };
}

/* =========================
 * Quick ranges
 * ========================= */
function getQuickRange(key) {
  const now = new Date();
  const today = startOfDay(now);

  if (key === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { from: d, to: d };
  }
  if (key === "today") return { from: today, to: today };
  if (key === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { from: d, to: d };
  }
  if (key === "lastWeek") {
    // Mon~Sun last week
    const day = (today.getDay() + 6) % 7; // Mon=0
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() - day);
    const lastMon = new Date(thisMon);
    lastMon.setDate(lastMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(lastSun.getDate() - 1);
    return { from: lastMon, to: lastSun };
  }
  if (key === "thisWeek") {
    const day = (today.getDay() + 6) % 7;
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() - day);
    const thisSun = new Date(thisMon);
    thisSun.setDate(thisSun.getDate() + 6);
    return { from: thisMon, to: thisSun };
  }
  if (key === "lastMonth") {
    const y = today.getFullYear();
    const m = today.getMonth();
    const firstThis = new Date(y, m, 1);
    const lastPrev = new Date(firstThis);
    lastPrev.setDate(0);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
    return { from: firstPrev, to: lastPrev };
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

export default function RecordsPage({ me, initialView = "raffle" }) {
  const u = me?.user || {};

  // ✅ views: raffle | wallet | redeem
  const [view, setView] = useState(initialView);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // wallet logs
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletErr, setWalletErr] = useState("");
  const [walletRows, setWalletRows] = useState([]);

  // redeem orders
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderErr, setOrderErr] = useState("");
  const [orders, setOrders] = useState([]);

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

  // raffle filters (default today)
  const [fromDate, setFromDate] = useState(toYMD(new Date()));
  const [toDate, setToDate] = useState(toYMD(new Date()));

  const [status, setStatus] = useState("all");
  const [activity, setActivity] = useState("all");
  const [account, setAccount] = useState(u?.username || "");
  const [keyword, setKeyword] = useState("");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  // when switch view => load data
  useEffect(() => {
    if (view === "wallet") loadWallet(90);
    if (view === "redeem") loadOrders(90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // keep range <= 30d
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
    let from = f,
      to = t;
    if (from > to) [from, to] = [to, from];
    const days = diffDays(from, to) + 1;
    return `已選 ${days} 天（最多 30 天）`;
  }, [fromDate, toDate]);

  const doSearch = async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await api.records({
        from: fromDate,
        to: toDate,
        status,
        activity,
        account: account.trim(),
        q: keyword.trim(),
      });
      if (!res?.success) throw new Error(res?.error || "records failed");
      setRows(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      setRows([]);
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const quick = (key) => {
    const { from, to } = getQuickRange(key);
    const fixed = clampRangeMax30(toYMD(from), toYMD(to));
    setFromDate(fixed.fromStr);
    setToDate(fixed.toStr);
  };

  const title =
    view === "wallet" ? "錢包流水" : view === "redeem" ? "兌換紀錄" : "抽獎紀錄";

  return (
    <div className="recordsZ">
      <div className="recordsCard">
        <h2 className="h2">{title}</h2>
        <div className="muted">
        </div>

        <div style={{ height: 12 }} />

        {/* ✅ View tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`tabBtn ${view === "raffle" ? "active" : ""}`}
            onClick={() => setView("raffle")}
          >
            抽獎紀錄
          </button>
          <button
            className={`tabBtn ${view === "wallet" ? "active" : ""}`}
            onClick={() => setView("wallet")}
          >
            錢包流水
          </button>
          <button
            className={`tabBtn ${view === "redeem" ? "active" : ""}`}
            onClick={() => setView("redeem")}
          >
            兌換紀錄
          </button>
        </div>

        <div style={{ height: 12 }} />

        {/* =========================
            RAFFLE VIEW
        ========================= */}
        {view === "raffle" && (
          <>
            {/* ✅ 查詢卡 */}
            <div className="recordsSection">
              {/* row1: date */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "58px 180px 20px 180px 1fr",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>日期</div>

                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  style={inputStyle}
                />
                <div style={{ textAlign: "center", color: "rgba(255,255,255,0.7)" }}>
                  ~
                </div>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  style={inputStyle}
                />
                <div />
              </div>

              {/* row2: selects */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "78px 160px 96px 160px 1fr",
                  gap: 10,
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>狀態</div>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="all">全部</option>
                  <option value="win">中獎</option>
                  <option value="lose">未中</option>
                </select>

                <div style={{ fontWeight: 900 }}>類型</div>
                <select
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  style={inputStyle}
                >
                  <option value="all">全部</option>
                  <option value="redpacket">紅包抽獎</option>
                  <option value="wheel">輪盤抽獎</option>
                  <option value="number">數字抽獎</option>
                </select>

                <div />
              </div>

              {/* row3: quick */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "78px 1fr",
                  gap: 10,
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>快捷</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="tabBtn" onClick={() => quick("yesterday")}>
                    昨日
                  </button>
                  <button className="tabBtn" onClick={() => quick("today")}>
                    今日
                  </button>
                  <button className="tabBtn" onClick={() => quick("tomorrow")}>
                    明日
                  </button>
                  <button className="tabBtn" onClick={() => quick("lastWeek")}>
                    上週
                  </button>
                  <button className="tabBtn" onClick={() => quick("thisWeek")}>
                    本週
                  </button>
                  <button className="tabBtn" onClick={() => quick("lastMonth")}>
                    上月
                  </button>
                  <button className="tabBtn" onClick={() => quick("thisMonth")}>
                    本月
                  </button>
                </div>
              </div>

              {/* row4: account + keyword + search */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "78px 220px 78px 1fr 140px",
                  gap: 10,
                  alignItems: "center",
                  marginTop: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>帳號</div>
                <input
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="輸入帳號"
                  style={inputStyle}
                />

                <div style={{ fontWeight: 900 }}>關鍵字</div>
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="可輸入獎項/金額/備註"
                  style={inputStyle}
                />

                <button className="recordsSearchBtn" onClick={doSearch} disabled={loading}>
                  {loading ? "查詢中..." : "查詢"}
                </button>
              </div>

              {err ? <div className="recordsErr">查詢失敗：{err}</div> : null}
            </div>

            <div style={{ height: 14 }} />

            {/* ===== 列表 ===== */}
            <div className="card recordsSection">
              <div className="h2" style={{ marginBottom: 10 }}>
                紀錄列表（{rows.length}）
              </div>

              <div className="recordsTableWrap">
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>時間</th>
                      <th style={thStyle}>帳號</th>
                      <th style={thStyle}>類型</th>
                      <th style={thStyle}>狀態</th>
                      <th style={thStyle}>結果/獎項</th>
                      <th style={thStyle}>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 16, color: "rgba(255,255,255,0.65)" }}>
                          尚無資料（請按「查詢」）
                        </td>
                      </tr>
                    ) : (
                      rows.map((r) => (
                        <tr key={r.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                          <td style={tdStyle}>{r.time || "-"}</td>
                          <td style={tdStyle}>{r.username || "-"}</td>
                          <td style={tdStyle}>{activityLabel(r.type)}</td>
                          <td style={tdStyle}>{statusLabel(r.status)}</td>
                          <td style={tdStyle}>
                            {r.prize_title ? r.prize_title : "-"}
                            {Number(r.prize_amount || 0) ? `（${Number(r.prize_amount)}）` : ""}
                          </td>
                          <td style={tdStyle}>{r.note || ""}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* =========================
            WALLET VIEW
        ========================= */}
        {view === "wallet" && (
          <div className="recPanel">
            <div className="recPanelTitle">錢包流水（近 90 天）</div>
            {walletLoading ? <div className="recHint">載入中…</div> : null}
            {walletErr ? <div className="recErr">⚠️ {walletErr}</div> : null}
            {!walletLoading && !walletErr && (
              <div className="recTableWrap">
                <table className="recTable">
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>類別</th>
                      <th>變動</th>
                      <th>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(walletRows || []).map((r, idx) => (
                      <tr key={r.id || idx}>
                        <td>{String(r.created_at || r.ts || "-").slice(0, 19).replace("T", " ")}</td>
                        <td>{r.category || "-"}</td>
                        <td>
                          {r.delta_s ? `S${r.delta_s}` : ""}
                          {r.delta_welfare ? `  福利${r.delta_welfare}` : ""}
                          {r.delta_discount ? `  折抵${r.delta_discount}` : ""}
                        </td>
                        <td>{r.note || r.action || "-"}</td>
                      </tr>
                    ))}
                    {(!walletRows || walletRows.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ opacity: 0.75, padding: 12 }}>
                          目前沒有流水
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* =========================
            REDEEM VIEW
        ========================= */}
        {view === "redeem" && (
          <div className="recPanel">
            <div className="recPanelTitle">兌換紀錄（近 90 天）</div>
            {orderLoading ? <div className="recHint">載入中…</div> : null}
            {orderErr ? <div className="recErr">⚠️ {orderErr}</div> : null}
            {!orderLoading && !orderErr && (
              <div className="recTableWrap">
                <table className="recTable">
                  <thead>
                    <tr>
                      <th>時間</th>
                      <th>商品</th>
                      <th>S幣</th>
                      <th>狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders || []).map((o, idx) => (
                      <tr key={o.id || idx}>
                        <td>{String(o.created_at || "-").slice(0, 19).replace("T", " ")}</td>
                        <td>{o.title || o.product_title || "-"}</td>
                        <td>{o.price_s ?? o.cost_s ?? "-"}</td>
                        <td>{o.status || "-"}</td>
                      </tr>
                    ))}
                    {(!orders || orders.length === 0) && (
                      <tr>
                        <td colSpan={4} style={{ opacity: 0.75, padding: 12 }}>
                          目前沒有兌換紀錄
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================
 * inline styles
 * ========================= */
const inputStyle = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "rgba(255,255,255,0.92)",
  padding: "10px 12px",
  borderRadius: 12,
  outline: "none",
};

const thStyle = {
  textAlign: "left",
  padding: "12px 12px",
  fontWeight: 900,
  color: "rgba(255,255,255,0.9)",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tdStyle = {
  padding: "12px 12px",
  color: "rgba(255,255,255,0.85)",
};
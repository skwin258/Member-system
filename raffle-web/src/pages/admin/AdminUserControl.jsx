import React, { useEffect, useMemo, useState } from "react";
import { api, clearAdminToken } from "../../api";
import "./adminUsers.css";
import { formatTaipeiDateTime } from "../../utils/taipeiTime";

console.log("🔥 AdminUserControl loaded");

function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

function isDigits(s) {
  return /^[0-9]+$/.test(String(s ?? "").trim());
}

function fmtDT(s) {
  return formatTaipeiDateTime(s) || "";
}

function filterUsersByQ(list, qRaw) {
  const q = String(qRaw ?? "").trim();
  if (!q) return list;

  const qLower = q.toLowerCase();
  const qIsDigits = isDigits(q);

  return (Array.isArray(list) ? list : []).filter((u) => {
    const idStr = String(u?.id ?? "");
    const username = norm(u?.username || u?.account);
    const name = norm(u?.name || u?.display_name);
    const lineId = norm(u?.line_id);

    if (qIsDigits) {
      if (idStr === q) return true;
      return (
        username.includes(qLower) ||
        name.includes(qLower) ||
        lineId.includes(qLower)
      );
    }

    return (
      idStr.includes(q) ||
      username.includes(qLower) ||
      name.includes(qLower) ||
      lineId.includes(qLower)
    );
  });
}

export default function AdminUserControl() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);

  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("users");
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [redeemLoading, setRedeemLoading] = useState(false);
const [redeemRows, setRedeemRows] = useState([]);

  // 詳細資料編輯欄位
  const [account, setAccount] = useState("");
  const [name, setName] = useState("");
  const [lineId, setLineId] = useState("");
  const [lineVerified, setLineVerified] = useState(0);
  const [birthday, setBirthday] = useState("");

  const [bankHolder, setBankHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankLocked, setBankLocked] = useState(0);

    const [pw, setPw] = useState("");

  // 錢包異動
  const [deltaS, setDeltaS] = useState(0);
  const [deltaW, setDeltaW] = useState(0);
  const [deltaD, setDeltaD] = useState(0);
  const [adjAction, setAdjAction] = useState("新增");
  const [adjNote, setAdjNote] = useState("");

  const load = async () => {
    setErr("");
    setLoading(true);

    try {
      const query = String(q ?? "").trim();
      const r = await api.adminListUsers(query);

      if (!r?.success) {
        setErr(r?.error || "讀取失敗");
        setItems([]);
        return;
      }

      const raw = Array.isArray(r.items)
        ? r.items
        : Array.isArray(r.users)
        ? r.users
        : [];

      const filtered = query ? filterUsersByQ(raw, query) : raw;
      setItems(filtered);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "讀取失敗");
      setItems([]);

      if (String(e?.message || "").toLowerCase().includes("unauthorized")) {
        clearAdminToken();
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRedeems = async () => {
  setErr("");
  setRedeemLoading(true);

  try {
    const r = await api.adminShopOrders({ days: 90 });

    if (!r?.success) {
      setErr(r?.error || "讀取兌換總紀錄失敗");
      setRedeemRows([]);
      return;
    }

    setRedeemRows(
      Array.isArray(r.items) ? r.items : Array.isArray(r.orders) ? r.orders : []
    );
  } catch (e) {
    console.error(e);
    setErr(e?.message || "讀取兌換總紀錄失敗");
    setRedeemRows([]);
  } finally {
    setRedeemLoading(false);
  }
};

const toggleReview = async (id) => {
  try {
    const r = await api.adminToggleShopOrderReview(id);

    if (!r?.success) {
      alert(r?.error || "更新審核狀態失敗");
      return;
    }

    setRedeemRows((prev) =>
      prev.map((row) =>
        Number(row.id) === Number(id)
          ? { ...row, reviewed: Number(r.reviewed || 0) }
          : row
      )
    );
  } catch (e) {
    console.error(e);
    alert(e?.message || "更新審核狀態失敗");
  }
};

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
  if (view === "redeems") {
    loadRedeems();
  }
}, [view]);

  async function openUser(u) {
    if (!u?.id) return;

    setSelectedId(u.id);
    setDetailLoading(true);
    setUser(null);
    setLogs([]);
    setOrders([]);
    setErr("");

    try {
      let full = u;

      try {
        const data = await api.adminGetUser(u.id);
        if (data?.success !== false && data?.user) {
          full = data.user;
        }
      } catch (_) {
        // 後端如果沒有 /admin/users/:id，就沿用列表資料
      }

      setUser(full);

      // 每次切換使用者時重置錢包異動欄位
      setDeltaS(0);
      setDeltaW(0);
      setDeltaD(0);
      setAdjAction("新增");
      setAdjNote("");

      setAccount(full?.account || full?.username || "");
      setName(full?.name || full?.display_name || "");
      setLineId(full?.line_id || "");
      setLineVerified(Number(full?.line_verified || 0));
      setBirthday(full?.birthday || "");

      setBankHolder(full?.bank_holder || full?.bank?.bank_holder || "");
      setBankName(full?.bank_name || full?.bank?.bank_name || "");
      setBankBranch(full?.bank_branch || full?.bank?.bank_branch || "");
      setBankAccount(full?.bank_account || full?.bank?.bank_account || "");
      setBankLocked(
        Number(full?.bank_locked ?? full?.bank?.bank_locked ?? 0)
      );

      const [l1, o1] = await Promise.allSettled([
        api.adminUserWalletLogs(u.id, { days: 90 }),
        api.adminUserOrders(u.id, { days: 90 }),
      ]);

      setLogs(
        l1.status === "fulfilled"
          ? l1.value?.items || l1.value?.logs || []
          : []
      );

      setOrders(
        o1.status === "fulfilled"
          ? o1.value?.items || o1.value?.orders || []
          : []
      );
    } catch (e) {
      console.error(e);
      setErr(e?.message || "讀取使用者失敗");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveUser() {
    if (!user?.id) return;

    setSaving(true);
    setErr("");

    try {
      const patch = {
        username: String(account || "").trim(),
        name: String(name || "").trim(),
        birthday: String(birthday || "").trim(),
        line_id: String(lineId || "").trim(),
        line_verified: Number(lineVerified || 0),

        bank_holder: String(bankHolder || "").trim(),
        bank_name: String(bankName || "").trim(),
        bank_branch: String(bankBranch || "").trim(),
        bank_account: String(bankAccount || "").trim(),

        // 後端若有接收可留著，沒接也不影響
        bank_locked: Number(bankLocked || 0),
      };

      if (String(pw || "").trim()) {
        patch.password = String(pw).trim();
      }

      const res = await api.adminUpdateUser(user.id, patch);
      if (!res?.success) throw new Error(res?.error || "更新失敗");

      const updatedUser = {
        ...user,
        account: String(account || "").trim(),
        username: String(account || "").trim(),
        name: String(name || "").trim(),
        display_name: String(name || "").trim(),
        birthday: String(birthday || "").trim(),
        line_id: String(lineId || "").trim(),
        line_verified: Number(lineVerified || 0),
        bank_holder: String(bankHolder || "").trim(),
        bank_name: String(bankName || "").trim(),
        bank_branch: String(bankBranch || "").trim(),
        bank_account: String(bankAccount || "").trim(),
        bank_locked: Number(bankLocked || 0),
      };

      setUser(updatedUser);
      setPw("");

      setItems((prev) =>
        prev.map((x) =>
          String(x.id) === String(user.id)
            ? {
                ...x,
                username: updatedUser.username,
                account: updatedUser.username,
                name: updatedUser.name,
                display_name: updatedUser.display_name,
                line_id: updatedUser.line_id,
                line_verified: updatedUser.line_verified,
                birthday: updatedUser.birthday,
                bank_holder: updatedUser.bank_holder,
                bank_name: updatedUser.bank_name,
                bank_branch: updatedUser.bank_branch,
                bank_account: updatedUser.bank_account,
              }
            : x
        )
      );

      alert("已更新");
    } catch (e) {
      console.error(e);
      alert(e?.message || "更新失敗");
    } finally {
      setSaving(false);
    }
  }

    async function adjustWallet() {
    if (!user?.id) return;

    if (!deltaS && !deltaW && !deltaD) {
      alert("請輸入至少一個異動金額");
      return;
    }

    setSaving(true);
    setErr("");

    try {
      const res = await api.adminAdjustWallet(user.id, {
        delta_s: Number(deltaS || 0),
        delta_welfare: Number(deltaW || 0),
        delta_discount: Number(deltaD || 0),
        action: adjAction,
        note: String(adjNote || "").trim(),
      });

      if (!res?.success && !res?.user) {
        throw new Error(res?.error || "異動失敗");
      }

      const updatedUser = res?.user
        ? { ...user, ...res.user }
        : {
            ...user,
            s_balance:
              Number(user?.s_balance || 0) +
              (adjAction === "扣除" ? -Math.abs(Number(deltaS || 0)) : Number(deltaS || 0)),
            welfare_balance:
              Number(user?.welfare_balance || 0) +
              (adjAction === "扣除" ? -Math.abs(Number(deltaW || 0)) : Number(deltaW || 0)),
            discount_balance:
              Number(user?.discount_balance || 0) +
              (adjAction === "扣除" ? -Math.abs(Number(deltaD || 0)) : Number(deltaD || 0)),
          };

      setUser(updatedUser);

      setItems((prev) =>
        prev.map((x) =>
          String(x.id) === String(user.id)
            ? {
                ...x,
                s_balance: updatedUser.s_balance,
                welfare_balance: updatedUser.welfare_balance,
                discount_balance: updatedUser.discount_balance,
              }
            : x
        )
      );

      try {
        const l1 = await api.adminUserWalletLogs(user.id, { days: 90 });
        setLogs(l1?.items || l1?.logs || []);
      } catch (_) {
        // 不影響主流程
      }

      setDeltaS(0);
      setDeltaW(0);
      setDeltaD(0);
      setAdjNote("");

      alert("已異動");
    } catch (e) {
      console.error(e);
      alert(e?.message || "異動失敗");
    } finally {
      setSaving(false);
    }
  }

  async function removeUser() {
    if (!user?.id) return;
    if (!confirm(`確定刪除使用者：${user.username || user.account} ?`)) return;

    setSaving(true);
    setErr("");

    try {
      const r = await api.adminRemoveUser(user.id);
      if (!r?.success) throw new Error(r?.error || "刪除失敗");

      setItems((prev) => prev.filter((x) => String(x.id) !== String(user.id)));
      setSelectedId(null);
      setUser(null);
      setLogs([]);
      setOrders([]);
      alert("已刪除");
    } catch (e) {
      console.error(e);
      alert(e?.message || "刪除失敗");
    } finally {
      setSaving(false);
    }
  }

  const sorted = useMemo(() => {
    return [...items].sort((a, b) =>
      String(a.username ?? a.account ?? "").localeCompare(
        String(b.username ?? b.account ?? "")
      )
    );
  }, [items]);

  return (
    <div className="auZ auNoPageScroll">
<div className="auHead">
  <div className="auTabs">
  <button
    className={`auTab ${view === "users" ? "active" : ""}`}
    onClick={() => setView("users")}
  >
    使用者面板
  </button>

  <button
    className={`auTab ${view === "redeems" ? "active" : ""}`}
    onClick={() => setView("redeems")}
  >
    兌換總紀錄
  </button>
</div>

  <div className="auSearchBar">
    <input
      className="auSearch"
      placeholder="搜尋 ID / 帳號 / 姓名（例：1234 / 小明）"
      value={q}
      onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") load();
      }}
    />
    <button className="auBtn primary" onClick={load} disabled={loading}>
      {loading ? "讀取中..." : "搜尋"}
    </button>
  </div>
</div>

{err ? <div className="auErr">{err}</div> : null}

{view === "users" && (
<div className="auMainGrid">
        {/* 左側列表 */}
<div className="auLeftPane">
  <div className="auPaneHead">
    <div className="auPaneTitle">使用者列表</div>
    <div className="auPaneSub">點選一位使用者後，在右側查看詳細資料</div>
  </div>

  <div className="auLeftList">
    {sorted.map((u) => {
      const active = String(selectedId) === String(u.id);
      return (
        <button
          key={u.id}
          className={`auItem ${active ? "active" : ""}`}
          onClick={() => openUser(u)}
        >
          <div className="auItemTop">
            <span className="auIdBadge">#{u.id}</span>
            <span className="auAccount">{u.account || u.username || "-"}</span>
          </div>
          <div className="auName">{u.name || u.display_name || "-"}</div>
        </button>
      );
    })}

    {!sorted.length ? (
      <div className="auEmpty">
        {q.trim() ? "沒有符合的使用者" : "目前沒有資料"}
      </div>
    ) : null}
  </div>
</div>

        {/* 右側詳細 */}
<div className="auRightPane">
  {!selectedId ? (
    <div className="auRightEmpty">
      請先從左側選擇一位使用者
    </div>
  ) : detailLoading ? (
    <div className="auRightEmpty">載入中...</div>
  ) : !user ? (
    <div className="auRightEmpty">讀取失敗</div>
  ) : (
    <>
      <div className="auRightScroll">
        <div className="auSection">
          <div className="auSectionTitle">基本資料</div>
          <div className="auGrid">
            <label className="auField">
              <div className="auLab">ID</div>
              <div className="auStatic mono">{user.id}</div>
            </label>

            <label className="auField">
              <div className="auLab">帳號</div>
              <input
                className="auInp"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              />
            </label>

            <label className="auField">
              <div className="auLab">姓名</div>
              <input
                className="auInp"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <label className="auField wide">
              <div className="auLab">LINE ID</div>
              <div className="auRow">
                <input
                  className="auInp"
                  value={lineId}
                  onChange={(e) => setLineId(e.target.value)}
                />
                <button
                  className={"auMini " + (lineVerified ? "on" : "")}
                  onClick={() => setLineVerified(lineVerified ? 0 : 1)}
                  title="點擊切換驗證"
                  type="button"
                >
                  {lineVerified ? "✓ 已驗證" : "未驗證"}
                </button>
              </div>
            </label>

            <label className="auField">
              <div className="auLab">生日</div>
              <input
                className="auInp"
                type="date"
                value={birthday || ""}
                onChange={(e) => setBirthday(e.target.value)}
              />
            </label>

            <label className="auField">
              <div className="auLab">修改密碼</div>
              <input
                className="auInp"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="留空不修改"
              />
            </label>
          </div>
        </div>

                <div className="auSection">
          <div className="auSectionTitle">錢包餘額</div>

          <div className="auBalanceRow">
            <span>
              S幣：<b className="green">{Number(user?.s_balance || 0)}</b>
            </span>
            <span>
              福利金：<b>{Number(user?.welfare_balance || 0)}</b>
            </span>
            <span>
              折抵金：<b>{Number(user?.discount_balance || 0)}</b>
            </span>
          </div>

          <div className="auGrid">
            <label className="auField">
              <div className="auLab">S幣異動</div>
              <input
                className="auInp mono"
                type="number"
                value={deltaS}
                onChange={(e) => setDeltaS(Number(e.target.value))}
              />
            </label>

            <label className="auField">
              <div className="auLab">福利金異動</div>
              <input
                className="auInp mono"
                type="number"
                value={deltaW}
                onChange={(e) => setDeltaW(Number(e.target.value))}
              />
            </label>

            <label className="auField">
              <div className="auLab">折抵金異動</div>
              <input
                className="auInp mono"
                type="number"
                value={deltaD}
                onChange={(e) => setDeltaD(Number(e.target.value))}
              />
            </label>

            <label className="auField">
              <div className="auLab">動作</div>
              <select
                className="auSelect"
                value={adjAction}
                onChange={(e) => setAdjAction(e.target.value)}
              >
                <option value="新增">新增</option>
                <option value="扣除">扣除</option>
              </select>
            </label>

            <label className="auField wide">
              <div className="auLab">備註</div>
              <input
                className="auInp"
                value={adjNote}
                onChange={(e) => setAdjNote(e.target.value)}
                placeholder="例如：管理員新增 / 管理員扣除 / 補償"
              />
            </label>
          </div>

          <div className="auInlineActions">
            <button
              className="auBtn"
              disabled={saving}
              onClick={adjustWallet}
            >
              {saving ? "處理中..." : "送出異動"}
            </button>
          </div>
        </div>

        <div className="auSection">
          <div className="auSectionTitle">銀行資料</div>
          <div className="auGrid">
            <label className="auField">
              <div className="auLab">戶名</div>
              <input
                className="auInp"
                value={bankHolder}
                onChange={(e) => setBankHolder(e.target.value)}
              />
            </label>

            <label className="auField">
              <div className="auLab">銀行</div>
              <input
                className="auInp"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
              />
            </label>

            <label className="auField">
              <div className="auLab">分行</div>
              <input
                className="auInp"
                value={bankBranch}
                onChange={(e) => setBankBranch(e.target.value)}
              />
            </label>

            <label className="auField">
              <div className="auLab">帳號</div>
              <input
                className="auInp"
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
              />
            </label>

            <label className="auField">
            </label>
          </div>
        </div>

        <div className="auSection">
          <div className="auSectionTitle">抽獎紀錄 / 異動紀錄（近90天）</div>
          <div className="logWrap">
            <table className="logTable">
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
                {logs.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{fmtDT(x.created_at)}</td>
                    <td className="mono">
                      {x.account || x.username || user.username}
                    </td>
                    <td>{x.category || x.action || "-"}</td>
                    <td
                      className={
                        String(x.status) === "success" ? "ok" : "fail"
                      }
                    >
                      {x.status}
                    </td>
                    
                    <td>{x.result}</td>
                    <td className="note">
                      {x.note}
                      {x.admin_account ? `（${x.admin_account}）` : ""}
                    </td>
                  </tr>
                ))}
                {!logs.length ? (
                  <tr>
                    <td colSpan={6} className="empty">
                      無紀錄
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="auSection">
          <div className="auSectionTitle">兌換紀錄（近90天）</div>
          <div className="logWrap">
            <table className="logTable">
              <thead>
                <tr>
                  <th>時間</th>
                  <th>帳號</th>
                  <th>狀態</th>
                  <th>扣除</th>
                  <th>商品</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{fmtDT(x.created_at)}</td>
                    <td className="mono">
                      {x.account || x.username || user.username}
                    </td>
                    <td
                      className={
                        String(x.status) === "success" ? "ok" : "fail"
                      }
                    >
                      {x.status}
                    </td>
                    <td>扣除 S幣 {Number(x.cost_s || x.price_s || 0)}</td>
                    <td className="note">
                      {x.product_name || x.product_title || "-"}
                    </td>
                  </tr>
                ))}
                {!orders.length ? (
                  <tr>
                    <td colSpan={5} className="empty">
                      無紀錄
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="auActionBar">
        <button className="auBtn primary" onClick={saveUser} disabled={saving}>
          {saving ? "儲存中..." : "儲存使用者資料"}
        </button>
        <button
          className="auBtn danger"
          onClick={removeUser}
          disabled={saving}
        >
          刪除使用者
        </button>
      </div>
    </>
  )}
</div>
</div>
)}

{view === "redeems" && (
  <div className="auRedeemPanel">
    <div className="auRedeemPanelHead">
      <div>
        <div className="auRedeemTitle">兌換總紀錄（近90天）</div>
        <div className="auRedeemSub">可上下捲動查看全部兌換資料，支援審核切換。</div>
      </div>

      <div className="auRedeemCount">
        {redeemLoading ? "讀取中..." : `共 ${redeemRows.length} 筆`}
      </div>
    </div>

    <div className="auRedeemTableWrap">
      <table className="logTable auRedeemTable">
        <thead>
          <tr>
            <th>ID</th>
            <th>時間</th>
            <th>帳號</th>
            <th>商品</th>
            <th>扣除S幣</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>

        <tbody>
          {redeemRows.map((x) => (
            <tr key={x.id}>
              <td className="mono">{x.id}</td>
              <td className="mono">{fmtDT(x.created_at)}</td>
              <td className="mono">{x.account || x.username || "-"}</td>

              <td className="note">
                {x.product_name || x.product_title || "-"}
              </td>

              <td>{Number(x.cost_s || x.price_s || 0)}</td>

              <td className={String(x.status) === "success" ? "ok" : "fail"}>
                {x.status}
              </td>

              <td>
                {Number(x.reviewed || 0) === 1 ? (
                  <button
                    className="auBtn mini"
                    style={{
                      background: "rgba(0,200,100,.18)",
                      border: "1px solid rgba(0,255,140,.45)",
                      color: "#00ff88",
                      fontWeight: 700,
                    }}
                    onClick={() => toggleReview(x.id)}
                  >
                    ✔
                  </button>
                ) : (
                  <button
                    className="auBtn mini"
                    onClick={() => toggleReview(x.id)}
                  >
                    審核
                  </button>
                )}
              </td>
            </tr>
          ))}

          {!redeemRows.length && !redeemLoading && (
            <tr>
              <td colSpan={7} className="empty">
                沒有兌換紀錄
              </td>
            </tr>
          )}

          {redeemLoading && (
            <tr>
              <td colSpan={7} className="empty">
                讀取中...
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
)}

<div style={{ marginTop: 12, opacity: 0.75, lineHeight: 1.6 }}>
      </div>
    </div>
  );
}
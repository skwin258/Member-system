// raffle-web/src/pages/admin/AdminUsers.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api, clearAdminToken } from "../../api";
import "./adminUsers.css";
import { formatTaipeiDateTime } from "../../utils/taipeiTime";

function fmtDT(s){ return formatTaipeiDateTime(s) || ""; }

function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="auOverlay" onMouseDown={(e)=>{ if (e.target===e.currentTarget) onClose?.(); }}>
      <div className="auCard">
        {children}
      </div>
    </div>
  );
}

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");

  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const [orders, setOrders] = useState([]);

  const [saving, setSaving] = useState(false);

  // edit states
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

  // wallet adjust
  const [deltaS, setDeltaS] = useState(0);
  const [deltaW, setDeltaW] = useState(0);
  const [deltaD, setDeltaD] = useState(0);
  const [adjAction, setAdjAction] = useState("新增");
  const [adjNote, setAdjNote] = useState("");

  async function search() {
    setLoading(true);
    setErr("");
    try {
const data = await api.adminSearchUsers(q);
const arr = data.users || data.items || [];
const kw = q.trim().toLowerCase();

// ✅ 前端保底：只顯示 account / name / id 有命中的
const filtered = arr.filter(u => {
  const id = String(u.id ?? "").toLowerCase();
  const account = String(u.account ?? u.username ?? "").toLowerCase();
  const name = String(u.name ?? u.display_name ?? "").toLowerCase();
  return kw.length >= 2 && (id.includes(kw) || account.includes(kw) || name.includes(kw));
});

setList(filtered);
    } catch (e) {
      setErr(e.message || "搜尋失敗");
      if (String(e.message||"").toLowerCase().includes("unauthorized")) {
        clearAdminToken();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // no auto search to avoid empty->all
  }, []);

async function openUser(u) {
  setOpen(true);
  setUser(null);
  setLogs([]);
  setOrders([]);

  try {
    // 1) 先用清單資料當 base（避免後端 /admin/users/:id 404 時炸掉）
    const base = u || {};
    let full = base;

    // 2) 嘗試打 /admin/users/:id（如果後端沒做會 404）
    const data = await api.adminGetUser(base.id);

    // ✅ 成功才用 data.user，失敗就維持 base
    if (data && data.success !== false && data.user) {
      full = data.user;
    } else {
      // ✅ 可選：用 query 再補一次（用 account/username 當關鍵字）
      const q2 = String(base.account || base.username || base.id || "").trim();
      if (q2) {
        const d2 = await api.adminSearchUsers(q2);
        const arr2 = d2?.users || d2?.items || [];
        const hit = Array.isArray(arr2)
          ? arr2.find((x) => x && String(x.id) === String(base.id))
          : null;
        if (hit) full = hit;
      }
    }

    setUser(full);

    // ✅ 全部改成「安全讀取」
    setAccount(full?.account || full?.username || "");
    setName(full?.name || full?.display_name || "");
    setLineId(full?.line_id || "");
    setLineVerified(Number(full?.line_verified || 0));
    setBirthday(full?.birthday || "");

setBankHolder(full?.bank_holder || full?.bank?.bank_holder || "");
setBankName(full?.bank_name || full?.bank?.bank_name || "");
setBankBranch(full?.bank_branch || full?.bank?.bank_branch || "");
setBankAccount(full?.bank_account || full?.bank?.bank_account || "");
setBankLocked(Number(full?.bank_locked ?? full?.bank?.bank_locked ?? 0));

    // 3) logs/orders（這兩條通常你後端有）
const [l1, o1] = await Promise.allSettled([
  api.adminUserWalletLogs(base.id, { days: 90 }),
  api.adminUserOrders(base.id, { days: 90 }),
]);

setLogs(l1.status === "fulfilled" ? (l1.value?.logs || []) : []);
setOrders(o1.status === "fulfilled" ? (o1.value?.orders || []) : []);

    setLogs(l1?.logs || []);
    setOrders(o1?.orders || []);
  } catch (e) {
    alert(e?.message || "讀取使用者失敗");
    setOpen(false);
  }
}

async function saveUser() {
  if (!user) return;
  setSaving(true);
  try {
    const patch = {
      username: account.trim(),
      name: name.trim(),
      birthday: String(birthday || "").trim(),
      line_id: String(lineId || "").trim(),
      line_verified: Number(lineVerified || 0),

      bank_name: bankName.trim(),
      bank_branch: bankBranch.trim(),
      bank_account: bankAccount.trim(),
    };

    if (pw.trim()) patch.password = pw.trim();

    const res = await api.adminUpdateUser(user.id, patch);
    if (!res?.success) throw new Error(res?.error || "更新失敗");

    setUser((prev) =>
      prev
        ? {
            ...prev,
            account: account.trim(),
            username: account.trim(),
            name: name.trim(),
            display_name: name.trim(),
            birthday: String(birthday || "").trim(),
            line_id: String(lineId || "").trim(),
            line_verified: Number(lineVerified || 0),
            bank_name: bankName.trim(),
            bank_branch: bankBranch.trim(),
            bank_account: bankAccount.trim(),
          }
        : prev
    );

    await search();
    setPw("");
    alert("已更新");
  } catch (e) {
    alert(e.message || "更新失敗");
  } finally {
    setSaving(false);
  }
}

  async function adjustWallet() {
    if (!user) return;
    if (!deltaS && !deltaW && !deltaD) {
      alert("請輸入至少一個異動金額");
      return;
    }
    setSaving(true);
    try {
      const res = await api.adminAdjustWallet(user.id, {
        delta_s: Number(deltaS||0),
        delta_welfare: Number(deltaW||0),
        delta_discount: Number(deltaD||0),
        action: adjAction,
        note: adjNote,
      });
      setUser(res.user);
      // reload logs
      const l1 = await api.adminUserWalletLogs(user.id, { days: 90 });
      setLogs(l1.logs || []);
      setDeltaS(0); setDeltaW(0); setDeltaD(0); setAdjNote("");
      alert("已異動");
    } catch (e) {
      alert(e.message || "異動失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auZ">
      <div className="auHead">
        <div className="auTitle">後台｜使用者控制面板</div>
        <div className="auSearchRow">
          <input
            className="auSearch"
            value={q}
            onChange={(e)=>setQ(e.target.value)}
            placeholder="至少輸入 2 個字元（例：8989）"
          />
          <button className="auBtn" onClick={search} disabled={loading || q.trim().length < 2}>
            {loading ? "搜尋中..." : "搜尋"}
          </button>
        </div>
      </div>

      {err ? <div className="auErr">{err}</div> : null}

      <div className="auList">
  {list.filter(Boolean).map((u) => (
          <button key={u.id} className="auItem" onClick={() => openUser(u)}>
            <div className="auItemTop">
              <span className="mono">#{u.id}</span>
              <span className="mono">{u.account || u.username}</span>
              <span>{u.name || u.display_name || ""}</span>
              {Number(u.line_verified||0)===1 ? <span className="tick">✓ LINE</span> : null}
            </div>
            <div className="auItemBot">
              <span>S:{Number(u.s_balance||0)}</span>
              <span>W:{Number(u.welfare_balance||0)}</span>
              <span>D:{Number(u.discount_balance||0)}</span>
            </div>
          </button>
        ))}
        {!list.length ? <div className="auEmpty">請輸入關鍵字搜尋（不會顯示全部）</div> : null}
      </div>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="auModalHead">
          <div className="auModalTitle">使用者設定</div>
          <button className="auX" onClick={() => setOpen(false)}>✕</button>
        </div>

        {!user ? (
          <div className="auModalBody">載入中...</div>
        ) : (
          <>
            <div className="auModalBody">
              <div className="sec">
                <div className="secTitle">基本資料</div>
                <div className="grid">
                  <label className="field">
                    <div className="lab">ID</div>
                    <div className="static mono">{user.id}</div>
                  </label>
                  <label className="field">
                    <div className="lab">帳號</div>
                    <input className="inp" value={account} onChange={(e)=>setAccount(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">姓名</div>
                    <input className="inp" value={name} onChange={(e)=>setName(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">LINE ID</div>
                    <div className="row">
                      <input className="inp" value={lineId} onChange={(e)=>setLineId(e.target.value)} />
                      <button className={"mini "+(lineVerified? "on":"")} onClick={()=>setLineVerified(lineVerified?0:1)} title="點擊切換驗證">
                        {lineVerified ? "✓ 已驗證" : "未驗證"}
                      </button>
                    </div>
                  </label>
<label className="field">
  <div className="lab">生日</div>
  <input
    className="inp"
    type="date"
    value={birthday || ""}
    onChange={(e) => setBirthday(e.target.value)}
  />
</label>
                  <label className="field">
                    <div className="lab">修改密碼</div>
                    <input className="inp" value={pw} onChange={(e)=>setPw(e.target.value)} placeholder="留空不修改" />
                  </label>
                </div>
              </div>

              <div className="sec">
                <div className="secTitle">錢包餘額</div>
                <div className="balRow">
                  <span>S幣：<b className="green">{Number(user.s_balance||0)}</b></span>
                  <span>福利金：<b>{Number(user.welfare_balance||0)}</b></span>
                  <span>折抵金：<b>{Number(user.discount_balance||0)}</b></span>
                </div>

                <div className="grid">
                  <label className="field">
                    <div className="lab">S幣異動</div>
                    <input className="inp mono" type="number" value={deltaS} onChange={(e)=>setDeltaS(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <div className="lab">福利金異動</div>
                    <input className="inp mono" type="number" value={deltaW} onChange={(e)=>setDeltaW(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <div className="lab">折抵金異動</div>
                    <input className="inp mono" type="number" value={deltaD} onChange={(e)=>setDeltaD(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <div className="lab">動作</div>
                    <select className="inp" value={adjAction} onChange={(e)=>setAdjAction(e.target.value)}>
                      <option value="新增">新增</option>
                      <option value="扣除">扣除</option>
                    </select>
                  </label>
                  <label className="field wide">
                    <div className="lab">備註</div>
                    <input className="inp" value={adjNote} onChange={(e)=>setAdjNote(e.target.value)} placeholder="例如：管理員新增 / 管理員扣除 / 補償" />
                  </label>
                </div>

                <div className="btnRow">
                  <button className="auBtn ghost" disabled={saving} onClick={adjustWallet}>送出異動</button>
                </div>
              </div>

              <div className="sec">
                <div className="secTitle">銀行資料（後台可修改）</div>
                <div className="grid">
                  <label className="field">
                    <div className="lab">戶名</div>
                    <input className="inp" value={bankHolder} onChange={(e)=>setBankHolder(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">銀行</div>
                    <input className="inp" value={bankName} onChange={(e)=>setBankName(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">分行</div>
                    <input className="inp" value={bankBranch} onChange={(e)=>setBankBranch(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">帳號</div>
                    <input className="inp" value={bankAccount} onChange={(e)=>setBankAccount(e.target.value)} />
                  </label>
                  <label className="field">
                    <div className="lab">bank_locked</div>
                    <select className="inp" value={bankLocked} onChange={(e)=>setBankLocked(Number(e.target.value))}>
                      <option value={0}>0 (可改)</option>
                      <option value={1}>1 (鎖定)</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="sec">
                <div className="secTitle">抽獎紀錄/異動紀錄（近90天）</div>
                <div className="logWrap">
                  <table className="logTable">
                    <thead>
                      <tr>
                        <th>時間</th><th>帳號</th><th>類型</th><th>狀態</th><th>結果</th><th>備註</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((x)=>(
                        <tr key={x.id}>
                          <td className="mono">{fmtDT(x.created_at)}</td>
                          <td className="mono">{x.account}</td>
                          <td>{x.category}</td>
                          <td className={String(x.status)==="success"?"ok":"fail"}>{x.status}</td>
                          <td>{x.result}</td>
                          <td className="note">{x.note}{x.admin_account ? `（${x.admin_account}）` : ""}</td>
                        </tr>
                      ))}
                      {!logs.length ? <tr><td colSpan={6} className="empty">無紀錄</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="sec">
                <div className="secTitle">兌換紀錄（近90天）</div>
                <div className="logWrap">
                  <table className="logTable">
                    <thead>
                      <tr>
                        <th>時間</th><th>帳號</th><th>狀態</th><th>扣除</th><th>商品</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((x)=>(
                        <tr key={x.id}>
                          <td className="mono">{fmtDT(x.created_at)}</td>
                          <td className="mono">{x.account}</td>
                          <td className={String(x.status)==="success"?"ok":"fail"}>{x.status}</td>
                          <td>扣除 S幣{Number(x.price_s||0)}</td>
                          <td className="note">{x.product_title}</td>
                        </tr>
                      ))}
                      {!orders.length ? <tr><td colSpan={5} className="empty">無紀錄</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="auModalFoot">
              <button className="auBtn" onClick={saveUser} disabled={saving}>{saving ? "儲存中..." : "儲存使用者資料"}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

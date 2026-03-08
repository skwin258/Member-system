// raffle-web/src/pages/admin/AdminCreateUser.jsx
import React, { useState } from "react";
import { api } from "../../api"; // ✅ 你 api.js export const api = {...}

export default function AdminCreateUser() {
  const [form, setForm] = useState({
    account: "",
    password: "",
    name: "",
  });
  const [loading, setLoading] = useState(false);

  const onCreate = async () => {
    try {
      setLoading(true);

      const username = String(form.account || "").trim();
      const password = String(form.password || "").trim();
      const display_name = String(form.name || username || "").trim();

      if (!username || !password) {
        alert("請輸入：帳號、密碼");
        return;
      }

      // ✅ 依照你 api.js 的定義：adminCreateUser({ username, password, display_name })
      const res = await api.adminCreateUser({ username, password, display_name });

      if (!res?.success) throw new Error(res?.error || "建立失敗");

      alert("建立成功 ✅");
      setForm({ account: "", password: "", name: "" });
    } catch (e) {
      alert("建立失敗：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adminCard">
      <div className="adminSectionTitle">新增使用者</div>
      <div className="adminHint">建立：帳號 / 密碼 / 使用者名稱（建立後可用於前台登入）</div>

      <div className="adminBlock">
        <div className="adminGrid2">
          <div>
            <div className="adminLabel">帳號</div>
            <input
              className="adminInput"
              value={form.account}
              onChange={(e) => setForm({ ...form, account: e.target.value })}
              autoComplete="off"
              placeholder="例如：user001"
            />
          </div>

          <div>
            <div className="adminLabel">密碼</div>
            <input
              className="adminInput"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              placeholder="設定密碼"
            />
          </div>

          <div>
            <div className="adminLabel">使用者名稱</div>
            <input
              className="adminInput"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="off"
              placeholder="顯示名稱（可不填）"
            />
          </div>
        </div>

        <div className="adminRowEnd">
          <button className="btn-main" onClick={onCreate} disabled={loading}>
            {loading ? "建立中..." : "建立使用者"}
          </button>
        </div>
      </div>
    </div>
  );
}
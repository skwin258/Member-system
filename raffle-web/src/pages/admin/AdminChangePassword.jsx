import React, { useState } from "react";
import { api, clearAdminToken } from "../../api";

export default function AdminChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async () => {
    setMsg("");
    if (!oldPassword || !newPassword) {
      setMsg("請填寫舊密碼與新密碼");
      return;
    }
    if (newPassword.length < 4) {
      setMsg("新密碼至少 4 碼");
      return;
    }

    setLoading(true);
    const r = await api.adminChangePassword(oldPassword, newPassword);
    setLoading(false);

    if (!r.success) {
      setMsg(r.error || "修改失敗");
      return;
    }

    // 安全起見：修改密碼後登出
    clearAdminToken();
    setOldPassword("");
    setNewPassword("");
    setMsg("修改成功，已登出，請重新登入。");
  };

  return (
    <div style={{ textAlign: "left" }}>
      <h2 style={{ marginTop: 0 }}>修改密碼</h2>

      <div style={{ opacity: 0.85, marginBottom: 12, lineHeight: 1.6 }}>
        修改目前登入的管理員密碼。修改成功後系統會清除登入狀態，需要重新登入。
      </div>

      {msg ? <div style={{ marginBottom: 12, color: msg.includes("成功") ? "#b6ffb6" : "#ffb3b3" }}>{msg}</div> : null}

      <div className="cardBox" style={{ maxWidth: 520 }}>
        <div className="formRow">
          <label>舊密碼</label>
          <input
            className="input"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="輸入舊密碼"
          />
        </div>

        <div className="formRow">
          <label>新密碼</label>
          <input
            className="input"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 4 碼"
          />
        </div>

        <button className="btn btnPrimary" onClick={handleSubmit} disabled={loading}>
          {loading ? "修改中..." : "確認修改"}
        </button>
      </div>
    </div>
  );
}

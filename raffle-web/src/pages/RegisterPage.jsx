// raffle-web/src/pages/RegisterPage.jsx
import React, { useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

function isLikelyRefCode(s) {
  return /^[a-f0-9]{8,16}$/i.test(String(s || ""));
}

export default function RegisterPage({ refCode }) {
  const code = useMemo(() => String(refCode || "").trim(), [refCode]);

  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  if (!code || !isLikelyRefCode(code)) {
    window.location.href = "/";
    return null;
  }

  const normalizePhone = (p) =>
    String(p || "").replace(/[^\d+]/g, "").trim();

  const submit = async () => {
    setErr("");
    setOk("");

    if (!realName.trim()) return setErr("請填寫本名");
    if (!username.trim()) return setErr("請填寫帳號");
    if (!password.trim()) return setErr("請填寫密碼");

    setLoading(true);

    try {
      const body = {
        real_name: realName.trim(),
        phone: normalizePhone(phone),
        username: username.trim(),
        password: password,
        referral_code: code,
      };

      const res = await fetch(`${API_BASE}/auth/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `註冊失敗 (HTTP ${res.status})`);
      }

      setOk("註冊成功，請登入");
      setTimeout(() => {
        window.location.href = "/";
      }, 800);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app loginOnly">
      <div className="loginWrap">
        {/* ⚠️ 這裡改成 loginCard，跟登入頁一致 */}
        <div className="loginCard">

          <div className="loginTitle">註冊帳號</div>

          <div className="muted" style={{ marginBottom: 12 }}>
            你正在使用推廣碼註冊：
            <b style={{ marginLeft: 6 }}>{code}</b>
          </div>

          <input
            className="loginInput"
            placeholder="本名（務必填寫本名）"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
          />

          <input
            className="loginInput"
            placeholder="電話（可空）"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <input
            className="loginInput"
            placeholder="帳號"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <input
            className="loginInput"
            type="password"
            placeholder="密碼（至少 6 碼）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            className="loginBtn"
            onClick={submit}
            disabled={loading}
          >
            {loading ? "註冊中..." : "註冊"}
          </button>

          {err && <div className="errText">{err}</div>}
          {ok && <div className="okText">{ok}</div>}

          <button
            className="linkBtn"
            style={{ marginTop: 10 }}
            onClick={() => (window.location.href = "/")}
          >
            回登入
          </button>

        </div>
      </div>
    </div>
  );
}
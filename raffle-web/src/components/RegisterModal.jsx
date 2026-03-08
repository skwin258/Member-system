import React, { useEffect, useMemo, useState } from "react";

export default function RegisterModal({ open, onClose, onSuccess, apiBase }) {
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ✅ 從網址自動抓推薦碼：/register/:code
  useEffect(() => {
    if (!open) return;

    // 例：/register/43dbdebf90
    const path = window.location.pathname || "";
    const m = path.match(/^\/register\/([^\/?#]+)/i);
    const codeFromUrl = m?.[1] ? decodeURIComponent(m[1]) : "";

    // ✅ 只在 refCode 目前是空的時候才自動帶入，避免覆蓋使用者手動輸入
    if (codeFromUrl && !refCode) {
      setRefCode(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!realName.trim()) return false;
    if (!username.trim()) return false;
    if (!password.trim()) return false;
    return true;
  }, [realName, username, password]);

  if (!open) return null;

  const normalizePhone = (p) => String(p || "").replace(/[^\d+]/g, "").trim();

  const submit = async () => {
    setErr("");
    if (!canSubmit) {
      setErr("請填寫：本名、帳號、密碼");
      return;
    }

    const body = {
      real_name: realName.trim(),
      phone: normalizePhone(phone),
      username: username.trim(),
      password: password,
      // ✅ 推薦碼：優先用 refCode（可能來自網址），空則 null
      referral_code: (refCode || "").trim() || null,
    };

    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/auth/user/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `register failed (${res.status})`);
      }

      onSuccess?.(data);
      onClose?.();

      // 清空（但保留：如果目前就在 /register/:code，下一次打開還是會自動帶入）
      setRealName("");
      setPhone("");
      setUsername("");
      setPassword("");
      setRefCode("");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.titleRow}>
          <div style={styles.title}>註冊帳號</div>
          <button style={styles.xBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.hint}>本名務必填入本名，避免後續核對問題</div>

        <label style={styles.label}>本名（務必填入本名）</label>
        <input style={styles.input} value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="例：王小明" />

        <label style={styles.label}>電話</label>
        <input style={styles.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例：0912345678" />

        <label style={styles.label}>帳號</label>
        <input style={styles.input} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例：user123" />

        <label style={styles.label}>密碼</label>
        <input style={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 碼" />

        <label style={styles.label}>推薦碼（可不填）</label>
        <input style={styles.input} value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="例：ABCD1234" />

        {err ? <div style={styles.err}>{err}</div> : null}

        <button
          style={{ ...styles.submitBtn, opacity: loading ? 0.7 : 1 }}
          onClick={submit}
          disabled={loading}
        >
          {loading ? "送出中..." : "完成註冊"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },
  modal: {
    width: "min(520px, 100%)",
    background: "rgba(10, 14, 18, 0.92)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 14,
    boxShadow: "0 18px 60px rgba(0,0,0,0.55)",
    padding: 18,
    color: "#fff",
  },
  titleRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: 800, letterSpacing: 1 },
  xBtn: {
    border: "none",
    background: "transparent",
    color: "#fff",
    fontSize: 24,
    cursor: "pointer",
    lineHeight: 1,
  },
  hint: { fontSize: 12, opacity: 0.75, marginTop: 6, marginBottom: 10 },
  label: { display: "block", fontSize: 12, opacity: 0.85, marginTop: 10, marginBottom: 6 },
  input: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "#fff",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
  },
  err: { marginTop: 10, fontSize: 12, color: "#ff6b6b" },
  submitBtn: {
    marginTop: 14,
    width: "100%",
    height: 44,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
};
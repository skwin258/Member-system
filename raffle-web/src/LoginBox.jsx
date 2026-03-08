// raffle-web/src/LoginBox.jsx
import { useMemo, useState } from "react";
import { api, setToken, setAdminToken } from "./api";

/**
 * mode:
 * - "user"  => 前台使用者登入（寫入 setToken）
 * - "admin" => 後台管理端登入（寫入 setAdminToken）
 */
export default function LoginBox({ onLoggedIn, mode = "user" }) {
  const isAdmin = String(mode).toLowerCase() === "admin";

  const [username, setUsername] = useState(isAdmin ? "" : "user1");
  const [password, setPassword] = useState(isAdmin ? "" : "1111");
  const [loading, setLoading] = useState(false);

  // 註冊 modal
  const [openRegister, setOpenRegister] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerErr, setRegisterErr] = useState("");

  const [rRealName, setRRealName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rUsername, setRUsername] = useState("");
  const [rPassword, setRPassword] = useState("");
  const [rReferral, setRReferral] = useState("");

  const title = useMemo(() => (isAdmin ? "管理端登入" : "使用者登入"), [isAdmin]);
  const hint = useMemo(() => {
    if (isAdmin) return "請輸入管理員帳號密碼";
    return "先用測試帳號：user1 / 1111";
  }, [isAdmin]);

  const resetRegisterForm = () => {
    setRegisterErr("");
    setRRealName("");
    setRPhone("");
    setRUsername("");
    setRPassword("");
    setRReferral("");
  };

  const handleLogin = async () => {
    try {
      setLoading(true);

      if (!username || !password) {
        alert("請輸入帳號與密碼");
        return;
      }

      const data = isAdmin
        ? await api.adminLogin(username, password)
        : await api.userLogin(username, password);

      if (!data?.success) throw new Error(data?.error || "登入失敗");
      if (!data?.token) throw new Error("登入成功但沒有 token");

      if (isAdmin) {
        setAdminToken(data.token);
      } else {
        setToken(data.token);
      }

      onLoggedIn?.(data);
    } catch (e) {
      alert("登入失敗：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (p) => String(p || "").replace(/[^\d+]/g, "").trim();

  const handleRegister = async () => {
    setRegisterErr("");

    const real_name = String(rRealName || "").trim();
    const phone = normalizePhone(rPhone);
    const username = String(rUsername || "").trim();
    const password = String(rPassword || "");
    const referral_code = String(rReferral || "").trim();

    if (!real_name) return setRegisterErr("本名必填（務必填入本名）");
    if (!username) return setRegisterErr("帳號必填");
    if (!password || password.length < 6) return setRegisterErr("密碼至少 6 碼");

    try {
      setRegisterLoading(true);

      const data = await api.userRegister({
        real_name,
        phone: phone || "",
        username,
        password,
        referral_code: referral_code || "",
      });

      if (!data?.success) throw new Error(data?.error || "註冊失敗");

      setOpenRegister(false);
      setUsername(username);
      setPassword("");
      resetRegisterForm();
      alert("註冊成功，請登入");
    } catch (e) {
      setRegisterErr(e?.message || String(e));
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <>
      <div style={styles.box}>
        <div style={styles.title}>{title}</div>

        <div style={styles.grid}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="帳號"
            style={styles.input}
            autoComplete="username"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密碼"
            type="password"
            style={styles.input}
            autoComplete="current-password"
          />

          <button onClick={handleLogin} disabled={loading} style={styles.loginBtn(loading)}>
            {loading ? "登入中..." : "登入"}
          </button>

          {!isAdmin ? (
            <button
              onClick={() => {
                setOpenRegister(true);
                setRegisterErr("");
              }}
              style={styles.registerBtn}
              disabled={loading}
            >
              註冊
            </button>
          ) : null}
        </div>

        <div style={styles.hint}>{hint}</div>
      </div>

      {openRegister && !isAdmin ? (
        <div
          style={styles.backdrop}
          onMouseDown={() => {
            setOpenRegister(false);
            setRegisterErr("");
          }}
        >
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div style={styles.modalTitle}>註冊</div>
              <button
                style={styles.closeBtn}
                onClick={() => {
                  setOpenRegister(false);
                  setRegisterErr("");
                }}
              >
                ×
              </button>
            </div>

            <div style={styles.modalHint}>本名務必填入本名，避免後續核對問題</div>

            <div style={styles.modalGrid}>
              <label style={styles.label}>本名（務必填入本名）</label>
              <input
                value={rRealName}
                onChange={(e) => setRRealName(e.target.value)}
                placeholder="例：王小明"
                style={styles.modalInput}
              />

              <label style={styles.label}>電話</label>
              <input
                value={rPhone}
                onChange={(e) => setRPhone(e.target.value)}
                placeholder="例：0912345678"
                style={styles.modalInput}
              />

              <label style={styles.label}>帳號</label>
              <input
                value={rUsername}
                onChange={(e) => setRUsername(e.target.value)}
                placeholder="例：user123"
                style={styles.modalInput}
                autoComplete="username"
              />

              <label style={styles.label}>密碼</label>
              <input
                value={rPassword}
                onChange={(e) => setRPassword(e.target.value)}
                placeholder="至少 6 碼"
                style={styles.modalInput}
                type="password"
                autoComplete="new-password"
              />

              <label style={styles.label}>推薦碼（可不填）</label>
              <input
                value={rReferral}
                onChange={(e) => setRReferral(e.target.value)}
                placeholder="例：ABCD1234"
                style={styles.modalInput}
              />

              {registerErr ? <div style={styles.err}>{registerErr}</div> : null}

              <button
                onClick={handleRegister}
                disabled={registerLoading}
                style={styles.submitBtn(registerLoading)}
              >
                {registerLoading ? "送出中..." : "完成註冊"}
              </button>

              <button
                onClick={() => {
                  resetRegisterForm();
                }}
                disabled={registerLoading}
                style={styles.clearBtn}
              >
                清空
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const styles = {
  box: {
    padding: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    width: "100%",
    maxWidth: 360,
    background: "linear-gradient(180deg, rgba(18,18,18,0.68), rgba(6,6,6,0.78))",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow:
      "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
    color: "#fff",
  },

  title: {
    fontSize: 18,
    fontWeight: 900,
    marginBottom: 14,
    letterSpacing: "0.5px",
  },

  grid: {
    display: "grid",
    gap: 10,
  },

  input: {
    width: "100%",
    height: 42,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },

  loginBtn: (loading) => ({
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: loading
      ? "rgba(255,255,255,0.08)"
      : "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: loading ? "none" : "0 8px 18px rgba(0,0,0,0.28)",
  }),

  registerBtn: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.18)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 15,
  },

  hint: {
    marginTop: 10,
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
  },

  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.68)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    padding: 16,
  },

  modal: {
    width: "min(520px, 100%)",
    background: "linear-gradient(180deg, rgba(15,15,15,0.82), rgba(5,5,5,0.9))",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    boxShadow:
      "0 22px 70px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04)",
    padding: 18,
    color: "#fff",
  },

  modalHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 900,
  },

  closeBtn: {
    border: "none",
    background: "transparent",
    color: "#fff",
    fontSize: 24,
    cursor: "pointer",
    lineHeight: 1,
    opacity: 0.9,
  },

  modalHint: {
    fontSize: 12,
    color: "rgba(255,255,255,0.72)",
    marginTop: 6,
    marginBottom: 12,
  },

  modalGrid: {
    display: "grid",
    gap: 8,
  },

  label: {
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    marginTop: 6,
  },

  modalInput: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    padding: "0 12px",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
  },

  err: {
    marginTop: 4,
    fontSize: 12,
    color: "#ff7b7b",
  },

  submitBtn: (loading) => ({
    marginTop: 10,
    width: "100%",
    height: 44,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: loading
      ? "rgba(255,255,255,0.08)"
      : "linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0.07))",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: loading ? "none" : "0 10px 22px rgba(0,0,0,0.26)",
  }),

  clearBtn: {
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.18)",
    color: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  },
};
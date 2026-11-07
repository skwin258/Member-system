// raffle-web/src/LoginBox.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { api, setToken, setAdminToken } from "./api";
import { startLineAuth } from "./lib/lineAuth";
import { MEMBER_LOGIN_EVENT } from "./lib/loginPromotions";

/**
 * mode:
 * - "user"  => 前台使用者登入（寫入 setToken）
 * - "admin" => 後台管理端登入（寫入 setAdminToken）
 *
 * 目前版本：
 * 1. 舊會員 / 後台建立會員：保留帳號密碼登入
 * 2. 前台登入畫面新增「LINE登入」
 * 3. 前台「註冊」不再開放帳號密碼註冊，只顯示「使用 LINE 註冊」
 * 4. 後台管理員登入不顯示 LINE登入 / 註冊
 */
export default function LoginBox({
  onLoggedIn,
  mode = "user",
  referralCode = "",
  defaultView = "login",
}) {
  const isAdmin = String(mode).toLowerCase() === "admin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [openRegister, setOpenRegister] = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const lineBusy = useRef(false);
  const [registerErr, setRegisterErr] = useState("");

useEffect(() => {
  if (isAdmin) return;

  if (defaultView === "register") {
    setOpenRegister(true);
    setRegisterErr("");
    return;
  }

  setOpenRegister(false);
  setRegisterErr("");
}, [defaultView, isAdmin]);

  const title = useMemo(() => (isAdmin ? "管理端登入" : "會員登入"), [isAdmin]);
  const hint = useMemo(() => {
    if (isAdmin) return "請輸入管理員帳號密碼";
    return "已註冊會員可使用帳號密碼登入，新會員請使用 LINE 註冊";
  }, [isAdmin]);

  const saveLoginToken = (data) => {
    if (!data?.success) throw new Error(data?.error || "登入失敗");
    if (!data?.token) throw new Error("登入成功但沒有 token");

    if (isAdmin) setAdminToken(data.token);
    else setToken(data.token);

    onLoggedIn?.(data);
    if (!isAdmin) window.dispatchEvent(new Event(MEMBER_LOGIN_EVENT));
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

      saveLoginToken(data);
    } catch (e) {
      alert("登入失敗：" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const handleLineAuth = async (authMode) => {
    if (isAdmin || lineBusy.current) return;
    lineBusy.current = true;
    setLineLoading(true);
    setRegisterErr("");
    try {
      const data = await startLineAuth(authMode, referralCode || getReferralCodeFromUrl());
      if (data) saveLoginToken(data);
    } catch (error) {
      setRegisterErr(error?.message || "LINE 登入失敗，請重試");
    } finally {
      lineBusy.current = false;
      setLineLoading(false);
    }
  };
  const handleLineLogin = () => handleLineAuth('login');
  const handleLineRegister = () => handleLineAuth('register');

  return (
    <>
      <div style={styles.box}>
        <div style={styles.title}>{title}</div>
        {registerErr && !openRegister && <p role="alert" style={{ color: "#ffb4b4" }}>{registerErr}</p>}

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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) handleLogin();
            }}
          />

          <button onClick={handleLogin} disabled={loading || lineLoading} style={styles.loginBtn(loading)}>
            {loading ? "登入中..." : "登入"}
          </button>

          {!isAdmin ? (
            <>
<button
  onClick={handleLineLogin}
  disabled={loading || lineLoading}
  style={styles.lineBtn(lineLoading)}
>
  {lineLoading ? "處理中..." : "LINE登入 / 註冊"}
</button>

              <button
                onClick={() => {
                  setOpenRegister(true);
                  setRegisterErr("");
                }}
                style={styles.registerBtn}
                disabled={loading || lineLoading}
              >
                註冊
              </button>
            </>
          ) : null}
        </div>

        <div style={styles.hint}>{hint}</div>
      </div>

      {openRegister && !isAdmin ? (
        <div
          style={styles.backdrop}
          onMouseDown={() => {
            if (lineLoading) return;
            setOpenRegister(false);
            setRegisterErr("");
          }}
        >
          <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <div>
                <div style={styles.modalTitle}>會員註冊</div>
                <div style={styles.modalSubtitle}>目前自行註冊僅支援 LINE 註冊</div>
              </div>

              <button
                style={styles.closeBtn}
                disabled={lineLoading}
                onClick={() => {
                  setOpenRegister(false);
                  setRegisterErr("");
                }}
              >
                ×
              </button>
            </div>

            <div style={styles.registerCard}>
              <div style={styles.lineIcon}>LINE</div>
              <div style={styles.registerTextBox}>
                <div style={styles.registerTitle}>使用 LINE 註冊</div>
                <div style={styles.registerDesc}>
                  使用 LINE 授權建立會員資料。已註冊會員也可直接使用 LINE 登入。
                </div>
              </div>
            </div>

            {registerErr ? <div style={styles.err}>{registerErr}</div> : null}

            <button
              onClick={handleLineRegister}
              disabled={lineLoading}
              style={styles.lineRegisterBtn(lineLoading)}
            >
              {lineLoading ? "LINE 註冊中..." : "使用 LINE 註冊"}
            </button>

            <button
              onClick={() => {
                setOpenRegister(false);
                setRegisterErr("");
              }}
              disabled={lineLoading}
              style={styles.cancelBtn}
            >
              返回登入
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function getReferralCodeFromUrl() {
  try {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const registerIndex = parts.indexOf("register");
    if (registerIndex >= 0 && parts[registerIndex + 1]) return parts[registerIndex + 1];

    const first = parts[0] || "";
    const reserved = new Set(["admin", "login", "logout", "register", "api"]);
    if (first && !reserved.has(first) && /^[a-zA-Z0-9_-]{4,32}$/.test(first)) return first;
  } catch (_) {}

  return "";
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
    boxShadow: "0 18px 50px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
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
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: loading ? "none" : "0 8px 18px rgba(0,0,0,0.28)",
  }),

  lineBtn: (loading) => ({
    width: "100%",
    height: 42,
    borderRadius: 10,
    border: "1px solid rgba(50, 255, 120, 0.35)",
    background: loading
      ? "rgba(6, 168, 82, 0.35)"
      : "linear-gradient(180deg, rgba(22, 199, 91, 0.98), rgba(4, 148, 67, 0.98))",
    color: "#fff",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: loading ? "none" : "0 10px 24px rgba(0, 185, 90, 0.20)",
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
    lineHeight: 1.55,
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
    width: "min(420px, 100%)",
    background: "linear-gradient(180deg, rgba(15,15,15,0.88), rgba(5,5,5,0.94))",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16,
    boxShadow: "0 22px 70px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.04)",
    padding: 18,
    color: "#fff",
  },

  modalHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },

  modalTitle: {
    fontSize: 20,
    fontWeight: 900,
  },

  modalSubtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.62)",
    lineHeight: 1.5,
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

  registerCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    display: "grid",
    gridTemplateColumns: "54px 1fr",
    alignItems: "center",
    gap: 12,
    border: "1px solid rgba(50, 255, 120, 0.20)",
    background: "linear-gradient(180deg, rgba(0, 185, 90, 0.12), rgba(255,255,255,0.04))",
  },

  lineIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(180deg, #20d466, #04a64c)",
    color: "#fff",
    fontWeight: 1000,
    fontSize: 13,
    letterSpacing: 0.2,
    boxShadow: "0 10px 24px rgba(0, 185, 90, 0.20)",
  },

  registerTextBox: {
    minWidth: 0,
  },

  registerTitle: {
    fontSize: 15,
    fontWeight: 900,
  },

  registerDesc: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 1.55,
    color: "rgba(255,255,255,0.66)",
  },

  err: {
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(255, 70, 70, 0.12)",
    color: "#ffb6b6",
    border: "1px solid rgba(255, 70, 70, 0.22)",
    fontSize: 12,
    lineHeight: 1.5,
  },

  lineRegisterBtn: (loading) => ({
    marginTop: 14,
    width: "100%",
    height: 44,
    borderRadius: 12,
    border: "1px solid rgba(50, 255, 120, 0.32)",
    background: loading
      ? "rgba(6, 168, 82, 0.35)"
      : "linear-gradient(180deg, rgba(22, 199, 91, 0.98), rgba(4, 148, 67, 0.98))",
    color: "#fff",
    cursor: loading ? "not-allowed" : "pointer",
    fontWeight: 900,
    fontSize: 15,
    boxShadow: loading ? "none" : "0 12px 26px rgba(0, 185, 90, 0.22)",
  }),

  cancelBtn: {
    marginTop: 10,
    width: "100%",
    height: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.86)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  },
};

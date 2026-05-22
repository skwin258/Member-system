import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

export default function AdminAiControl({ adminMe }) {
  const [activeType, setActiveType] = useState("electronic");

  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingModule, setLoadingModule] = useState(false);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState("");

  const [electronicForm, setElectronicForm] = useState({
    enabled: 0,
    uses_left: 0,
    unlimited: 0,
    expire_at: "",
    note: "",
  });

  const controlTypes = useMemo(
    () => [
      {
        key: "baccarat",
        title: "百家樂",
        desc: "百家樂 AI 控制",
      },
      {
        key: "sports",
        title: "運彩",
        desc: "運彩 AI 控制",
      },
      {
        key: "electronic",
        title: "電子",
        desc: "電子外掛選房控制",
      },
    ],
    []
  );

  const searchUsers = async () => {
    const keyword = q.trim();

    if (keyword.length < 1) {
      setUsers([]);
      setMsg("請輸入會員帳號、名稱、ID 或 LINE ID");
      return;
    }

    setSearching(true);
    setMsg("");

    try {
      const res = await api.adminSearchUsers(keyword);

      if (!res?.success) {
        setUsers([]);
        setMsg(res?.error || "搜尋使用者失敗");
        return;
      }

      const list = res.users || res.items || res.data || [];
      setUsers(Array.isArray(list) ? list : []);

      if (!Array.isArray(list) || list.length === 0) {
        setMsg("查無使用者");
      }
    } catch (err) {
      setUsers([]);
      setMsg(err?.message || "搜尋發生錯誤");
    } finally {
      setSearching(false);
    }
  };

  const loadElectronicStatus = async (user) => {
    if (!user?.id) return;

    setSelectedUser(user);
    setLoadingModule(true);
    setMsg("");

    try {
      const res = await api.adminGetElectronicRoomStatus(user.id);

      if (!res?.success) {
        setMsg(res?.error || "讀取電子外掛權限失敗");
        return;
      }

      const m = res.module || {};

      setElectronicForm({
        enabled: Number(m.enabled || 0),
        uses_left: Number(m.uses_left || 0),
        unlimited: Number(m.unlimited || 0),
        expire_at: String(m.expire_at || ""),
        note: String(m.note || ""),
      });
    } catch (err) {
      setMsg(err?.message || "讀取電子外掛權限發生錯誤");
    } finally {
      setLoadingModule(false);
    }
  };

  const saveElectronicStatus = async () => {
    if (!selectedUser?.id) {
      setMsg("請先選擇使用者");
      return;
    }

    setSaving(true);
    setMsg("");

    try {
      const payload = {
        user_id: Number(selectedUser.id),
        enabled: Number(electronicForm.enabled || 0),
        uses_left: Math.max(0, Number(electronicForm.uses_left || 0)),
        unlimited: Number(electronicForm.unlimited || 0),
        expire_at: String(electronicForm.expire_at || "").trim(),
        note: String(electronicForm.note || "").trim(),
      };

      const res = await api.adminUpdateElectronicRoom(payload);

      if (!res?.success) {
        setMsg(res?.error || "儲存失敗");
        return;
      }

      setMsg("電子外掛權限已儲存成功");

      await loadElectronicStatus(selectedUser);
    } catch (err) {
      setMsg(err?.message || "儲存發生錯誤");
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (key, value) => {
    setElectronicForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  useEffect(() => {
    if (activeType !== "electronic") {
      setMsg("");
    }
  }, [activeType]);

  return (
    <div className="ra-panel">
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 1000 }}>AI 控制</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
          管理百家樂、運彩、電子外掛相關 AI 權限與使用設定
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {controlTypes.map((item) => {
          const active = activeType === item.key;

          return (
            <button
              key={item.key}
              onClick={() => setActiveType(item.key)}
              style={{
                border: active
                  ? "1px solid rgba(0, 254, 239, 0.75)"
                  : "1px solid rgba(255,255,255,0.12)",
                borderRadius: 18,
                padding: "16px 14px",
                color: "#fff",
                textAlign: "left",
                cursor: "pointer",
                background: active
                  ? "linear-gradient(135deg, rgba(0,254,239,0.22), rgba(34,94,255,0.18))"
                  : "linear-gradient(180deg, rgba(18,34,58,0.92), rgba(8,15,30,0.92))",
                boxShadow: active
                  ? "0 0 22px rgba(0,254,239,0.18)"
                  : "none",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 1000 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                {item.desc}
              </div>
            </button>
          );
        })}
      </div>

      {activeType !== "electronic" && (
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            padding: 18,
            background:
              "linear-gradient(180deg, rgba(18,34,58,0.92), rgba(8,15,30,0.92))",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 1000, marginBottom: 8 }}>
            {activeType === "baccarat" ? "百家樂 AI 控制" : "運彩 AI 控制"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.72, lineHeight: 1.8 }}>
            這個區塊先預留，後面可以放 AI 模型開關、提示詞設定、會員權限、分析次數與推播設定。
          </div>
        </div>
      )}

      {activeType === "electronic" && (
<div
  style={{
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 16,
    alignItems: "start",
    minHeight: 0,
  }}
>
<div
  style={{
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 18,
    padding: 18,
    background:
      "linear-gradient(180deg, rgba(18,34,58,0.92), rgba(8,15,30,0.92))",
    maxHeight: "620px",
    overflow: "hidden",
  }}
>
            <div style={{ fontSize: 17, fontWeight: 1000 }}>
              選擇使用者
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
              搜尋會員後，點擊會員即可查看電子外掛權限
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchUsers();
                }}
                placeholder="輸入帳號 / 名稱 / ID / LINE ID"
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "#fff",
                  padding: "0 12px",
                  outline: "none",
                }}
              />

              <button
                onClick={searchUsers}
                disabled={searching}
                className="ra-btn"
                style={{ minWidth: 78 }}
              >
                {searching ? "搜尋中" : "搜尋"}
              </button>
            </div>

<div
  style={{
    marginTop: 14,
    display: "grid",
    gap: 8,
    maxHeight: "420px",
    overflowY: "auto",
    paddingRight: 6,
  }}
>
  {users.map((u) => {
                const active = Number(selectedUser?.id) === Number(u.id);

                return (
                  <button
                    key={u.id}
                    onClick={() => loadElectronicStatus(u)}
                    style={{
                      border: active
                        ? "1px solid rgba(0,254,239,0.75)"
                        : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 14,
                      padding: 12,
                      textAlign: "left",
                      color: "#fff",
                      cursor: "pointer",
                      background: active
                        ? "rgba(0,254,239,0.12)"
                        : "rgba(255,255,255,0.05)",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>
                      #{u.id}　{u.username || "未命名"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                      {u.display_name || "無暱稱"}　
                      {u.line_id ? `LINE：${u.line_id}` : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 18,
              background:
                "linear-gradient(180deg, rgba(18,34,58,0.92), rgba(8,15,30,0.92))",
              minHeight: 320,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 1000 }}>
                  電子外掛選房權限
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  開通、關閉、增加次數、設定無限使用與到期時間
                </div>
              </div>

              {selectedUser && (
                <span className="ra-pill">
                  會員：#{selectedUser.id}　{selectedUser.username}
                </span>
              )}
            </div>

            {!selectedUser && (
              <div
                style={{
                  marginTop: 28,
                  border: "1px dashed rgba(255,255,255,0.18)",
                  borderRadius: 16,
                  padding: 28,
                  textAlign: "center",
                  opacity: 0.75,
                }}
              >
                請先在左側搜尋並選擇一位使用者
              </div>
            )}

            {selectedUser && (
              <>
                {loadingModule ? (
                  <div style={{ marginTop: 24, opacity: 0.75 }}>
                    讀取權限中...
                  </div>
                ) : (
                  <div
                    style={{
                      marginTop: 20,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
<label style={fieldWrapStyle}>
  <span style={labelStyle}>狀態</span>
  <select
    value={String(electronicForm.enabled)}
    onChange={(e) =>
      updateForm("enabled", Number(e.target.value))
    }
    style={inputStyle}
  >
    <option value="1">正常</option>
    <option value="0">停用</option>
  </select>
</label>

                    <label style={fieldWrapStyle}>
                      <span style={labelStyle}>無限使用</span>
                      <select
                        value={String(electronicForm.unlimited)}
                        onChange={(e) =>
                          updateForm("unlimited", Number(e.target.value))
                        }
                        style={inputStyle}
                      >
                        <option value="0">否</option>
                        <option value="1">是</option>
                      </select>
                    </label>

                    <label style={fieldWrapStyle}>
                      <span style={labelStyle}>剩餘次數</span>
                      <input
                        type="number"
                        min="0"
                        value={electronicForm.uses_left}
                        onChange={(e) =>
                          updateForm("uses_left", Number(e.target.value))
                        }
                        style={inputStyle}
                      />
                    </label>

<label style={fieldWrapStyle}>
  <span style={labelStyle}>增加使用次數</span>

  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 8,
    }}
  >
    {[1, 3, 5].map((n) => (
      <button
        key={n}
        type="button"
        className="ra-btn ra-btnGhost"
        onClick={() =>
          updateForm(
            "uses_left",
            Math.max(0, Number(electronicForm.uses_left || 0)) + n
          )
        }
        style={{
          height: 40,
          borderRadius: 12,
          fontWeight: 900,
        }}
      >
        +{n} 次
      </button>
    ))}
  </div>
</label>

                    <label
                      style={{
                        ...fieldWrapStyle,
                        gridColumn: "1 / -1",
                      }}
                    >
                      <span style={labelStyle}>備註</span>
                      <textarea
                        value={electronicForm.note}
                        onChange={(e) => updateForm("note", e.target.value)}
                        placeholder="例如：VIP會員、客服開通、活動贈送"
                        style={{
                          ...inputStyle,
                          height: 90,
                          paddingTop: 10,
                          resize: "vertical",
                        }}
                      />
                    </label>

                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 10,
                        marginTop: 4,
                      }}
                    >
                      <button
                        className="ra-btn ra-btnGhost"
                        onClick={() => loadElectronicStatus(selectedUser)}
                        disabled={loadingModule || saving}
                      >
                        重新讀取
                      </button>

                      <button
                        className="ra-btn"
                        onClick={saveElectronicStatus}
                        disabled={saving}
                      >
                        {saving ? "儲存中..." : "儲存電子權限"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {msg && (
              <div
                style={{
                  marginTop: 16,
                  borderRadius: 12,
                  padding: "10px 12px",
                  background: "rgba(0,254,239,0.1)",
                  border: "1px solid rgba(0,254,239,0.22)",
                  color: "#fff",
                  fontSize: 13,
                }}
              >
                {msg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const fieldWrapStyle = {
  display: "grid",
  gap: 7,
};

const labelStyle = {
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "#fff",
  padding: "0 12px",
  outline: "none",
  boxSizing: "border-box",
};

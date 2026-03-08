import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

export default function AdminAdminRoles() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);
  const [savingId, setSavingId] = useState(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("admin");
  const [newOfficialLineUrl, setNewOfficialLineUrl] = useState("");

  const load = async () => {
    setErr("");
    setLoading(true);
    const r = await api.adminListAdmins();
    setLoading(false);

    if (!r.success) {
      setErr(r.error || "讀取失敗（需要 superadmin 權限）");
      setItems([]);
      return;
    }

    const list = Array.isArray(r.items) ? r.items : [];
    setItems(
      list.map((x) => ({
        ...x,
        official_line_url: x.official_line_url || "",
        __new_password: "",
      }))
    );
  };

  useEffect(() => {
    load();
  }, []);

  const setRow = (id, patch) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const create = async () => {
    setErr("");

    if (!newUsername.trim() || !newPassword.trim()) {
      setErr("請輸入帳號與密碼");
      return;
    }

    if (newPassword.trim().length < 4) {
      setErr("密碼至少 4 碼");
      return;
    }

    setSavingId("new");

    const r = await api.adminCreateAdmin({
      username: newUsername.trim(),
      password: newPassword,
      role: newRole,
      official_line_url: newOfficialLineUrl.trim(),
    });

    setSavingId(null);

    if (!r.success) {
      setErr(r.error || "新增失敗");
      return;
    }

    setNewUsername("");
    setNewPassword("");
    setNewRole("admin");
    setNewOfficialLineUrl("");
    await load();
  };

  const save = async (row) => {
    setErr("");
    setSavingId(row.id);

    const patch = {
      role: row.role,
      official_line_url: String(row.official_line_url || "").trim(),
    };

    if (row.__new_password && String(row.__new_password).length >= 4) {
      patch.password = String(row.__new_password);
    }

    const r = await api.adminUpdateAdmin(row.id, patch);
    setSavingId(null);

    if (!r.success) {
      setErr(r.error || "儲存失敗");
      return;
    }

    await load();
  };

  const remove = async (row) => {
    if (!confirm(`確定刪除管理員：${row.username} ?`)) return;

    setErr("");
    setSavingId(row.id);

    const r = await api.adminRemoveAdmin(row.id);

    setSavingId(null);

    if (!r.success) {
      setErr(r.error || "刪除失敗");
      return;
    }

    await load();
  };

  const sorted = useMemo(() => {
    return [...items].sort((a, b) =>
      String(a.username || "").localeCompare(String(b.username || ""))
    );
  }, [items]);

  return (
    <div style={{ textAlign: "left" }}>
      {err ? <div style={{ marginBottom: 12, color: "#ffb3b3" }}>{err}</div> : null}

      <div className="cardBox" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>新增管理員</h3>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            className="input"
            placeholder="帳號"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            style={{ width: 200 }}
          />

          <input
            className="input"
            placeholder="密碼（至少 4 碼）"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: 220 }}
          />

          <input
            className="input"
            placeholder="官方 LINE 網址（可不填）"
            value={newOfficialLineUrl}
            onChange={(e) => setNewOfficialLineUrl(e.target.value)}
            style={{ width: 320 }}
          />

          <select
            className="input"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            <option value="admin">admin</option>
            <option value="superadmin">superadmin</option>
          </select>

          <button
            className="btn btnPrimary"
            onClick={create}
            disabled={savingId === "new"}
          >
            {savingId === "new" ? "新增中..." : "新增"}
          </button>

          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "讀取中..." : "重新讀取"}
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="adminTable" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ minWidth: 60 }}>ID</th>
              <th style={{ minWidth: 200 }}>帳號</th>
              <th style={{ minWidth: 140 }}>角色</th>
              <th style={{ minWidth: 260 }}>官方 LINE 網址</th>
              <th style={{ minWidth: 200 }}>重設密碼</th>
              <th style={{ minWidth: 220 }}>操作</th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>

                <td>{row.username}</td>

                <td>
                  <select
                    className="input"
                    value={row.role || "admin"}
                    onChange={(e) => setRow(row.id, { role: e.target.value })}
                  >
                    <option value="admin">admin</option>
                    <option value="superadmin">superadmin</option>
                  </select>
                </td>

                <td>
                  <input
                    className="input"
                    type="text"
                    value={row.official_line_url || ""}
                    onChange={(e) =>
                      setRow(row.id, { official_line_url: e.target.value })
                    }
                    placeholder="https://line.me/..."
                    style={{ width: 240 }}
                  />
                </td>

                <td>
                  <input
                    className="input"
                    type="password"
                    value={row.__new_password || ""}
                    onChange={(e) => setRow(row.id, { __new_password: e.target.value })}
                    placeholder="至少 4 碼"
                    style={{ width: 170 }}
                  />
                </td>

                <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="btn btnPrimary"
                    onClick={() => save(row)}
                    disabled={savingId === row.id}
                  >
                    {savingId === row.id ? "儲存中..." : "儲存"}
                  </button>

                  <button
                    className="btn"
                    onClick={() => remove(row)}
                    disabled={savingId === row.id}
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
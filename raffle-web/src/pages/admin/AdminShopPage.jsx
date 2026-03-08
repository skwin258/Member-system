// raffle-web/src/pages/admin/AdminShopPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getAdminToken } from "../../api";

/**
 * 後台：商城管理（不依賴 api.request / api.requestAdmin2）
 * - 跑馬燈 marquee_text：GET/POST /admin/shop/config（admin auth）
 * - 商品列表：GET /shop/products（public）
 * - 商品新增：POST /admin/shop/products（admin auth，後端若未做會顯示錯誤）
 * - 商品刪除：DELETE /admin/shop/products/:id（admin auth）
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";
const CATEGORIES = ["稀有商品", "折抵金", "現金"];

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeProduct(p) {
  return {
    id: String(p?.id ?? ""),
    name: String(p?.name ?? ""),
    image_url: String(p?.image_url ?? ""),
    cost_s: toNum(p?.cost_s, 0),
    category: String(p?.category ?? ""),
    enabled: toNum(p?.enabled, 1),
    deleted: toNum(p?.deleted, 0),
    sort: toNum(p?.sort, 0),
    updated_at: String(p?.updated_at ?? ""),
    created_at: String(p?.created_at ?? ""),
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function http(path, { method = "GET", body, auth } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth === "admin") {
    const t = getAdminToken?.() || "";
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await safeJson(res);

  // 讓 UI 永遠拿到 {success, error} 的結構
  if (data && typeof data === "object") return data;

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }
  return { success: true };
}

export default function AdminShopPage() {
  const [tab, setTab] = useState("config"); // config | products

  // config
  const [marqueeText, setMarqueeText] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // products
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");

  // create product
  const [creating, setCreating] = useState(false);
const [form, setForm] = useState({
  name: "",
  image_url: "",
  cost_s: 0,
  reward_discount: 0,
  reward_welfare: 0,
  category: "折抵金",
  enabled: 1,
  sort: 0,
});

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    loadConfig();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadConfig() {
    setErr("");
    setMsg("");
    try {
      const r = await http("/admin/shop/config", { method: "GET", auth: "admin" });
      if (r?.success) setMarqueeText(String(r.marquee_text ?? ""));
      else setErr(r?.error || "讀取跑馬燈失敗");
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function saveConfig() {
    setErr("");
    setMsg("");
    setSavingConfig(true);
    try {
      const r = await http("/admin/shop/config", {
        method: "POST",
        auth: "admin",
        body: { marquee_text: marqueeText },
      });
      if (r?.success) setMsg("✅ 已儲存跑馬燈文字");
      else setErr(r?.error || "儲存失敗");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSavingConfig(false);
    }
  }

  async function loadProducts() {
    setErr("");
    setMsg("");
    setLoadingProducts(true);
    try {
      const r = await http("/shop/products", { method: "GET" });
      if (r?.success) setProducts((r.items || []).map(normalizeProduct));
      else setErr(r?.error || "讀取商品失敗");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingProducts(false);
    }
  }

  const filtered = useMemo(() => {
    let list = Array.isArray(products) ? [...products] : [];
    list = list.filter((p) => !p.deleted);

    if (cat !== "all") list = list.filter((p) => p.category === cat);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(k) ||
          p.id.toLowerCase().includes(k) ||
          p.category.toLowerCase().includes(k)
      );
    }
    list.sort((a, b) => a.sort - b.sort || String(b.updated_at).localeCompare(String(a.updated_at)));
    return list;
  }, [products, q, cat]);

  async function softDeleteProduct(id) {
    if (!id) return;
    if (!confirm(`確定刪除商品：${id}？（soft delete）`)) return;

    setErr("");
    setMsg("");
    try {
      const r = await http(`/admin/shop/products/${encodeURIComponent(id)}`, {
        method: "DELETE",
        auth: "admin",
      });
      if (r?.success) {
        setMsg("✅ 已刪除（soft delete）");
        await loadProducts();
      } else {
        setErr(r?.error || "刪除失敗");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  async function createProduct() {
    setErr("");
    setMsg("");
    setCreating(true);
    try {
const payload = {
  name: String(form.name || "").trim(),
  image_url: String(form.image_url || "").trim(),
  cost_s: toNum(form.cost_s, 0),
  reward_discount: toNum(form.reward_discount, 0),
  reward_welfare: toNum(form.reward_welfare, 0),
  category: String(form.category || "").trim(),
  enabled: toNum(form.enabled, 1),
  sort: toNum(form.sort, 0),
};

      if (!payload.name) {
        setErr("請輸入商品名稱");
        return;
      }
      if (!payload.category) {
        setErr("請選擇分類");
        return;
      }

      const r = await http("/admin/shop/products", {
        method: "POST",
        auth: "admin",
        body: payload,
      });

      if (r?.success) {
        setMsg("✅ 已新增商品");
        setForm((s) => ({ ...s, name: "", image_url: "", cost_s: 0, sort: 0 }));
        await loadProducts();
      } else {
        setErr(r?.error || "新增失敗（後端可能尚未提供 POST /admin/shop/products）");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>商城管理</h2>

        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          <button
            onClick={() => setTab("config")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.2)",
              background: tab === "config" ? "rgba(255,255,255,.12)" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            跑馬燈設定
          </button>

          <button
            onClick={() => setTab("products")}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.2)",
              background: tab === "products" ? "rgba(255,255,255,.12)" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            商品管理
          </button>
        </div>
      </div>

      {(err || msg) && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,.16)",
            background: err ? "rgba(255,0,0,.12)" : "rgba(0,255,120,.10)",
            color: "#fff",
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
          }}
        >
          {err || msg}
        </div>
      )}

      {tab === "config" && (
<div className="shopPanel">
          <div style={{ marginBottom: 10, opacity: 0.9 }}>跑馬燈文字</div>

          <textarea
            value={marqueeText}
            onChange={(e) => setMarqueeText(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,.18)",
              background: "rgba(0,0,0,.35)",
              color: "#fff",
              outline: "none",
              resize: "vertical",
              lineHeight: 1.5,
            }}
            placeholder="例如：提醒：兌換後請至背包查看｜最新公告：折抵金商品上架中..."
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(0,255,120,.12)",
                color: "#fff",
                cursor: "pointer",
                opacity: savingConfig ? 0.6 : 1,
              }}
            >
              {savingConfig ? "儲存中..." : "儲存"}
            </button>

            <button
              onClick={loadConfig}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(255,255,255,.08)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              重新載入
            </button>
          </div>
        </div>
      )}

      {tab === "products" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 14 }}>
          {/* 左：列表 */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(0,0,0,.25)",
              borderRadius: 16,
              padding: 16,
              minHeight: 380,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>商品列表</div>

              <button
                onClick={loadProducts}
                style={{
                  marginLeft: "auto",
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(255,255,255,.08)",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                重新載入
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜尋 id / 名稱 / 分類"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,0,0,.35)",
                  color: "#fff",
                  outline: "none",
                }}
              />

              <select
                value={cat}
                onChange={(e) => setCat(e.target.value)}
                style={{
                  width: 140,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,0,0,.35)",
                  color: "#fff",
                  outline: "none",
                }}
              >
                <option value="all">全部分類</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {loadingProducts ? (
              <div style={{ opacity: 0.85 }}>讀取中...</div>
            ) : filtered.length === 0 ? (
              <div style={{ opacity: 0.75 }}>目前沒有商品</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "84px 1fr auto",
                      gap: 12,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(0,0,0,.18)",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 84,
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(255,255,255,.04)",
                      }}
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name}
                      </div>
                      <div style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>
                        分類：{p.category || "-"}｜S幣：{p.cost_s}｜sort：{p.sort}｜enabled：{p.enabled}
                      </div>
                      <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>id: {p.id}</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        onClick={() => softDeleteProduct(p.id)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,120,120,.35)",
                          background: "rgba(255,0,0,.12)",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右：新增 */}
          <div
            style={{
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(0,0,0,.25)",
              borderRadius: 16,
              padding: 16,
              minHeight: 380,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>新增商品</div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ opacity: 0.85, fontSize: 13 }}>名稱</div>
                <input
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(0,0,0,.35)",
                    color: "#fff",
                    outline: "none",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ opacity: 0.85, fontSize: 13 }}>圖片 URL</div>
                <input
                  value={form.image_url}
                  onChange={(e) => setForm((s) => ({ ...s, image_url: e.target.value }))}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(0,0,0,.35)",
                    color: "#fff",
                    outline: "none",
                  }}
                />
              </label>

<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>

<label style={{ display: "grid", gap: 6 }}>
  <div style={{ opacity: 0.85, fontSize: 13 }}>扣除S幣</div>
  <input
    type="number"
    value={form.cost_s}
    onChange={(e) => setForm((s) => ({ ...s, cost_s: e.target.value }))}
    style={{
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0,0,0,.35)",
      color: "#fff",
      outline: "none",
    }}
  />
</label>

  <label style={{ display: "grid", gap: 6 }}>
    <div style={{ opacity: 0.85, fontSize: 13 }}>折抵金</div>
    <input
      type="number"
      value={form.reward_discount}
      onChange={(e)=>setForm((s)=>({...s,reward_discount:e.target.value}))}
      style={{
        padding:"10px 12px",
        borderRadius:12,
        border:"1px solid rgba(255,255,255,.18)",
        background:"rgba(0,0,0,.35)",
        color:"#fff",
        outline:"none"
      }}
    />
  </label>

  <label style={{ display: "grid", gap: 6 }}>
    <div style={{ opacity: 0.85, fontSize: 13 }}>福利金</div>
    <input
      type="number"
      value={form.reward_welfare}
      onChange={(e)=>setForm((s)=>({...s,reward_welfare:e.target.value}))}
      style={{
        padding:"10px 12px",
        borderRadius:12,
        border:"1px solid rgba(255,255,255,.18)",
        background:"rgba(0,0,0,.35)",
        color:"#fff",
        outline:"none"
      }}
    />
  </label>

</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ opacity: 0.85, fontSize: 13 }}>分類</div>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(0,0,0,.35)",
                      color: "#fff",
                      outline: "none",
                    }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <div style={{ opacity: 0.85, fontSize: 13 }}>顯示/隱藏</div>
                  <select
                    value={form.enabled}
                    onChange={(e) => setForm((s) => ({ ...s, enabled: Number(e.target.value) }))}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,.18)",
                      background: "rgba(0,0,0,.35)",
                      color: "#fff",
                      outline: "none",
                    }}
                  >
                    <option value={1}>顯示</option>
                    <option value={0}>隱藏</option>
                  </select>
                </label>
              </div>

              <button
                onClick={createProduct}
                disabled={creating}
                style={{
                  marginTop: 6,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,255,120,.12)",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: creating ? 0.6 : 1,
                }}
              >
                {creating ? "新增中..." : "新增商品"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
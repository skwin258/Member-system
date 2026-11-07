import { API_BASE } from '../../config';
// raffle-web/src/pages/admin/AdminShopPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAdminToken } from "../../api";

const CATEGORIES = ["稀有商品", "折抵金", "現金"];
const emptyProduct = {
  name: "", image_url: "", cost_s: 0, reward_discount: 0, reward_welfare: 0,
  category: "折抵金", enabled: 1, sort: 0,
};
const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const imageSource = url => url.startsWith("/r2/") ? API_BASE + url : url;

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
    reward_discount: toNum(p?.reward_discount, 0),
    reward_welfare: toNum(p?.reward_welfare, 0),
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
  const multipart = body instanceof FormData;
  if (body !== undefined && !multipart) headers["Content-Type"] = "application/json";
  if (auth === "admin") {
    const t = getAdminToken?.() || "";
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: multipart ? body : body !== undefined ? JSON.stringify(body) : undefined,
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

  const [savingProduct, setSavingProduct] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(emptyProduct);
  const [image, setImage] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [selected, setSelected] = useState([]);
  const productForm = useRef(null);
  const productBusy = savingProduct || deleting || loadingProducts;

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "products") void loadProducts();
  }, [tab]);

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
      const r = await http("/admin/shop/products", { auth: "admin" });
      if (r?.success) {
        const list = (r.items || []).map(normalizeProduct).filter(p => !p.deleted);
        setProducts(list);
        setSelected(ids => ids.filter(id => list.some(p => p.id === id)));
      }
      else setErr(r?.error || "讀取商品失敗");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoadingProducts(false);
    }
  }

  const filtered = useMemo(() => {
    let list = Array.isArray(products) ? [...products] : [];

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

  function editProduct(product = emptyProduct) {
    setForm(product);
    setImage(null);
    setFileKey(key => key + 1);
    setErr("");
    setMsg("");
    if (product.id) productForm.current?.scrollIntoView?.({ block: "nearest" });
  }

  async function deleteProducts(ids, description) {
    if (productBusy || !ids.length || !confirm(`確定刪除${description}？`)) return;
    setErr("");
    setMsg("");
    setDeleting(true);
    try {
      const r = await http("/admin/shop/products/batch-delete", {
        method: "POST",
        auth: "admin",
        body: { ids },
      });
      if (!r?.success) throw new Error(r?.error || "刪除失敗");
      setProducts(list => list.filter(product => !ids.includes(product.id)));
      setSelected(list => list.filter(id => !ids.includes(id)));
      if (ids.includes(form.id)) editProduct();
      setMsg(`已刪除 ${r.deleted} 件商品`);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setDeleting(false);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (productBusy) return;
    setErr("");
    setMsg("");
    setSavingProduct(true);
    try {
      const payload = {
        name: form.name.trim(),
        image_url: form.image_url.trim(),
        cost_s: toNum(form.cost_s, 0),
        reward_discount: toNum(form.reward_discount, 0),
        reward_welfare: toNum(form.reward_welfare, 0),
        category: form.category.trim(),
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

      if (image) {
        if (!imageTypes.includes(image.type) || !image.size || image.size > 8 * 1024 * 1024) {
          throw new Error("請上傳 8 MB 以內的 JPG、PNG、WebP 或 GIF 照片");
        }
        const body = new FormData();
        body.append("file", image);
        const upload = await http("/admin/shop/upload", { method: "POST", auth: "admin", body });
        if (!upload?.success || !upload.url) throw new Error(upload?.error || "照片上傳失敗");
        payload.image_url = upload.url;
        setForm(current => ({ ...current, image_url: upload.url }));
        setImage(null);
        setFileKey(key => key + 1);
      }

      const path = form.id ? `/admin/shop/products/${encodeURIComponent(form.id)}` : "/admin/shop/products";
      const r = await http(path, {
        method: form.id ? "PATCH" : "POST",
        auth: "admin",
        body: payload,
      });

      if (r?.success) {
        editProduct();
        await loadProducts();
        setMsg(form.id ? "已更新商品" : "已新增商品");
      } else {
        setErr(r?.error || "商品儲存失敗");
      }
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSavingProduct(false);
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
        <div className="admin-shop-products">
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
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ fontWeight: 700 }}>商品列表</div>

              <button
                onClick={loadProducts}
                disabled={productBusy}
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
              <button className="btn" type="button" disabled={productBusy || !selected.length}
                onClick={() => deleteProducts(selected, `這 ${selected.length} 件商品`)}>
                批量刪除{selected.length ? `（${selected.length}）` : ""}
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
                      gridTemplateColumns: "auto minmax(40px, 84px) minmax(0, 1fr) auto",
                      gap: 12,
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,.12)",
                      background: "rgba(0,0,0,.18)",
                      alignItems: "center",
                    }}
                  >
                    <input type="checkbox" aria-label={`選取 ${p.name}`} checked={selected.includes(p.id)}
                      disabled={productBusy} onChange={event => {
                        const checked = event.target.checked;
                        setSelected(ids => checked ? [...ids, p.id] : ids.filter(id => id !== p.id));
                      }} />
                    <div
                      style={{
                        width: "100%",
                        height: 64,
                        borderRadius: 12,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,.12)",
                        background: "rgba(255,255,255,.04)",
                      }}
                    >
                      {p.image_url ? (
                        <img
                          src={imageSource(p.image_url)}
                          alt={p.name}
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : null}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.name}
                      </div>
                      <div style={{ opacity: 0.85, fontSize: 13, marginTop: 2 }}>
                        {p.category || "未分類"}｜{p.cost_s} S 幣｜{p.enabled ? "顯示" : "隱藏"}
                      </div>
                      <div style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>id: {p.id}</div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <button type="button" className="btn" onClick={() => editProduct(p)} disabled={productBusy}>
                        編輯
                      </button>
                      <button
                        onClick={() => deleteProducts([p.id], `「${p.name}」`)}
                        disabled={productBusy}
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

          <form ref={productForm} onSubmit={saveProduct}
            style={{
              border: "1px solid rgba(255,255,255,.14)",
              background: "rgba(0,0,0,.25)",
              borderRadius: 16,
              padding: 16,
              minHeight: 380,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{form.id ? `編輯商品 ${form.name}` : "新增商品"}</div>

            <fieldset disabled={productBusy} style={{ display: "grid", gap: 10, border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                <div style={{ opacity: 0.85, fontSize: 13 }}>商品照片</div>
                {form.image_url && <img src={imageSource(form.image_url)} alt="目前商品照片"
                  style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 8 }} />}
                <input
                  key={fileKey}
                  type="file"
                  accept={imageTypes.join(",")}
                  onChange={event => setImage(event.target.files[0] || null)}
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
                    {[...new Set([...CATEGORIES, form.category])].map((c) => (
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

              <label>排序
                <input className="input" type="number" value={form.sort}
                  onChange={event => setForm(current => ({ ...current, sort: event.target.value }))} />
              </label>
              <button
                type="submit"
                style={{
                  marginTop: 6,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: "rgba(0,255,120,.12)",
                  color: "#fff",
                  cursor: "pointer",
                  opacity: savingProduct ? 0.6 : 1,
                }}
              >
                {savingProduct ? "儲存中…" : form.id ? "儲存商品" : "新增商品"}
              </button>
              {form.id && <button type="button" className="btn" onClick={() => editProduct()}>取消編輯</button>}
            </fieldset>
          </form>
        </div>
      )}
    </div>
  );
}

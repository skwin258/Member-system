import { useMemo, useRef, useState, useEffect } from "react";
import "./shopPage.css";
import { api } from "../../api";
import ConfirmRedeemModal from "../../components/ConfirmRedeemModal.jsx";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function ProductCard({ p, onRedeem, canRedeem }) {
  return (
    <div className="productCard">
      <div className="productImg">
        <img src={p.imageUrl} alt={p.name} loading="lazy" />
      </div>

      <div className="productInfo">
        <div className="productName">{p.name}</div>
        <div className="productCost">
          需要 <span className="productCostStrong">{p.costS}</span> S幣
        </div>

        <button
          className={"redeemBtn " + (canRedeem ? "" : "dis")}
          disabled={!canRedeem}
          onClick={() => onRedeem?.(p)}
        >
          立即兌換
        </button>
      </div>
    </div>
  );
}

/**
 * ✅ 商城內頁專用 Topbar
 * - 只放：首頁 / 分類選單
 */
function ShopInnerTopbar({ mode, setMode, category, setCategory, categories }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="shopInnerBar">
      <button
        onClick={() => {
          setMode("home");
          setOpen(false);
        }}
        className={cn("pillBtn", mode === "home" ? "isActive" : "")}
      >
        首頁
      </button>

      <div className="dropdownWrap" ref={dropdownRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn("pillBtn", mode === "category" ? "isActive" : "")}
        >
          分類選單 <span className="pillArrow">▾</span>
        </button>

        {open && (
          <div className="dropdownMenu">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setMode("category");
                  setCategory(c);
                  setOpen(false);
                }}
                className={cn("dropdownItem", category === c ? "isActive" : "")}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "category" && (
        <div className="curCat">
          目前：<span className="curCatStrong">{category}</span>
        </div>
      )}
    </div>
  );
}

export default function ShopPage({ me, onRefreshMe, onOpenRedeemRecords }) {
  const [mode, setMode] = useState("home"); // "home" | "category"
  const [category, setCategory] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [marquee, setMarquee] = useState("");
  const [productsRaw, setProductsRaw] = useState([]);

  // ✅ 兌換確認彈窗（只放一份在 ShopPage）
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pick, setPick] = useState(null);

  // ✅ 進頁面就抓 API
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr("");

      try {
        const [p, c] = await Promise.all([api.shopProducts(), api.shopConfig()]);

        if (p?.success) {
          setProductsRaw(Array.isArray(p.items) ? p.items : []);
        } else {
          setProductsRaw([]);
          setErr(p?.error || "讀取商品失敗");
        }

        if (c?.success) {
          setMarquee(String(c.marquee_text || ""));
        } else {
          setMarquee("");
        }
      } catch (e) {
        setErr(String(e?.message || e || "讀取失敗"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ✅ 把後端欄位轉成 UI 用格式
  const products = useMemo(() => {
    const list = Array.isArray(productsRaw) ? productsRaw : [];
    return list
      .map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? ""),
        imageUrl: String(r.image_url ?? r.imageUrl ?? ""),
        costS: toNum(r.cost_s ?? r.costS ?? 0, 0),
        category: String(r.category ?? "未分類"),
      }))
      .filter((x) => x.id && x.name);
  }, [productsRaw]);

  // ✅ 分類：動態生成
  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) set.add(p.category || "未分類");
    const arr = Array.from(set);
    return arr.length ? arr : ["未分類"];
  }, [products]);

  // ✅ 如果還沒選分類，就預設第一個
  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [category, categories]);

  const filteredProducts = useMemo(() => {
    if (mode === "home") return products;
    return products.filter((p) => p.category === category);
  }, [mode, category, products]);

  const onRedeem = (p) => {
    if (!p) return;
    setPick(p);
    setConfirmOpen(true);
  };

  async function doRedeem() {
    if (!pick) return;
    setConfirmBusy(true);
    try {
      const r = await api.shopRedeem(pick.id);
      if (r?.success === false) throw new Error(r?.error || "兌換失敗");
      await onRefreshMe?.(); // ✅ 兌換後刷新餘額
      setConfirmOpen(false);
      setPick(null);
      alert("兌換成功 ✅");
    } catch (e) {
      alert(String(e?.message || e || "兌換失敗"));
    } finally {
      setConfirmBusy(false);
    }
  }

  const myS = Number(me?.user?.s_balance || 0);

  return (
    <div className="shopScope">
      {/* ✅ 商城工具列 */}
      <div className="shopHead">
        <div className="shopTitle">商城</div>
        <div className="shopRightTools">
          <div className="shopSBal">
            S幣餘額：<b>{myS}</b>
          </div>
          <button className="shopBtn ghost" type="button" onClick={() => onOpenRedeemRecords?.()}>
            兌換紀錄
          </button>
          <button className="shopBtn" type="button" onClick={() => window.location.reload()}>
            重新整理
          </button>
        </div>
      </div>

      <ShopInnerTopbar
        mode={mode}
        setMode={setMode}
        category={category}
        setCategory={setCategory}
        categories={categories}
      />

      {/* 跑馬燈 */}
      <div className="shopMarquee">
        <div className="shopMarqueeInner">
          {marquee ? marquee : "提醒：兌換後請至背包查看｜最新公告：折抵金商品上架中…"}
        </div>
      </div>

      {/* 內容：左商品 / 右公告欄 */}
      <div className="shopBody">
        {/* 左：商品區 */}
        <div className="shopPanel">
          <div className="panelTitle">{mode === "home" ? "全部商品" : `分類：${category}`}</div>

          {loading && <div style={{ padding: 12 }}>載入中…</div>}
          {!!err && !loading && <div style={{ padding: 12, opacity: 0.9 }}>⚠️ {err}</div>}

          {!loading && !err && (
            <div className="productGrid">
              {filteredProducts.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  onRedeem={onRedeem}
                  canRedeem={myS >= Number(p.costS || 0)}
                />
              ))}
              {filteredProducts.length === 0 && <div style={{ padding: 12, opacity: 0.8 }}>目前沒有商品</div>}
            </div>
          )}
        </div>

        {/* 右：公告欄 */}
        <div className="announcePanel">
          <div className="panelTitle">公告欄</div>
          <div className="announceList">
            <div className="announceItem">折抵金商品已更新，請至分類選單查看。</div>
            <div className="announceItem">兌換後若未入帳，請稍後重登或聯繫客服。</div>
          </div>
        </div>
      </div>

      {/* ✅ 兌換確認彈窗：只放這一份 */}
      <ConfirmRedeemModal
        open={confirmOpen}
        onClose={() => {
          if (confirmBusy) return;
          setConfirmOpen(false);
          setPick(null);
        }}
        onConfirm={doRedeem}
        busy={confirmBusy}
        product={
          pick
            ? {
                id: pick.id,
                title: pick.name,
                price_s: pick.costS,
                cover_url: pick.imageUrl,
              }
            : null
        }
      />
    </div>
  );
}

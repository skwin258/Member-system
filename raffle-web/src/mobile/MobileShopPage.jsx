import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import ConfirmRedeemModal from "../components/ConfirmRedeemModal.jsx";
import "./mobileShop.css";

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function MobileProductCard({ p, onRedeem, canRedeem }) {
  return (
    <div className="mShopProductCard">
      <div className="mShopProductImg">
        <img src={p.imageUrl} alt={p.name} loading="lazy" />
      </div>

      <div className="mShopProductBody">
        <div className="mShopProductName">{p.name}</div>
        <div className="mShopProductCost">
          需要 <span>{p.costS}</span> S幣
        </div>

        <button
          className={cn("mShopRedeemBtn", !canRedeem && "isDisabled")}
          disabled={!canRedeem}
          onClick={() => onRedeem?.(p)}
        >
          立即兌換
        </button>
      </div>
    </div>
  );
}

function MobileShopTabs({
  mode,
  setMode,
  category,
  setCategory,
  categories,
}) {
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
    <div className="mShopTabsCard">
      <button
        className={cn("mShopTabBtn", mode === "home" && "isActive")}
        onClick={() => {
          setMode("home");
          setOpen(false);
        }}
      >
        首頁
      </button>

      <div className="mShopDropdown" ref={dropdownRef}>
        <button
          className={cn("mShopTabBtn", mode === "category" && "isActive")}
          onClick={() => setOpen((v) => !v)}
        >
          分類選單 <span className="mShopTabArrow">▾</span>
        </button>

        {open ? (
          <div className="mShopDropdownMenu">
            {categories.map((c) => (
              <button
                key={c}
                className={cn(
                  "mShopDropdownItem",
                  category === c && "isActive"
                )}
                onClick={() => {
                  setMode("category");
                  setCategory(c);
                  setOpen(false);
                }}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function MobileShopPage({
  me,
  onRefreshMe,
  onOpenRedeemRecords,
}) {
  const [mode, setMode] = useState("home");
  const [category, setCategory] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [marquee, setMarquee] = useState("");
  const [productsRaw, setProductsRaw] = useState([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pick, setPick] = useState(null);

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

  const categories = useMemo(() => {
    const set = new Set();
    for (const p of products) set.add(p.category || "未分類");
    const arr = Array.from(set);
    return arr.length ? arr : ["未分類"];
  }, [products]);

  useEffect(() => {
    if (!category && categories.length) setCategory(categories[0]);
  }, [category, categories]);

  const filteredProducts = useMemo(() => {
    if (mode === "home") return products;
    return products.filter((p) => p.category === category);
  }, [mode, category, products]);

  const myS = Number(me?.user?.s_balance || 0);

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
      await onRefreshMe?.();
      setConfirmOpen(false);
      setPick(null);
      alert("兌換成功 ✅");
    } catch (e) {
      alert(String(e?.message || e || "兌換失敗"));
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="mShopPage">
      <div className="mShopMarquee">
        <div className="mShopMarqueeTrack">
          {marquee
            ? marquee
            : "提醒：兌換後請至背包查看｜最新公告：折抵金商品上架中｜兌換後若未入帳請稍後重登或聯繫客服"}
        </div>
      </div>

      <section className="mShopCard mShopInfoCard">
        <div className="mShopCardHead">
          <div className="mShopCardTitle">商城</div>
        </div>

<div className="mShopBalanceRow">
  <div className="mShopBalancePill">
    S幣餘額：<b>{myS}</b>
  </div>

  <div className="mShopActionGroup">
    <button
      className="mShopActionBtn isPrimary"
      type="button"
      onClick={() => onOpenRedeemRecords?.()}
    >
      兌換紀錄
    </button>

    <button
      className="mShopIconBtn"
      type="button"
      onClick={() => window.location.reload()}
      aria-label="重新整理"
      title="重新整理"
    >
      ↻
    </button>
  </div>
</div>
      </section>

      <MobileShopTabs
        mode={mode}
        setMode={setMode}
        category={category}
        setCategory={setCategory}
        categories={categories}
      />

<section className="mShopProductsSection">
  <div className="mShopSectionTitle">
    {mode === "home" ? "全部商品" : `分類：${category}`}
  </div>

  {loading ? <div className="mShopHint">載入中…</div> : null}
  {!!err && !loading ? <div className="mShopError">⚠️ {err}</div> : null}

  {!loading && !err ? (
    <div className="mShopProductsScroll">
      <div className="mShopGrid">
        {filteredProducts.map((p) => (
          <MobileProductCard
            key={p.id}
            p={p}
            onRedeem={onRedeem}
            canRedeem={myS >= Number(p.costS || 0)}
          />
        ))}

        {filteredProducts.length === 0 ? (
          <div className="mShopHint">目前沒有商品</div>
        ) : null}
      </div>
    </div>
  ) : null}
</section>

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
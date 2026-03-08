import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

function stripImgs(html = "") {
  return String(html)
    .replace(/<img\b[^>]*\/?>/gi, "")
    .replace(/<img\b[^>]*>(.*?)<\/img>/gi, "");
}

function resolveCoverUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/r2/")) return `${API_BASE}${s}`;
  return s;
}

export default function PromoPage() {
  const [positions, setPositions] = useState([]);
  const [tab, setTab] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [items, setItems] = useState([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [openItem, setOpenItem] = useState(null);

  const wheelLockRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);

  const loadPositions = async () => {
    try {
      const res = await fetch(`${API_BASE}/promotion-positions`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const list = Array.isArray(data.items) ? data.items : [];
      setPositions(list);

      if (!tab && list.length > 0) {
        setTab(String(list[0].position_key || ""));
      }
    } catch (e) {
      setErr(String(e?.message || e));
      setPositions([]);
    }
  };

  const buildUrl = (placementKey) => {
  const key = String(placementKey || "").trim().toLowerCase();

  // ✅ 方案 B：全部 = 所有優惠，不篩選 placement
  if (key === "coupon") {
    return `${API_BASE}/promotions`;
  }

  // 其他分類才篩選
  return `${API_BASE}/promotions?placement=${encodeURIComponent(key)}`;
};

  const loadByTab = async (placementKey) => {
    if (!placementKey) return;

    try {
      setLoading(true);
      setErr("");

      const res = await fetch(buildUrl(placementKey), {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const list = Array.isArray(data.items) ? data.items : [];
      setItems(list);
      setSlideIndex(0);
    } catch (e) {
      setErr(String(e?.message || e));
      setItems([]);
      setSlideIndex(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!positions.length) return;
    const ok = positions.some((p) => String(p.position_key) === String(tab));
    if (!ok) {
      setTab(String(positions[0].position_key || ""));
    }
  }, [positions, tab]);

  useEffect(() => {
    if (tab) loadByTab(tab);
  }, [tab]);

  const leftMenu = useMemo(
    () =>
      positions.map((p) => ({
        key: String(p.position_key || ""),
        label: String(p.position_label || ""),
      })),
    [positions]
  );

  const currentPositionLabel = useMemo(() => {
    return (
      positions.find((p) => String(p.position_key) === String(tab))?.position_label ||
      "優惠活動"
    );
  }, [positions, tab]);

  const activeItem = useMemo(() => {
    if (!items.length) return null;
    const safeIndex = Math.min(slideIndex, items.length - 1);
    return items[safeIndex] || null;
  }, [items, slideIndex]);

  const heroSrc = activeItem?.cover_image_url
    ? resolveCoverUrl(activeItem.cover_image_url)
    : "";

  const totalCount = items.length;
  const currentNo = totalCount > 0 ? slideIndex + 1 : 0;

  const goNextSlide = () => {
    if (items.length <= 1) return;
    setSlideIndex((prev) => (prev + 1) % items.length);
  };

  const goPrevSlide = () => {
    if (items.length <= 1) return;
    setSlideIndex((prev) => (prev - 1 + items.length) % items.length);
  };

  const handleWheelOnHero = (e) => {
    if (items.length <= 1) return;

    e.preventDefault();

    if (wheelLockRef.current) return;
    wheelLockRef.current = true;

    if (e.deltaY > 0) {
      goNextSlide();
    } else if (e.deltaY < 0) {
      goPrevSlide();
    }

    setTimeout(() => {
      wheelLockRef.current = false;
    }, 450);
  };

  const handleTouchStart = (e) => {
    if (items.length <= 1) return;
    const t = e.touches?.[0];
    if (!t) return;
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
  };

  const handleTouchEnd = (e) => {
    if (items.length <= 1) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - touchStartXRef.current;
    const dy = t.clientY - touchStartYRef.current;

    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNextSlide();
      else goPrevSlide();
      return;
    }

    if (Math.abs(dy) > 40) {
      if (dy < 0) goNextSlide();
      else goPrevSlide();
    }
  };

  const openLightbox = () => {
    if (!activeItem || !heroSrc) return;

    setOpenItem({
      id: activeItem?.id,
      title: activeItem?.title || "優惠",
      cover_image_url: heroSrc,
      content_html: activeItem?.content_html || "",
    });
  };

  const isEmpty = !loading && !err && !items.length;

  return (
    <div className="promoPage">
      <div className="promoHeader">
        <div className="promoTitle">優惠內容</div>
        <div className="promoSub">
          活動與福利資訊（點左側分類切換）
          {loading ? "（讀取中...）" : ""}
          {err ? <span className="promoErr">（{err}）</span> : null}
        </div>
      </div>

      <div className="promoGrid">
        <div className="promoSideLike">
          <div className="promoSideLike__sticker" />
          <div className="promoSideLike__panel">
            <div className="promoSideLike__title">優惠活動</div>

            <div className="promoSideLike__btns">
              {leftMenu.map((t) => (
                <button
                  key={t.key}
                  className={
                    tab === t.key
                      ? "promoSideLike__btn promoSideLike__btn--active"
                      : "promoSideLike__btn"
                  }
                  onClick={() => setTab(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="promoSideLike__hint">
          </div>
        </div>

        {isEmpty ? (
          <div
            className="promoRight"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 320,
              cursor: "default",
            }}
          >
            <div
              style={{
                textAlign: "center",
                color: "rgba(255,255,255,0.72)",
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              目前沒有{currentPositionLabel}活動
            </div>
          </div>
        ) : (
          <div
            className="promoRight"
            onClick={openLightbox}
            onWheel={handleWheelOnHero}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            role="button"
            style={{ position: "relative" }}
          >
            <img
              src={heroSrc}
              alt={activeItem?.title || "promo"}
              className="promoHeroImg"
              draggable="false"
            />

            {items.length > 0 ? (
              <div
                style={{
                  position: "absolute",
                  right: 18,
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 8px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.18)",
                  zIndex: 2,
                }}
              >
                {items.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSlideIndex(idx);
                    }}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      border:
                        idx === slideIndex
                          ? "2px solid rgba(80,160,255,0.95)"
                          : "2px solid rgba(255,255,255,0.95)",
                      background:
                        idx === slideIndex
                          ? "rgba(80,160,255,0.95)"
                          : "rgba(255,255,255,0.92)",
                      boxShadow:
                        idx === slideIndex
                          ? "0 0 10px rgba(80,160,255,0.55)"
                          : "0 0 6px rgba(255,255,255,0.18)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    aria-label={`切換到第 ${idx + 1} 張`}
                    title={`第 ${idx + 1} 張`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {openItem ? (
        <div className="promoLightboxMask" onClick={() => setOpenItem(null)}>
          <div className="promoLightbox" onClick={(e) => e.stopPropagation()}>
            <button
              className="promoLightboxClose"
              onClick={() => setOpenItem(null)}
              aria-label="close"
              title="關閉"
            >
              ×
            </button>

            <div className="promoLightboxHead">
              <div className="promoLightboxTitle">{openItem.title || "優惠活動"}</div>
            </div>

            <div className="promoLightboxScroll">
              <div className="promoLightboxImgWrap">
                <img
                  src={openItem.cover_image_url}
                  alt={openItem.title || "promo"}
                  className="promoLightboxImg"
                  draggable="false"
                />
              </div>

              <div
                className="promoLightboxHtml"
                dangerouslySetInnerHTML={{
                  __html: stripImgs(openItem.content_html || "<p>（無內容）</p>"),
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
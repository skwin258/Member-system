import React, { useEffect, useMemo, useState } from "react";
import "./mobilePromo.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

function resolveCoverUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/r2/")) return `${API_BASE}${s}`;
  return s;
}

function getRawContent(item) {
  return String(
    item?.content_html ||
      item?.content ||
      item?.description ||
      item?.desc ||
      ""
  ).trim();
}

function hasHtmlTags(s) {
  return /<\/?[a-z][\s\S]*>/i.test(String(s || ""));
}

function formatPlainText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitPlainParagraphs(s) {
  return formatPlainText(s)
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function MobilePromoPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);
  const [openMap, setOpenMap] = useState({});

  async function loadAllPromotions() {
    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`${API_BASE}/promotions`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const list = Array.isArray(data.items) ? data.items : [];

      const normalized = list
        .filter(Boolean)
        .filter((x) => Number(x?.enabled ?? 1) !== 0)
        .map((x, idx) => {
          const rawContent = getRawContent(x);
          return {
            id: x?.id ?? `promo-${idx}`,
            title: String(x?.title || "優惠活動").trim(),
            imageUrl: resolveCoverUrl(
              x?.cover_image_url || x?.image_url || x?.banner_url || ""
            ),
            rawContent,
            isHtml: hasHtmlTags(rawContent),
            paragraphs: splitPlainParagraphs(rawContent),
            sort: Number(x?.sort ?? idx),
          };
        })
        .sort((a, b) => a.sort - b.sort);

      setItems(normalized);
    } catch (e) {
      setErr(String(e?.message || e || "讀取優惠活動失敗"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllPromotions();
  }, []);

  const displayItems = useMemo(() => items, [items]);

  function toggleItem(id) {
    setOpenMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  if (loading) {
    return (
      <div className="mPromoPage">
        <div className="mPromoStateCard">載入中...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="mPromoPage">
        <div className="mPromoStateCard mPromoError">{err}</div>
      </div>
    );
  }

  if (!displayItems.length) {
    return (
      <div className="mPromoPage">
        <div className="mPromoStateCard">目前沒有優惠活動</div>
      </div>
    );
  }

  return (
    <div className="mPromoPage">
      <div className="mPromoScroll">
        {displayItems.map((item) => {
          const opened = !!openMap[item.id];

          return (
            <section
              key={item.id}
              className={`mPromoItem ${opened ? "is-open" : ""}`}
            >
              <button
                type="button"
                className="mPromoImageBtn"
                onClick={() => toggleItem(item.id)}
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="mPromoImage"
                  />
                ) : (
                  <div className="mPromoImagePlaceholder">優惠活動</div>
                )}
              </button>

              {opened ? (
                <div className="mPromoExpand">
                  <div className="mPromoExpandHead">
                    <div className="mPromoExpandTitleRow">
                      <div className="mPromoExpandTitle">{item.title}</div>
                    </div>

                    <button
                      type="button"
                      className="mPromoAction"
                      onClick={() => toggleItem(item.id)}
                    >
                      收起
                    </button>
                  </div>

                  {item.isHtml ? (
                    <div
                      className="mPromoContent"
                      dangerouslySetInnerHTML={{ __html: item.rawContent }}
                    />
                  ) : item.paragraphs.length ? (
                    <div className="mPromoContent">
                      {item.paragraphs.map((p, idx) => (
                        <p key={idx}>{p}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="mPromoEmptyText">目前尚無活動說明</div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  className="mPromoCollapsedBar"
                  onClick={() => toggleItem(item.id)}
                >
                  <div className="mPromoTitleRow">
                    <div className="mPromoTitle">{item.title}</div>
                  </div>

                  <div className="mPromoAction">查看詳情</div>
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
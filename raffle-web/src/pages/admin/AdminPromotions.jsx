import React, { useEffect, useMemo, useState } from "react";
import { getAdminToken } from "../../api";
import "./AdminPromotions.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8787";

function resolveCoverUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/r2/")) return `${API_BASE}${s}`;
  return s;
}

async function adminFetch(path, { method = "GET", body, headers, isForm } = {}) {
  const token = getAdminToken();
  if (!token) {
    return {
      success: false,
      error: "Unauthorized（token 無效或過期），請重新登入後台",
      status: 401,
    };
  }

  const autoIsForm =
    isForm || (typeof FormData !== "undefined" && body instanceof FormData);

  const h = { ...(headers || {}), Authorization: `Bearer ${token}` };

  if (!autoIsForm) {
    h["Content-Type"] = h["Content-Type"] || "application/json";
  } else {
    if (h["Content-Type"]) delete h["Content-Type"];
    if (h["content-type"]) delete h["content-type"];
  }

  const init = { method, headers: h };
  if (body !== undefined) {
    init.body = autoIsForm
      ? body
      : typeof body === "string"
      ? body
      : JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE}${path}`, init);

  if (res.status === 401) {
    return {
      success: false,
      error: "Unauthorized（token 無效或過期），請重新登入後台",
      status: 401,
    };
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return await res.json();
  const txt = await res.text();
  return { success: res.ok, data: txt, status: res.status };
}

export default function AdminPromotions() {
  const emptyForm = useMemo(
    () => ({
      id: null,
      title: "",
      cover_image_url: "",
      content_html: "",
      placement: "coupon",
      enabled: true,
      sort: 0,
    }),
    []
  );

  const emptyPositionForm = useMemo(
    () => ({
      id: null,
      position_label: "",
      sort: 0,
    }),
    []
  );

  const [items, setItems] = useState([]);
  const [positions, setPositions] = useState([]);

  const [form, setForm] = useState(emptyForm);
  const [positionForm, setPositionForm] = useState(emptyPositionForm);

  const [loading, setLoading] = useState(false);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPosition, setSavingPosition] = useState(false);

  const [msg, setMsg] = useState("");

  const token = useMemo(() => getAdminToken(), []);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const updatePosition = (k, v) => setPositionForm((f) => ({ ...f, [k]: v }));

  const positionLabelMap = useMemo(() => {
    const map = {};
    for (const p of positions) {
      map[String(p.position_key || "")] = String(p.position_label || "");
    }
    return map;
  }, [positions]);

  const placementLabel = (v) => positionLabelMap[v] || v || "未分類";

  const pickToForm = (it) => ({
    id: it?.id ?? null,
    title: it?.title ?? "",
    cover_image_url: it?.cover_image_url ?? "",
    content_html: it?.content_html ?? "",
    placement: it?.placement || "coupon",
    enabled: !!it?.enabled,
    sort: Number(it?.sort ?? 0),
  });

  const pickPositionToForm = (it) => ({
    id: it?.id ?? null,
    position_label: it?.position_label ?? "",
    sort: Number(it?.sort ?? 0),
  });

  const loadPromotions = async () => {
    try {
      setMsg("");
      if (!getAdminToken()) {
        setItems([]);
        setMsg("❌ 未登入（找不到 admin token），請先重新登入後台");
        return;
      }

      setLoading(true);
      const data = await adminFetch("/admin/promotions", { method: "GET" });

      if (data?.status === 401 || data?.error === "unauthorized") {
        setItems([]);
        setMsg("❌ Unauthorized（token 無效或過期），請重新登入後台");
        return;
      }
      if (!data?.success) throw new Error(data?.error || "load promotions failed");

      setItems(data.items || []);
    } catch (e) {
      setMsg("❌ " + (e?.message || "load failed"));
    } finally {
      setLoading(false);
    }
  };

  const loadPositions = async () => {
    try {
      if (!getAdminToken()) {
        setPositions([]);
        return;
      }

      setLoadingPositions(true);
      const data = await adminFetch("/admin/promotion-positions", { method: "GET" });

      if (!data?.success) throw new Error(data?.error || "load positions failed");

      const list = Array.isArray(data.items) ? data.items : [];
      setPositions(list);

      if (!form.id) {
        const exists = list.some((p) => String(p.position_key) === String(form.placement));
        if (!exists && list.length > 0) {
          setForm((f) => ({ ...f, placement: String(list[0].position_key || "coupon") }));
        }
      }
    } catch (e) {
      setMsg("❌ " + (e?.message || "load positions failed"));
    } finally {
      setLoadingPositions(false);
    }
  };

  useEffect(() => {
    loadPromotions();
    loadPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadImage = async (file) => {
    try {
      setMsg("");
      if (!getAdminToken()) {
        setMsg("❌ 未登入（找不到 admin token），無法上傳");
        return;
      }

      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);

      const data = await adminFetch("/admin/promotions/upload", {
        method: "POST",
        body: fd,
        isForm: true,
      });

      if (data?.status === 401 || data?.error === "unauthorized") {
        throw new Error("Unauthorized（token 無效或過期），請重新登入後台");
      }
      if (!data?.success) throw new Error(data?.error || "upload failed");

      update("cover_image_url", data.url || "");
      setMsg("✅ 圖片已上傳");
    } catch (e) {
      setMsg("❌ " + (e?.message || "upload failed"));
    } finally {
      setUploading(false);
    }
  };

  const savePromotion = async () => {
    try {
      setMsg("");
      if (!getAdminToken()) {
        setMsg("❌ 未登入（找不到 admin token），無法儲存");
        return;
      }

      setSaving(true);

      const method = form.id ? "PATCH" : "POST";
      const path = form.id ? `/admin/promotions/${form.id}` : "/admin/promotions";

      const payload = {
        title: String(form.title || "").trim(),
        cover_image_url: String(form.cover_image_url || "").trim(),
        content_html: String(form.content_html || ""),
        placement: String(form.placement || "coupon"),
        enabled: !!form.enabled,
        sort: Number(form.sort || 0),
      };

      const data = await adminFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (data?.status === 401 || data?.error === "unauthorized") {
        throw new Error("Unauthorized（token 無效或過期），請重新登入後台");
      }
      if (!data?.success) throw new Error(data?.error || "save failed");

      setMsg("✅ 已儲存優惠");
      setForm((prev) => ({
        ...emptyForm,
        placement: prev.placement || "coupon",
      }));
      await loadPromotions();
      await loadPositions();
    } catch (e) {
      setMsg("❌ " + (e?.message || "save failed"));
    } finally {
      setSaving(false);
    }
  };

  const deletePromotion = async (id) => {
    try {
      setMsg("");
      if (!getAdminToken()) {
        setMsg("❌ 未登入（找不到 admin token），無法刪除");
        return;
      }

      if (!window.confirm("確定刪除這筆優惠？")) return;

      const data = await adminFetch(`/admin/promotions/${id}`, { method: "DELETE" });

      if (data?.status === 401 || data?.error === "unauthorized") {
        throw new Error("Unauthorized（token 無效或過期），請重新登入後台");
      }
      if (!data?.success) throw new Error(data?.error || "delete failed");

      setMsg("✅ 已刪除優惠");

      if (Number(form.id) === Number(id)) {
        setForm((prev) => ({
          ...emptyForm,
          placement: prev.placement || "coupon",
        }));
      }

      await loadPromotions();
      await loadPositions();
    } catch (e) {
      setMsg("❌ " + (e?.message || "delete failed"));
    }
  };

  const savePosition = async () => {
    try {
      setMsg("");

      const label = String(positionForm.position_label || "").trim();
      if (!label) {
        setMsg("❌ 請先輸入按鈕名稱");
        return;
      }

      setSavingPosition(true);

      const method = positionForm.id ? "PATCH" : "POST";
      const path = positionForm.id
        ? `/admin/promotion-positions/${positionForm.id}`
        : "/admin/promotion-positions";

      const payload = {
        position_label: label,
        sort: Number(positionForm.sort || 0),
      };

      const data = await adminFetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!data?.success) throw new Error(data?.error || "save position failed");

      setMsg(positionForm.id ? "✅ 已更新按鈕位置" : "✅ 已新增按鈕位置");
      setPositionForm(emptyPositionForm);
      await loadPositions();
    } catch (e) {
      setMsg("❌ " + (e?.message || "save position failed"));
    } finally {
      setSavingPosition(false);
    }
  };

  const deletePosition = async (id) => {
    try {
      setMsg("");

      const row = positions.find((p) => Number(p.id) === Number(id));
      if (!row) return;

      if (!window.confirm(`確定刪除按鈕「${row.position_label}」？`)) return;

      const data = await adminFetch(`/admin/promotion-positions/${id}`, {
        method: "DELETE",
      });

      if (!data?.success) throw new Error(data?.error || "delete position failed");

      setMsg("✅ 已刪除按鈕位置");

      if (Number(positionForm.id) === Number(id)) {
        setPositionForm(emptyPositionForm);
      }

      if (String(form.placement) === String(row.position_key)) {
        setForm((prev) => ({
          ...prev,
          placement: "coupon",
        }));
      }

      await loadPositions();
      await loadPromotions();
    } catch (e) {
      setMsg("❌ " + (e?.message || "delete position failed"));
    }
  };

  return (
    <div className="apPage apFixedPage">
      <div className="ap3Panel">
        <section className="apCard apLeftPanel">
          <div className="apPanelScroll">
            <div className="apCardHead">
            </div>
            <div className="apPositionManager">
              <div className="apSectionTitle">按鈕位置管理</div>
              <div className="apSectionSub">可新增、改名、刪除自訂按鈕。內建位置不可刪除。</div>

              <div className="apGrid2">
                <div className="apField">
                  <label className="apLabel">按鈕名稱</label>
                  <input
                    className="apInput"
                    value={positionForm.position_label}
                    onChange={(e) => updatePosition("position_label", e.target.value)}
                    placeholder="例如：活動"
                  />
                </div>

                <div className="apField">
                  <label className="apLabel">排序</label>
                  <input
                    className="apInput"
                    type="number"
                    value={positionForm.sort}
                    onChange={(e) => updatePosition("sort", Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="apActionRow apActionRowTight">
                <button
                  className="apBtn apBtnPrimary"
                  disabled={savingPosition}
                  onClick={savePosition}
                >
                  {savingPosition
                    ? "儲存中..."
                    : positionForm.id
                    ? "更新按鈕"
                    : "新增按鈕"}
                </button>

                {positionForm.id ? (
                  <button
                    className="apBtn apBtnGhost"
                    onClick={() => setPositionForm(emptyPositionForm)}
                  >
                    取消編輯
                  </button>
                ) : null}
              </div>

              <div className="apPositionList">
                {loadingPositions ? (
                  <div className="apEmpty">載入按鈕位置中...</div>
                ) : positions.length === 0 ? (
                  <div className="apEmpty">目前沒有按鈕位置</div>
                ) : (
                  positions.map((p) => (
                    <div key={p.id} className="apPositionItem">
                      <div className="apPositionInfo">
                        <div className="apPositionNameRow">
                          <span className="apPositionName">{p.position_label}</span>
                          {Number(p.built_in || 0) === 1 ? (
                            <span className="apBadge">內建</span>
                          ) : (
                            <span className="apBadge">自訂</span>
                          )}
                        </div>

                        <div className="apPositionMeta">
                          <span>key：{p.position_key}</span>
                          <span>排序：{Number(p.sort || 0)}</span>
                          <span>優惠數：{Number(p.promotion_count || 0)}</span>
                        </div>
                      </div>

                      <div className="apPositionActions">
                        <button
                          className="apBtn apBtnGhost"
                          onClick={() => {
                            setPositionForm(pickPositionToForm(p));
                            setMsg("");
                          }}
                        >
                          改名
                        </button>

                        <button
                          className="apBtn apBtnDanger"
                          disabled={Number(p.built_in || 0) === 1}
                          onClick={() => deletePosition(p.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="apDivider" />

            <div className="apField">
              <label className="apLabel">標題</label>
              <input
                className="apInput"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="請輸入優惠標題"
              />
            </div>

            <div className="apField">
              <label className="apLabel">封面圖片</label>
              <div className="apUploadRow">
                <label className="apUploadBtn">
                  選擇圖片
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImage(file);
                    }}
                  />
                </label>

                <div className="apUploadHint">
                  {uploading
                    ? "圖片上傳中..."
                    : form.cover_image_url
                    ? "已選擇 / 已上傳圖片"
                    : "尚未選擇圖片"}
                </div>
              </div>
            </div>

            <div className="apField">
              <label className="apLabel">文案</label>
              <textarea
                className="apTextarea"
                rows={12}
                value={form.content_html}
                onChange={(e) => update("content_html", e.target.value)}
                placeholder="請輸入文案"
              />
            </div>

            <div className="apGrid2">
              <div className="apField">
                <label className="apLabel">放置位置</label>
                <select
                  className="apSelect"
                  value={form.placement || "coupon"}
                  onChange={(e) => update("placement", e.target.value)}
                >
                  {positions.map((p) => (
                    <option key={p.id} value={p.position_key}>
                      {p.position_label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="apField">
                <label className="apLabel">排序</label>
                <input
                  className="apInput"
                  type="number"
                  value={form.sort}
                  onChange={(e) => update("sort", Number(e.target.value))}
                />
              </div>
            </div>

            <div className="apField">
              <label className="apCheckRow">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => update("enabled", e.target.checked)}
                />
                <span>啟用此優惠</span>
              </label>
            </div>

            <div className="apActionRow">
              <button
                className="apBtn apBtnPrimary"
                disabled={saving || uploading}
                onClick={savePromotion}
              >
                {saving ? "儲存中..." : form.id ? "更新優惠" : "儲存優惠"}
              </button>

              {form.id && (
                <button
                  className="apBtn apBtnGhost"
                  disabled={saving || uploading}
                  onClick={() => {
                    setForm((prev) => ({
                      ...emptyForm,
                      placement: prev.placement || "coupon",
                    }));
                    setMsg("");
                  }}
                >
                  取消編輯
                </button>
              )}
            </div>

            {msg ? (
              <div
                className={`apMsg ${
                  String(msg).startsWith("✅") ? "success" : "error"
                }`}
              >
                {msg}
              </div>
            ) : null}
          </div>
        </section>

        <section className="apCard apRightTop">
          <div className="apPanelScroll">
            <div className="apCardHead">
              <div>
                <h3 className="apTitleSm">預覽效果</h3>
                <div className="apSub">你現在編輯的優惠卡片預覽</div>
              </div>
            </div>

            <div className="apPreviewBox">
              {form.cover_image_url ? (
                <img
                  src={resolveCoverUrl(form.cover_image_url)}
                  className="apPreviewImage"
                  alt=""
                />
              ) : (
                <div className="apPreviewPlaceholder">尚未上傳封面圖片</div>
              )}

              <div className="apPreviewContent">
                <div className="apPreviewBadges">
                  <span className="apBadge">{placementLabel(form.placement)}</span>
                  <span className={"apBadge " + (form.enabled ? "on" : "off")}>
                    {form.enabled ? "啟用" : "停用"}
                  </span>
                </div>

                <div className="apPreviewTitle">
                  {form.title || "優惠標題預覽"}
                </div>

                <div className="apPreviewSort">排序：{Number(form.sort || 0)}</div>

                <div className="apPreviewHtml">
                  {form.content_html ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: form.content_html,
                      }}
                    />
                  ) : (
                    <span>這裡會顯示文案</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="apCard apRightBottom">
          <div className="apPanelScroll">
            <div className="apCardHead">
              <div>
                <h3 className="apTitleSm">目前優惠</h3>
                <div className="apSub">可編輯、刪除、查看目前已建立的活動</div>
              </div>

              <div className="apCount">{items.length} 筆</div>
            </div>

            {loading ? (
              <div className="apEmpty">載入中...</div>
            ) : items.length === 0 ? (
              <div className="apEmpty">目前沒有優惠資料</div>
            ) : (
              <div className="apListGrid apListGridSingle">
                {items.map((it) => (
                  <div key={it.id} className="apPromoItem">
                    <div className="apPromoThumbWrap">
                      {it.cover_image_url ? (
                        <img
                          src={resolveCoverUrl(it.cover_image_url)}
                          className="apPromoThumb"
                          alt=""
                        />
                      ) : (
                        <div className="apPromoThumb apPromoThumbEmpty">無圖片</div>
                      )}
                    </div>

                    <div className="apPromoBody">
                      <div className="apPromoBadges">
                        <span className="apBadge">{placementLabel(it.placement)}</span>
                        <span className={"apBadge " + (it.enabled ? "on" : "off")}>
                          {it.enabled ? "啟用" : "停用"}
                        </span>
                      </div>

                      <div className="apPromoTitle">{it.title || "未命名優惠"}</div>

                      <div className="apPromoMeta">
                        <span>排序：{Number(it.sort || 0)}</span>
                        <span>ID：{it.id}</span>
                      </div>
                    </div>

                    <div className="apPromoActions">
                      <button
                        className="apBtn apBtnGhost"
                        onClick={() => {
                          setForm(pickToForm(it));
                          setMsg("");
                        }}
                      >
                        編輯
                      </button>

                      <button
                        className="apBtn apBtnDanger"
                        onClick={() => deletePromotion(it.id)}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
// raffle-web/src/components/ConfirmRedeemModal.jsx
import React, { useEffect } from "react";
import "./confirmRedeemModal.css";

export default function ConfirmRedeemModal({
  open,
  onClose,
  onConfirm,
  busy = false,
  product,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const price = Number(product?.price_s || 0);
  const title = String(product?.title || "");
  const cover = String(product?.cover_url || "");
  return (
    <div className="crmOverlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="crmCard" role="dialog" aria-modal="true">
        <div className="crmHead">
          <div className="crmTitle">確認兌換</div>
          <button className="crmX" onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className="crmBody">
          <div className="crmRow">
            <div className="crmImgWrap">
              {cover ? <img className="crmImg" src={cover} alt="" /> : <div className="crmImg ph" />}
            </div>
            <div className="crmInfo">
              <div className="crmPTitle">{title}</div>
              <div className="crmPPrice">是否扣除 <b>{price}</b> S幣？</div>
              <div className="crmHint">點擊確定後會立即扣除 S幣並產生兌換紀錄。</div>
            </div>
          </div>
        </div>

        <div className="crmFoot">
          <button className="crmBtn ghost" onClick={onClose} disabled={busy}>取消</button>
          <button className="crmBtn solid" onClick={onConfirm} disabled={busy}>
            {busy ? "處理中..." : "確定"}
          </button>
        </div>
      </div>
    </div>
  );
}

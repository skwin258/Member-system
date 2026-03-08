import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./WinPopup.css";

export default function WinPopup({
  open = false,
  winImg = "",
  amount = 0,
  onClose,
  variant = "big",
  countDuration = 1500,
}) {
  const [displayAmount, setDisplayAmount] = useState(0);
  const [canClose, setCanClose] = useState(false);

  const end = useMemo(() => {
    const n = Number(amount || 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }, [amount]);

  useEffect(() => {
    if (!open) return;

    setDisplayAmount(0);
    setCanClose(false);

    const unlockTimer = setTimeout(() => {
      setCanClose(true);
    }, 220);

    const duration = Math.max(0, Number(countDuration) || 0);
    const startTime = performance.now();
    let raf = 0;

    const tick = (now) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayAmount(Math.floor(eased * end));

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplayAmount(end);
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      clearTimeout(unlockTimer);
      cancelAnimationFrame(raf);
    };
  }, [open, end, countDuration]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape" && canClose) {
        onClose?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, canClose, onClose]);

  if (!open) return null;

  const close = () => {
    if (!canClose) return;
    onClose?.();
  };

  const v = ["big", "super", "mega", "ultra", "legendary"].includes(String(variant))
    ? String(variant)
    : "big";

  const popupNode = (
    <div className="winpop-overlay" onClick={close} role="button" tabIndex={0}>
      <div className="winpop-card">
        <div className={["winpop-stack", `is-${v}`].join(" ")} onClick={close}>
          <div className="winpop-imgWrap">
            <img
              className="winpop-img"
              src={winImg || "/img/win_big.png"}
              alt="WIN"
              draggable={false}
            />
          </div>

          <div className="winpop-amt" aria-label={`現金 ${displayAmount} 元`} onClick={close}>
            <span className="winpop-money">現金</span>
            <span className="winpop-num">{displayAmount}</span>
            <span className="winpop-unit">元</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(popupNode, document.body);
}
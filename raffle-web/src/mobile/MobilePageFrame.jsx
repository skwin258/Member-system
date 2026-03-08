import React from "react";

export default function MobilePageFrame({ title, onBack, children, plain = false }) {
  return (
    <div className={`mbPageFrame ${plain ? "mbPageFrame--plain" : ""}`}>
      <div className="mbPageTopBar">
        <button className="mbBackBtn" type="button" onClick={onBack}>
          <span className="mbBackArrow">←</span>
          <span className="mbBackText">返回</span>
        </button>

        <div className="mbPageTitle">{title}</div>

        <div className="mbTopSpacer" />
      </div>

      {plain ? (
        <div className="mbPageBodyPlain">{children}</div>
      ) : (
        <div className="mbPageBody">
          <div className="mbInnerPageCard">{children}</div>
        </div>
      )}
    </div>
  );
}
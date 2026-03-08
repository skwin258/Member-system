import React, { useMemo } from "react";
import "./SupportPage.css";

export default function SupportPage({ me }) {
  const lineUrl = useMemo(() => {
    const raw = String(me?.user?.support_line_url || "").trim();
    return raw || "https://lin.ee/nJbstol";
  }, [me?.user?.support_line_url]);

  const openLine = () => {
    if (!lineUrl) return;
    window.open(lineUrl, "_blank");
  };

  return (
    <div className="supportPage">
      <div className="supportFrame">
        <div className="supportGlow supportGlowA" />
        <div className="supportGlow supportGlowB" />
        <div className="supportInner">
          <div className="supportBox">
            <h3>LINE 客服</h3>
            <p>加入官方 LINE 可協助處理：</p>
            <ul>
              <li>申請遊戲帳號</li>
              <li>兌換折抵金</li>
              <li>活動諮詢</li>
              <li>帳號問題</li>
              <li>兌換獎品</li>
              <li>兌換福利金</li>
              <li>申請AI百家/電子使用權限</li>
            </ul>
            <button className="supportBtn" onClick={openLine}>加入LINE客服</button>
          </div>
        </div>
      </div>
    </div>
  );
}

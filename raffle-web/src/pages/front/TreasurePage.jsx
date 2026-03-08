// src/pages/front/TreasurePage.jsx
import React, { useMemo } from "react";

import RedPacketPage from "../../RedPacketPage";
import WheelPage from "../WheelPage";
import NumberLotteryPage from "../NumberLotteryPage";

export default function TreasurePage({
  me,
  activities,
  onRefreshMe,
  onOpenRedeem,
  tab = "redpacket",
}) {
  const u = me?.user || {};
  const welfare = Number(u.welfare_balance || 0);

  /* =========================
     活動開關判斷
  ========================= */
  const enabled = useMemo(() => {
    const list = Array.isArray(activities) ? activities : [];
    const map = new Map(
      list.map((a) => [a.activity_key, Number(a.enabled || 0) === 1])
    );

    return {
      redpacket: map.has("redpacket") ? map.get("redpacket") : true,
      wheel: map.has("wheel") ? map.get("wheel") : true,
      number: map.has("number") ? map.get("number") : true,
    };
  }, [activities]);

  /* =========================
     兌換處理
  ========================= */
  const handleRedeem = () => {
    if (typeof onOpenRedeem === "function") return onOpenRedeem();
    alert("兌換功能尚未接上（請把兌換流程傳成 onOpenRedeem）");
  };

  return (
    <div
      className="treasurePageRoot"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
      }}
    >
{/* 福利金區塊暫時關閉 */}

      {/* 內容層 */}
      <div
        className="treasureContentLayer"
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
          minHeight: 0,
          overflow: "auto",
          padding: 18,
        }}
      >
        {tab === "redpacket" && enabled.redpacket && (
          <RedPacketPage
            me={me}
            onBack={() => {}}
            onRefreshMe={onRefreshMe}
            hideWelfareBox
            hideHeader
          />
        )}

        {tab === "wheel" && enabled.wheel && (
          <WheelPage
            me={me}
            onBack={() => {}}
            onRefreshMe={onRefreshMe}
            hideWelfareBox
            hideHeader
          />
        )}

        {tab === "number" && enabled.number && (
          <NumberLotteryPage
            me={me}
            onBack={() => {}}
            onRefreshMe={onRefreshMe}
            hideHeader
            hideWelfareBox
          />
        )}
      </div>
    </div>
  );
}


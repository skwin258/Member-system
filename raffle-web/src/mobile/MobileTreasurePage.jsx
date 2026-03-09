import React, { useState } from "react";
import RedPacketPage from "./RedPacketPage.jsx";
import MobileWheelPage from "./MobileWheelPage.jsx";
import WinPopup from "../components/WinPopup";

export default function MobileTreasurePage({
  me,
  activities,
  onRefreshMe,
  tab = "redpacket",
  onTabChange,
  isGuest = false,
  onNeedLogin,
}) {
  const [winPopup, setWinPopup] = useState(null);

  const handleWin = (amount, meta) => {
    setWinPopup({
      amount: Number(amount || 0),
      variant: meta?.variant || "big",
      img: meta?.img || "",
    });
  };

  if (tab === "redpacket") {
    return (
      <>
        <RedPacketPage
          me={me}
          onRefreshMe={onRefreshMe}
          onTabChange={onTabChange}
          isGuest={isGuest}
          onNeedLogin={onNeedLogin}
          onWin={handleWin}
        />

        <WinPopup
          open={!!winPopup}
          amount={winPopup?.amount || 0}
          variant={winPopup?.variant || "big"}
          winImg={winPopup?.img || ""}
          onClose={() => setWinPopup(null)}
        />
      </>
    );
  }

  if (tab === "wheel") {
    return (
      <MobileWheelPage
        me={me}
        onRefreshMe={onRefreshMe}
        onTabChange={onTabChange}
        isGuest={isGuest}
        onNeedLogin={onNeedLogin}
      />
    );
  }

  if (tab === "number") {
    return (
      <div style={{ color: "#fff", padding: "20px 12px 120px", textAlign: "center" }}>
        數字抽獎尚未開放，請重新整理。
      </div>
    );
  }

  return null;
}
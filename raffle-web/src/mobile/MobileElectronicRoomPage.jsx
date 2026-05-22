import React, { useEffect, useState } from "react";
import { api } from "../api";

const ELECTRONIC_ROOM_URL = "https://seth-site.pages.dev/login";

export default function MobileElectronicRoomPage({ onRefreshMe }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");

  async function openElectronicRoom() {
    try {
      setLoading(true);
      setErr("");
      setIframeUrl("");

      const status = await api.getElectronicRoomStatus();

      if (!status?.success) {
        setErr(status?.error || "請先登入會員");
        return;
      }

      if (!status.allowed) {
        setErr(status.message || "尚未開通電子老虎機權限，請聯絡客服");
        return;
      }

      const ticketRes = await api.createElectronicRoomTicket();

      if (!ticketRes?.success || !ticketRes?.ticket) {
        setErr(ticketRes?.error || "建立通行碼失敗，請稍後再試");
        return;
      }

      const url = `${ELECTRONIC_ROOM_URL}?ticket=${encodeURIComponent(
        ticketRes.ticket
      )}`;

      setIframeUrl(url);

      await onRefreshMe?.();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "系統錯誤，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    openElectronicRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err) {
    return (
      <div className="mbElectronicIframePage">
        <div className="mbElectronicErrorBox">
          <div className="mbElectronicErrorTitle">電子老虎機無法開啟</div>
          <div className="mbElectronicErrorText">{err}</div>

          <button
            className="mbElectronicRetryBtn"
            type="button"
            onClick={openElectronicRoom}
          >
            重新嘗試
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mbElectronicIframePage">
      {loading && (
        <div className="mbElectronicLoading">
          <div className="mbElectronicLoadingTitle">電子老虎機載入中</div>
          <div className="mbElectronicLoadingText">正在建立專屬通行碼...</div>
        </div>
      )}

      {iframeUrl && (
        <iframe
          className="mbElectronicIframe"
          src={iframeUrl}
          title="電子老虎機"
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}

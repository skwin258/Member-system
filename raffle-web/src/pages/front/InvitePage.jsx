// raffle-web/src/pages/front/InvitePage.jsx
import { useEffect, useMemo, useState } from "react";
import { api } from "../../api";

export default function InvitePage() {
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);

  const [refErr, setRefErr] = useState("");
  const [refTotal, setRefTotal] = useState(0);
  const [refItems, setRefItems] = useState([]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    setRefErr("");

    try {
      const codeRes = await api.getReferralCode();
      if (codeRes?.success && codeRes?.code) {
        const url = window.location.origin + "/register/" + codeRes.code;
        setLink(url);
      } else {
        setLink("");
      }

      const myRes = await api.getMyReferrals();
      if (!myRes?.success) {
        setRefItems([]);
        setRefTotal(0);
        setRefErr(myRes?.error || "讀取推薦名單失敗");
      } else {
        const items =
          (Array.isArray(myRes.list) && myRes.list) ||
          (Array.isArray(myRes.items) && myRes.items) ||
          (Array.isArray(myRes.referrals) && myRes.referrals) ||
          (Array.isArray(myRes.data) && myRes.data) ||
          (Array.isArray(myRes.results) && myRes.results) ||
          [];

        setRefItems(items);

        const total =
          Number(myRes.total ?? myRes.count ?? items.length ?? 0) || 0;
        setRefTotal(total);
      }
    } catch (e) {
      console.error(e);
      setRefItems([]);
      setRefTotal(0);
      setRefErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      alert("已複製推廣網址");
    } catch {
      alert("複製失敗，請手動複製");
    }
  }

  const usernames = useMemo(() => {
    const arr = (refItems || [])
      .map((x) => {
        if (!x) return "";
        if (typeof x === "string") return x.trim();
        return String(
          x.username ||
            x.referred_username ||
            x.referredUser ||
            x.referred ||
            ""
        ).trim();
      })
      .filter(Boolean);

    return Array.from(new Set(arr));
  }, [refItems]);

  return (
    <div className="invitePage">
      <div className="inviteHeroCard">
        <div className="inviteHeroTitle">邀請朋友</div>
        <div className="inviteHeroSub">
          分享您的專屬推廣網址，邀請朋友加入平台。
        </div>
      </div>

      <div className="inviteGrid">
        <section className="inviteCard">
          <div className="inviteCardTitle">您的推廣網址</div>
          <div className="inviteCardSub">
            將下方網址分享給朋友，對方註冊後即可計入推薦名單。
          </div>

          <div className="inviteLinkBox">
            <input
              className="inviteInput"
              value={link}
              readOnly
              placeholder="尚未取得推廣網址"
            />
            <button className="inviteBtn inviteBtnPrimary" onClick={copy} disabled={!link}>
              複製
            </button>
          </div>
        </section>

        <section className="inviteCard">
          <div className="inviteStatsRow">
            <div>
              <div className="inviteCardTitle">推薦名單</div>
              <div className="inviteCardSub">您目前成功推薦的人數與帳號列表</div>
            </div>

            <div className="inviteCountBadge">
              已推薦 {refTotal} 人
            </div>
          </div>

          {loading ? (
            <div className="inviteHint">載入中...</div>
          ) : null}

          {refErr ? (
            <div className="inviteError">讀取失敗：{refErr}</div>
          ) : null}

          {!refErr && !loading && refTotal === 0 ? (
            <div className="inviteHint">目前尚無推薦紀錄</div>
          ) : null}

{!refErr && !loading && usernames.length > 0 ? (
  <div className="inviteListViewport">
    <div className="inviteList">
      {usernames.map((name, idx) => (
        <div key={idx} className="inviteUserRow">
          <span className="inviteUserIndex">#{idx + 1}</span>
          <span className="inviteUserName">{name}</span>
        </div>
      ))}
    </div>
  </div>
) : null}

          {!refErr && !loading && refTotal > 0 && usernames.length === 0 ? (
            <div className="inviteHint">
              已有推薦人數，但名單尚未載入，請按下方重新整理。
            </div>
          ) : null}

          <div className="inviteFooterRow">
            <button className="inviteBtn inviteBtnGhost" onClick={loadAll} disabled={loading}>
              {loading ? "讀取中..." : "重新整理"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
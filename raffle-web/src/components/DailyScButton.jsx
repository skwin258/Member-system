import { useEffect, useState } from "react";
import { api } from "../api";

const taipeiDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei", dateStyle: "short" });

export default function DailyScButton({ user, onRefreshMe, className }) {
  const [today, setToday] = useState(() => taipeiDay.format(new Date()));
  const [claimedDay, setClaimedDay] = useState(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setToday(taipeiDay.format(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  const claimed = user.sc_claim_day === today || claimedDay === today;
  async function claim() {
    setPending(true);
    try {
      const result = await api.claimDailySc();
      if (!result?.success) throw new Error(result?.error || "領取失敗");
      setClaimedDay(result.user.sc_claim_day);
      await onRefreshMe?.({ force: true });
    } catch (error) {
      alert(error.message);
    } finally {
      setPending(false);
    }
  }

  return <button className={className} type="button" disabled={pending || claimed || user.sc_balance === undefined} onClick={claim}>
    {claimed ? "今日已領" : pending ? "領取中…" : "領取 3,000"}
  </button>;
}

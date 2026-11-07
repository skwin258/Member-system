import { useEffect, useState } from "react";
import { api } from "../../api";
import { dailyTaskNames } from "../../lib/dailyTasks";

const accountTasks = ["instagram", "threads"];
const socialTasks = ["share_post", "like_post", "share_story"];

function ProofImage({ id }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let previewUrl;
    api.adminDailyTaskImage(id, controller.signal).then(blob => {
      if (controller.signal.aborted) return;
      previewUrl = URL.createObjectURL(blob);
      setUrl(previewUrl);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => {
      controller.abort();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [id]);
  if (error) return <p role="alert">{error}</p>;
  if (!url) return <p>讀取截圖中…</p>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="會員提交的首頁截圖" /></a>;
}

export default function AdminMemberDailyTasks({ userId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let active = true;
    api.adminDailyTasks(userId).then(result => {
      if (!result?.success) throw new Error(result?.error || "讀取任務失敗");
      if (active) setItems(result.items);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [userId]);

  async function review(task, approved, proofId) {
    if (busy) return;
    setBusy(task);
    setError("");
    try {
      const result = await api.adminReviewDailyTask(userId, task, approved, proofId);
      if (!result?.success) throw new Error(result?.error || "更新狀態失敗");
      const latest = await api.adminDailyTasks(userId);
      if (!latest?.success) throw new Error(latest?.error || "已更新，重新讀取失敗");
      setItems(latest.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function get(task) { return items?.find(item => item.task === task); }

  return <section className="auSection">
    <div className="auSectionTitle">社群驗證與每日任務</div>
    {error && <p role="alert">{error}</p>}
    {!items && !error && <p>讀取中…</p>}
    {items && <>
      <div className="task-proof-grid">
        {accountTasks.map(task => {
          const item = get(task);
          const approved = item?.status === "approved";
          return <div className="adminCard task-proof-card" key={task}>
            <strong>{dailyTaskNames[task]}</strong>
            {item?.has_image ? <ProofImage key={item.id} id={item.id} /> : <p>尚未提交截圖</p>}
            <button className={`auMini ${approved ? "on" : ""}`} type="button" disabled={Boolean(busy) || !item?.has_image}
              onClick={() => review(task, !approved, item.id)}>{approved ? "已驗證" : "驗證"}</button>
          </div>;
        })}
      </div>
      <p>會員私訊官方 LINE 後，確認社群任務符合 24 小時規則，再開放領取。</p>
      <div className="task-notifications">
        {socialTasks.map(task => {
          const approved = get(task)?.status === "approved";
          return <div key={task}>
            <span>{dailyTaskNames[task]}</span>
            <button className={`auMini ${approved ? "on" : ""}`} type="button" disabled={Boolean(busy)}
              onClick={() => review(task, !approved)}>{approved ? "已確認" : "確認已滿 24 小時"}</button>
          </div>;
        })}
      </div>
    </>}
  </section>;
}

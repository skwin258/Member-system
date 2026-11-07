import { useEffect, useState } from "react";
import { api } from "../../api";
import { dailyTaskNames } from "../../lib/dailyTasks";
import { formatTaipeiDateTime } from "../../utils/taipeiTime";

export default function AdminTaskNotifications({ onOpenUser }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api.dailyTaskNotifications().then(result => {
      if (!result?.success) throw new Error(result?.error || "讀取通知失敗");
      if (active) setItems(result.items);
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [reload]);

  return <section className="adminCard">
    <button className="ra-btn" type="button" onClick={() => {
      setItems(null);
      setError("");
      setReload(count => count + 1);
    }}>重新讀取</button>
    {error ? <p role="alert">{error}</p> : !items ? <p>讀取通知中…</p> : !items.length ? (
      <p>目前沒有待審核的驗證。</p>
    ) : <ul className="task-notifications">
      {items.map(item => <li key={item.id}>
        <button className="ra-btn" type="button" onClick={() => onOpenUser(item.user_id)}>
          {item.username}{item.admin_nickname && `（${item.admin_nickname}）`}
        </button>
        <span>{dailyTaskNames[item.task]}</span>
        <small>{formatTaipeiDateTime(item.submitted_at)}</small>
      </li>)}
    </ul>}
  </section>;
}

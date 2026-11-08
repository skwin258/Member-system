import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export function useMemberNotifications(enabled, memberId) {
  const [state, setState] = useState({ items: [], unread: 0, error: "" });
  const requestId = useRef(0);
  const refresh = useCallback(async ({ markRead = false, signal } = {}) => {
    if (!enabled) return;
    const id = ++requestId.current;
    try {
      const result = await api.memberNotifications(signal);
      if (id !== requestId.current || signal?.aborted) return;
      if (!result?.success) throw new Error(result?.error);
      setState({ items: result.items, unread: result.unread, error: "" });
      if (markRead && result.unread && result.items.length) {
        const read = await api.readMemberNotifications(result.items[0].id);
        if (!read?.success) throw new Error(read?.error);
        const latest = await api.memberNotifications(signal);
        if (!latest?.success) throw new Error(latest?.error);
        if (id === requestId.current && !signal?.aborted) {
          setState({ items: latest.items, unread: latest.unread, error: "" });
        }
      }
    } catch (error) {
      if (id === requestId.current && !signal?.aborted) {
        setState(previous => ({ ...previous, error: error.message || "暫時無法讀取通知" }));
      }
    }
  }, [enabled, memberId]);

  useEffect(() => {
    setState({ items: [], unread: 0, error: "" });
    if (!enabled) return;
    const controller = new AbortController();
    const load = () => { if (!document.hidden) void refresh({ signal: controller.signal }); };
    load();
    const timer = setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    return () => {
      ++requestId.current;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [enabled, refresh]);

  return { ...state, refresh };
}

const dateFormat = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short",
});

export default function MemberNotifications({ items, error, onClose, onRetry }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="member-notifications" aria-labelledby="member-notifications-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="member-notifications-content">
      <header><h2 id="member-notifications-title">會員通知</h2>
        <button type="button" aria-label="關閉通知" onClick={onClose}>×</button></header>
      {error && <p role="alert">通知暫時無法讀取。 <button type="button" onClick={onRetry}>重試</button></p>}
      {!error && !items.length && <p>目前沒有通知</p>}
      <ul>{items.map(item => <li key={item.id}>
        <p>{item.message}</p>
        <time>{dateFormat.format(new Date(item.created_at.replace(" ", "T") + "Z"))}</time>
      </li>)}</ul>
    </section>
  </dialog>;
}

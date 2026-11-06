import { useEffect, useState } from 'react';
import { clearLineCallback, completeLineCallback, isLineCallback, startLineAuth } from '../lib/lineAuth';

export default function LineAuthCallback({ children }) {
  const [active, setActive] = useState(() => !window.location.pathname.startsWith('/admin') && isLineCallback());
  const [error, setError] = useState('');
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    completeLineCallback().then(() => {
      if (!disposed) window.location.replace(clearLineCallback());
    }).catch(err => { if (!disposed) setError(err.message); });
    return () => { disposed = true; };
  }, [active]);
  if (!active) return children;
  return <main style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, background: '#050d16', color: '#fff', textAlign: 'center' }}>
    <p role={error ? 'alert' : 'status'}>{error || '正在完成 LINE 登入，請稍候…'}</p>
    {error && <>
      <button onClick={() => { startLineAuth().catch(() => setError('暫時無法啟動 LINE 授權，請稍後重試')); }}>重新進行 LINE 授權</button>
      <button onClick={() => { window.history.replaceState(null, '', clearLineCallback()); setActive(false); }}>返回首頁</button>
    </>}
  </main>;
}

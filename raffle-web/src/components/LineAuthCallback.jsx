import { useEffect, useState } from 'react';
import { clearLineCallback, completeLineCallback, isLineCallback } from '../lib/lineAuth';

export default function LineAuthCallback({ children }) {
  const [active, setActive] = useState(() => !window.location.pathname.startsWith('/admin') && isLineCallback());
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let disposed = false;
    completeLineCallback().then(data => {
      // null means LIFF has started a new authorization navigation.
      if (!disposed && data?.success) window.location.replace(clearLineCallback());
    }).catch(err => { if (!disposed) setError(err.message); });
    return () => { disposed = true; };
  }, [active, attempt]);
  if (!active) return children;
  return <main style={{ minHeight: '100dvh', display: 'grid', placeContent: 'center', gap: 16, padding: 24, background: '#050d16', color: '#fff', textAlign: 'center' }}>
    <p role={error ? 'alert' : 'status'}>{error || '正在完成 LINE 登入，請稍候…'}</p>
    {error && <>
      <button onClick={() => { setError(''); setAttempt(value => value + 1); }}>重試</button>
      <button onClick={() => { window.history.replaceState(null, '', clearLineCallback()); setActive(false); }}>返回首頁</button>
    </>}
  </main>;
}

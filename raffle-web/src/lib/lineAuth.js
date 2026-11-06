import { api } from '../api';
import { API_BASE } from '../config';

const MESSAGES = {
  LINE_CONFIG_ERROR: 'LINE 登入設定尚未完成，請聯絡客服',
  LINE_STATE_INVALID: '登入驗證已失效，請在同一個瀏覽器重新進行 LINE 授權',
  LINE_CANCELLED: '已取消 LINE 授權，請重新登入',
  LINE_TOKEN_EXPIRED: 'LINE 授權已失效，請重新進行授權',
  LINE_TOKEN_INVALID: 'LINE 身分驗證未完成，請重新進行授權',
  LINE_PROVIDER_ERROR: 'LINE 服務暫時無法連線，請稍後重新登入',
  LINE_SESSION_INVALID: '登入連線已失效，請在同一個瀏覽器重新登入；若從 Telegram 開啟，請改用 Safari 或 Chrome 完成整個流程',
  LINE_ACCOUNT_DISABLED: '帳號已停用，請聯絡客服',
  LINE_ACCOUNT_LOCKED: '帳號已鎖定，請聯絡客服',
  LINE_REAUTHORIZE: '登入流程已更新，請重新進行 LINE 授權',
};
let callbackPromise;
function authError(code) {
  return Object.assign(new Error(MESSAGES[code] || MESSAGES.LINE_PROVIDER_ERROR), { code });
}
export function isLineCallback() {
  const params = new URL(window.location.href).searchParams;
  return params.has('line_auth') || params.has('sk_line_auth') || params.has('liff.state');
}
export async function startLineAuth(mode = 'login', referralCode = '') {
  // Top-level HTTPS navigation avoids third-party cookies and LIFF token caches.
  // A local preview intentionally completes authentication on the production site.
  const url = new URL('/auth/line/start', API_BASE);
  url.searchParams.set('mode', mode === 'register' ? 'register' : 'login');
  if (/^[a-zA-Z0-9_-]{4,32}$/.test(referralCode)) url.searchParams.set('ref', referralCode);
  try { sessionStorage.removeItem('sk_line_auth_pending'); } catch { /* Server owns auth state. */ }
  window.location.assign(url.href);
  return null;
}
export function completeLineCallback() {
  if (!callbackPromise) {
    const params = new URL(window.location.href).searchParams;
    callbackPromise = (async () => {
      if (params.get('line_auth') === 'error') throw authError(params.get('line_error'));
      if (params.get('line_auth') !== 'complete') throw authError('LINE_REAUTHORIZE');
      let data;
      try { data = await api.lineSession(); }
      catch { throw authError('LINE_PROVIDER_ERROR'); }
      if (!data?.success || !data?.token) throw authError(data?.code || 'LINE_SESSION_INVALID');
      return data;
    })();
  }
  // Never replay the one-time handoff; recovery starts a new authorization.
  return callbackPromise;
}
export function clearLineCallback() {
  try { sessionStorage.removeItem('sk_line_auth_pending'); } catch { /* Storage may be unavailable. */ }
  const url = new URL(window.location.href);
  ['line_auth', 'line_error', 'sk_line_auth', 'sk_line_ref', 'liff.state', 'code', 'state', 'error', 'error_description', 'liffClientId', 'liffRedirectUri'].forEach(key => url.searchParams.delete(key));
  if (/access_token=|id_token=/.test(url.hash)) url.hash = '';
  return url.pathname + url.search + url.hash;
}

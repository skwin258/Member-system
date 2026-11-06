import { api } from '../api';
import { LINE_LIFF_ID } from '../config';

const PENDING_KEY = 'sk_line_auth_pending';
const MAX_AGE = 15 * 60 * 1000;
let initPromise;
let callbackPromise;

export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function readPending() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    return value && Date.now() - value.createdAt < MAX_AGE ? value : null;
  } catch { return null; }
}

function callbackParams() {
  const url = new URL(window.location.href);
  const state = url.searchParams.get('liff.state');
  if (state) {
    try {
      const nested = new URL(state, url.origin);
      if (nested.searchParams.has('sk_line_auth')) return nested.searchParams;
    } catch { /* Use the direct callback parameters. */ }
  }
  return url.searchParams;
}

export function isLineCallback() {
  const url = new URL(window.location.href);
  return callbackParams().has('sk_line_auth') || url.searchParams.has('liff.state') ||
    (Boolean(readPending()) && (url.searchParams.has('code') || url.searchParams.has('error')));
}

async function loadLineSdk() {
  if (window.liff) return window.liff;
  const script = document.getElementById('line-liff-sdk');
  if (!script) throw new Error('LINE 服務尚未載入，請重新整理後重試');
  let loaded, failed;
  try {
    await withTimeout(new Promise((resolve, reject) => {
      loaded = resolve;
      failed = () => reject(new Error('LINE 服務載入失敗，請檢查網路後重新整理'));
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
    }), 8000, 'LINE 服務載入逾時，請檢查網路後重新整理');
  } finally {
    script.removeEventListener('load', loaded);
    script.removeEventListener('error', failed);
  }
  if (!window.liff) throw new Error('LINE 服務載入失敗，請重新整理後重試');
  return window.liff;
}

async function initLine() {
  if (!initPromise) {
    initPromise = withTimeout(
      loadLineSdk().then(liff => liff.init({ liffId: LINE_LIFF_ID })),
      15000,
      'LINE 授權連線逾時，請重試',
    ).catch(error => { initPromise = null; throw error; });
  }
  await initPromise;
  return window.liff;
}

async function exchangeToken(mode, referralCode, liff) {
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error('未取得 LINE 身分授權，請重新登入並同意授權');
  let data = mode === 'register'
    ? await api.lineRegister({ id_token: idToken, referral_code: referralCode })
    : await api.lineLogin({ id_token: idToken });
  if (mode === 'login' && (data?.code === 'LINE_NOT_REGISTERED' || data?.raw?.code === 'LINE_NOT_REGISTERED')) {
    data = await api.lineRegister({ id_token: idToken, referral_code: referralCode });
  }
  if (!data?.success || !data?.token) throw new Error(data?.error || 'LINE 登入失敗，請重試');
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* URL also carries the intent. */ }
  return data;
}

export async function startLineAuth(mode = 'login', referralCode = '') {
  const liff = await initLine();
  if (liff.isLoggedIn()) return exchangeToken(mode, referralCode, liff);
  const redirect = new URL(window.location.href);
  redirect.searchParams.set('sk_line_auth', mode);
  if (referralCode) redirect.searchParams.set('sk_line_ref', referralCode);
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ mode, referralCode, createdAt: Date.now() }));
  } catch { /* Keep intent in the callback URL when storage is unavailable. */ }
  liff.login({ redirectUri: redirect.href });
  return null;
}

export function completeLineCallback() {
  if (!callbackPromise) {
    // Read before init: LIFF can rewrite the callback URL during initialization.
    const params = callbackParams();
    const pending = readPending();
    const mode = params.get('sk_line_auth') || pending?.mode || 'login';
    const referral = params.get('sk_line_ref') || pending?.referralCode || '';
    callbackPromise = (async () => {
      const liff = await initLine();
      if (!liff.isLoggedIn()) throw new Error('LINE 授權未完成或已取消，請返回首頁重新登入');
      return exchangeToken(mode, referral, liff);
    })().catch(error => { callbackPromise = null; throw error; });
  }
  return callbackPromise;
}

export function clearLineCallback() {
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* No storage available. */ }
  const url = new URL(window.location.href);
  ['sk_line_auth', 'sk_line_ref', 'liff.state', 'code', 'state', 'error', 'error_description', 'liffClientId', 'liffRedirectUri'].forEach(key => url.searchParams.delete(key));
  if (/access_token=|id_token=/.test(url.hash)) url.hash = '';
  return url.pathname + url.search + url.hash;
}

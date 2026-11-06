// LINE tokens and the channel secret are used only inside the Worker.
const FLOW_COOKIE = '__Host-sk_line_browser';
const HANDOFF_COOKIE = '__Host-sk_line_handoff';
const PATHS = new Set(['/auth/line/start', '/auth/line/callback', '/auth/line/session']);
const enc = new TextEncoder();

export const LINE_MESSAGES = {
  LINE_CONFIG_ERROR: 'LINE 登入設定尚未完成，請聯絡客服',
  LINE_STATE_INVALID: '登入驗證已失效，請在同一個瀏覽器重新進行 LINE 授權',
  LINE_CANCELLED: '已取消 LINE 授權，請重新登入',
  LINE_TOKEN_EXPIRED: 'LINE 授權已失效，請重新進行授權',
  LINE_TOKEN_INVALID: 'LINE 身分驗證未完成，請重新進行授權',
  LINE_PROVIDER_ERROR: 'LINE 服務暫時無法連線，請稍後重新登入',
  LINE_SESSION_INVALID: '登入連線已失效，請在同一個瀏覽器重新登入',
  LINE_ACCOUNT_DISABLED: '帳號已停用，請聯絡客服',
  LINE_ACCOUNT_LOCKED: '帳號已鎖定，請聯絡客服',
};

function failure(code) { return Object.assign(new Error(LINE_MESSAGES[code]), { code }); }
function random() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
}
async function hash(value) { return Array.from(await digest(value), b => b.toString(16).padStart(2, '0')).join(''); }
async function challenge(value) { return btoa(String.fromCharCode(...await digest(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map(item => {
    const i = item.indexOf('=');
    return i < 0 ? ['', ''] : [item.slice(0, i).trim(), item.slice(i + 1).trim()];
  }));
}
function cookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`; }
function secureHeaders(extra = {}) { return { 'Cache-Control': 'no-store', 'Pragma': 'no-cache', 'Referrer-Policy': 'no-referrer', ...extra }; }
function redirect(location, setCookies = []) {
  const headers = new Headers(secureHeaders({ Location: location }));
  for (const value of setCookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}
function config(env) {
  const clientId = String(env.LINE_LOGIN_CHANNEL_ID || '').trim();
  const secret = String(env.LINE_LOGIN_CHANNEL_SECRET || '').trim();
  const redirectUri = String(env.LINE_LOGIN_REDIRECT_URI || 'https://api.skclub.vip/auth/line/callback');
  const frontend = String(env.LINE_LOGIN_FRONTEND_URL || 'https://skclub.vip/');
  // These must be server configuration, never request parameters.
  if (!/^\d+$/.test(clientId) || !secret || redirectUri !== 'https://api.skclub.vip/auth/line/callback' || frontend !== 'https://skclub.vip/') {
    throw failure('LINE_CONFIG_ERROR');
  }
  return { clientId, secret, redirectUri, frontend, origin: new URL(frontend).origin };
}

async function ensureFlows(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS line_oauth_flows (
    token_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, kind TEXT NOT NULL,
    payload TEXT NOT NULL, expires_at INTEGER NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_line_oauth_expiry ON line_oauth_flows(expires_at)').run();
  await db.prepare('DELETE FROM line_oauth_flows WHERE expires_at <= ?').bind(Date.now()).run();
}
async function saveFlow(db, token, browser, kind, payload, ttl) {
  await db.prepare('INSERT INTO line_oauth_flows (token_hash,browser_hash,kind,payload,expires_at) VALUES (?,?,?,?,?)')
    .bind(await hash(token), await hash(browser), kind, JSON.stringify(payload), Date.now() + ttl).run();
}
async function takeFlow(db, token, browser, kind) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || !/^[a-f0-9]{64}$/.test(browser || '')) return null;
  // Atomic consume prevents callback replay and double session creation across isolates.
  const row = await db.prepare('DELETE FROM line_oauth_flows WHERE token_hash=? AND browser_hash=? AND kind=? AND expires_at>? RETURNING payload')
    .bind(await hash(token), await hash(browser), kind, Date.now()).first();
  return row ? JSON.parse(row.payload) : null;
}

async function linePost(path, params, fetcher) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetcher(`https://api.line.me/oauth2/v2.1/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      if (path === 'verify' && /expired/i.test(String(data?.error_description || ''))) throw failure('LINE_TOKEN_EXPIRED');
      throw failure(response.status >= 500 || response.status === 429 ? 'LINE_PROVIDER_ERROR' : 'LINE_TOKEN_INVALID');
    }
    return data;
  } catch (error) {
    if (error.code && LINE_MESSAGES[error.code]) throw error;
    throw failure('LINE_PROVIDER_ERROR');
  } finally { clearTimeout(timer); }
}

export async function verifyLineToken(token, { clientId, nonce }, fetcher = fetch) {
  const params = { id_token: token, client_id: clientId };
  if (nonce) params.nonce = nonce;
  // LINE's verification endpoint validates the JWT signature, issuer, audience,
  // expiration and supplied nonce; do not trust a locally decoded JWT payload.
  const claims = await linePost('verify', params, fetcher);
  if (claims.iss !== 'https://access.line.me' || claims.aud !== clientId || !claims.sub ||
      !Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000) ||
      !Number.isFinite(claims.iat) || claims.iat > Math.floor(Date.now() / 1000) + 60 ||
      (nonce && claims.nonce !== nonce)) throw failure('LINE_TOKEN_INVALID');
  return { ok: true, lineUser: { sub: String(claims.sub), name: String(claims.name || 'LINE會員'), picture: String(claims.picture || ''), email: String(claims.email || '') } };
}

export function isLineOAuthRoute(path) { return PATHS.has(path); }

export async function handleLineOAuth(request, env, db, signIn, fetcher = fetch) {
  const url = new URL(request.url);
  if (!PATHS.has(url.pathname)) return null;
  const frontend = 'https://skclub.vip/';
  const isSession = url.pathname === '/auth/line/session';
  const origin = request.headers.get('Origin');
  const json = (data, status = 200, extra = {}) => Response.json(data, {
    status, headers: secureHeaders({
      ...(origin === 'https://skclub.vip' ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}),
      ...extra,
    }),
  });
  if (request.method === 'OPTIONS') {
    if (origin !== 'https://skclub.vip') return json({ success: false }, 403);
    return new Response(null, { status: 204, headers: secureHeaders({
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin',
    }) });
  }
  if ((isSession && request.method !== 'POST') || (!isSession && request.method !== 'GET')) return json({ success: false }, 405);
  if (isSession && origin !== 'https://skclub.vip') return json({ success: false, code: 'LINE_STATE_INVALID', error: LINE_MESSAGES.LINE_STATE_INVALID }, 403);
  try {
    const cfg = config(env);
    if (new URL(request.url).origin !== new URL(cfg.redirectUri).origin) throw failure('LINE_CONFIG_ERROR');
    await ensureFlows(db);
    const jar = cookies(request);
    if (url.pathname === '/auth/line/start') {
      const state = random(), browser = random(), nonce = random(), verifier = random();
      const mode = url.searchParams.get('mode') === 'register' ? 'register' : 'login';
      const ref = url.searchParams.get('ref') || '';
      const referral = /^[a-zA-Z0-9_-]{4,32}$/.test(ref) ? ref : '';
      await saveFlow(db, state, browser, 'state', { mode, referral, nonce, verifier }, 10 * 60 * 1000);
      const authorization = new URL('https://access.line.me/oauth2/v2.1/authorize');
      authorization.search = new URLSearchParams({ response_type: 'code', client_id: cfg.clientId,
        redirect_uri: cfg.redirectUri, state, scope: 'openid profile', nonce, disable_auto_login: 'true',
        code_challenge: await challenge(verifier), code_challenge_method: 'S256',
      }).toString();
      return redirect(authorization.href, [cookie(FLOW_COOKIE, browser, 600), cookie(HANDOFF_COOKIE, '', 0)]);
    }
    if (isSession) {
      const session = await takeFlow(db, jar[HANDOFF_COOKIE], jar[FLOW_COOKIE], 'session');
      if (!session) throw failure('LINE_SESSION_INVALID');
      const headers = new Headers(secureHeaders({ 'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': cfg.origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }));
      headers.append('Set-Cookie', cookie(HANDOFF_COOKIE, '', 0));
      headers.append('Set-Cookie', cookie(FLOW_COOKIE, '', 0));
      // Only the website's own session is sent to the frontend, never LINE tokens.
      return new Response(JSON.stringify(session), { headers });
    }
    const state = await takeFlow(db, url.searchParams.get('state'), jar[FLOW_COOKIE], 'state');
    if (!state) throw failure('LINE_STATE_INVALID');
    if (url.searchParams.has('error')) throw failure('LINE_CANCELLED');
    const code = url.searchParams.get('code');
    if (!code || code.length > 2048) throw failure('LINE_TOKEN_INVALID');
    const tokens = await linePost('token', { grant_type: 'authorization_code', code,
      redirect_uri: cfg.redirectUri, client_id: cfg.clientId, client_secret: cfg.secret, code_verifier: state.verifier }, fetcher);
    if (!tokens.id_token) throw failure('LINE_TOKEN_INVALID');
    const verified = await verifyLineToken(tokens.id_token, { clientId: cfg.clientId, nonce: state.nonce }, fetcher);
    const response = await signIn(verified, state.referral);
    const session = await response.json();
    if (!response.ok || !session?.success || !session?.token) {
      if (session?.error === '帳號已停用') throw failure('LINE_ACCOUNT_DISABLED');
      if (session?.error === '帳號已鎖定') throw failure('LINE_ACCOUNT_LOCKED');
      throw failure('LINE_PROVIDER_ERROR');
    }
    const handoff = random();
    await saveFlow(db, handoff, jar[FLOW_COOKIE], 'session', session, 60000);
    return redirect(`${cfg.frontend}?line_auth=complete`, [cookie(HANDOFF_COOKIE, handoff, 60)]);
  } catch (error) {
    const code = LINE_MESSAGES[error.code] ? error.code : 'LINE_PROVIDER_ERROR';
    if (isSession) return json({ success: false, code, error: LINE_MESSAGES[code] }, 401, { 'Set-Cookie': cookie(HANDOFF_COOKIE, '', 0) });
    return redirect(`${frontend}?line_auth=error&line_error=${code}`, [cookie(HANDOFF_COOKIE, '', 0)]);
  }
}

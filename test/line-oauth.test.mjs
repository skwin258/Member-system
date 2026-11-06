import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { handleLineOAuth, verifyLineToken } from '../src/line-oauth.js';
import worker from '../src/index.js';

const env = { LINE_LOGIN_CHANNEL_ID: '2010170588', LINE_LOGIN_CHANNEL_SECRET: 'test-secret-not-real' };
const api = 'https://api.skclub.vip';
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = { prepare(sql) {
    const statement = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
      async first() { return statement.get(...values) || null; },
      async all() { return { results: statement.all(...values) }; },
    };
  } };
  return { db, sqlite };
}
function cookieHeader(response, original = '') {
  const map = new Map(original.split(';').filter(Boolean).map(s => s.trim().split('=')));
  for (const value of response.headers.getSetCookie()) { const [name, content] = value.split(';')[0].split('='); map.set(name, content); }
  return [...map].map(([k,v]) => `${k}=${v}`).join('; ');
}
async function start(db, cookie = '') {
  const response = await handleLineOAuth(new Request(`${api}/auth/line/start?mode=register&ref=friend123`, { headers: { Cookie: cookie } }), env, db, null);
  return { response, url: new URL(response.headers.get('Location')), cookie: cookieHeader(response) };
}
function provider(nonce, change = {}, reject = null) {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: Object.fromEntries(options.body) });
    if (url.endsWith('/token')) return Response.json({ access_token: 'line-access-never-client', id_token: 'line-id-never-client' });
    if (reject) return Response.json({ error: 'invalid_request', error_description: reject }, { status: 400 });
    return Response.json({ iss: 'https://access.line.me', aud: env.LINE_LOGIN_CHANNEL_ID, sub: 'Uexisting', exp: Math.floor(Date.now()/1000)+300, iat: Math.floor(Date.now()/1000), nonce, name: 'Existing member', ...change });
  };
  return { fetcher, calls };
}
async function callback(db, flow, fetcher, signIn = async () => Response.json({ success: true, token: 'website-session', user: { id: 7 } })) {
  return handleLineOAuth(new Request(`${api}/auth/line/callback?code=fresh-code&state=${flow.url.searchParams.get('state')}`, { headers: { Cookie: flow.cookie } }), env, db, signIn, fetcher);
}

test('authorization has exact fixed callback, cryptographic state, nonce, scope and PKCE; no secret', async () => {
  const { db, sqlite } = database();
  try {
    const flow = await start(db);
    assert.equal(flow.response.status, 303);
    const p = flow.url.searchParams;
    assert.equal(flow.url.origin, 'https://access.line.me');
    assert.equal(p.get('response_type'), 'code');
    assert.equal(p.get('client_id'), env.LINE_LOGIN_CHANNEL_ID);
    assert.equal(p.get('redirect_uri'), api + '/auth/line/callback');
    assert.equal(p.get('scope'), 'openid profile');
    assert.match(p.get('state'), /^[a-f0-9]{64}$/);
    assert.match(p.get('nonce'), /^[a-f0-9]{64}$/);
    assert.equal(p.get('code_challenge_method'), 'S256');
    assert.equal(p.get('disable_auto_login'), 'true');
    assert.equal(p.get('client_secret'), null);
    assert.ok(!flow.response.headers.get('Location').includes(env.LINE_LOGIN_CHANNEL_SECRET));
    assert.match(flow.response.headers.getSetCookie()[0], /HttpOnly; Secure; SameSite=Lax/);
  } finally { sqlite.close(); }
});

test('full authorization code exchange uses same redirect URI, backend secret, PKCE and nonce; session handoff is one-time', async () => {
  const { db, sqlite } = database();
  try {
    const flow = await start(db), service = provider(flow.url.searchParams.get('nonce'));
    let count = 0;
    const response = await callback(db, flow, service.fetcher, async (verified, referral) => {
      count++; assert.equal(verified.lineUser.sub, 'Uexisting'); assert.equal(referral, 'friend123');
      return Response.json({ success: true, token: 'website-session' });
    });
    assert.equal(response.headers.get('Location'), 'https://skclub.vip/?line_auth=complete');
    assert.equal(count, 1);
    assert.equal(service.calls[0].body.client_secret, env.LINE_LOGIN_CHANNEL_SECRET);
    assert.equal(service.calls[0].body.redirect_uri, flow.url.searchParams.get('redirect_uri'));
    assert.match(service.calls[0].body.code_verifier, /^[a-f0-9]{64}$/);
    assert.equal(service.calls[1].body.nonce, flow.url.searchParams.get('nonce'));
    const publicOutput = JSON.stringify([...response.headers]) + await response.text();
    assert.ok(!publicOutput.includes('line-id-never-client'));
    assert.ok(!publicOutput.includes('line-access-never-client'));
    assert.ok(!publicOutput.includes('website-session'));
    const jar = cookieHeader(response, flow.cookie);
    const sessionRequest = () => new Request(api + '/auth/line/session', { method: 'POST', headers: { Origin: 'https://skclub.vip', Cookie: jar } });
    const session = await handleLineOAuth(sessionRequest(), env, db, null);
    assert.equal((await session.json()).token, 'website-session');
    assert.equal(session.headers.get('Access-Control-Allow-Origin'), 'https://skclub.vip');
    assert.equal(session.headers.get('Access-Control-Allow-Credentials'), 'true');
    assert.equal(session.headers.get('Cache-Control'), 'no-store');
    const replay = await handleLineOAuth(sessionRequest(), env, db, null);
    assert.equal((await replay.json()).code, 'LINE_SESSION_INVALID');
    const duplicate = await callback(db, flow, service.fetcher);
    assert.ok(duplicate.headers.get('Location').includes('LINE_STATE_INVALID'));
    assert.equal(service.calls.length, 2);
  } finally { sqlite.close(); }
});

test('rejects missing/wrong browser cookie, changed state, expired state and cross-origin handoff', async () => {
  const { db, sqlite } = database();
  try {
    const flow = await start(db), service = provider(flow.url.searchParams.get('nonce'));
    for (const broken of [{ ...flow, cookie: '' }, { ...flow, cookie: '__Host-sk_line_browser=' + 'b'.repeat(64) }, { ...flow, url: new URL('https://access.line.me/?state=' + 'c'.repeat(64)) }]) {
      assert.ok((await callback(db, broken, service.fetcher)).headers.get('Location').includes('LINE_STATE_INVALID'));
    }
    sqlite.exec('UPDATE line_oauth_flows SET expires_at=0');
    assert.ok((await callback(db, flow, service.fetcher)).headers.get('Location').includes('LINE_STATE_INVALID'));
    assert.equal(service.calls.length, 0);
    const cross = await handleLineOAuth(new Request(api + '/auth/line/session', { method: 'POST', headers: { Origin: 'https://evil.example' } }), env, db, null);
    assert.equal(cross.status, 403);
    assert.equal(cross.headers.get('Access-Control-Allow-Origin'), null);
  } finally { sqlite.close(); }
});

test('rejected signatures, issuer/audience/expiry/nonce mismatch never create a member session', async () => {
  for (const change of [{ iss: 'https://attacker.example' }, { aud: 'wrong-channel' }, { exp: 1 }, { nonce: 'wrong-nonce' }, { iat: Math.floor(Date.now()/1000)+500 }]) {
    const service = provider('expected', change);
    await assert.rejects(verifyLineToken('server-only-token', { clientId: env.LINE_LOGIN_CHANNEL_ID, nonce: 'expected' }, service.fetcher), { code: 'LINE_TOKEN_INVALID' });
  }
  const invalid = provider('expected', {}, 'Invalid IdToken.');
  await assert.rejects(verifyLineToken('invalid-signature', { clientId: env.LINE_LOGIN_CHANNEL_ID, nonce: 'expected' }, invalid.fetcher), { code: 'LINE_TOKEN_INVALID' });
});

test('provider expired token is sanitized, then a new authorization gets a fresh state', async () => {
  const { db, sqlite } = database();
  try {
    const flow = await start(db), service = provider(flow.url.searchParams.get('nonce'), {}, 'IdToken expired.');
    let signedIn = false;
    const response = await callback(db, flow, service.fetcher, () => { signedIn = true; });
    assert.equal(signedIn, false);
    assert.ok(response.headers.get('Location').includes('LINE_TOKEN_EXPIRED'));
    assert.ok(!response.headers.get('Location').includes('IdToken'));
    const next = await start(db);
    assert.notEqual(next.url.searchParams.get('state'), flow.url.searchParams.get('state'));
  } finally { sqlite.close(); }
});

test('cancelled authorization, missing secret and locked accounts return friendly codes', async () => {
  const { db, sqlite } = database();
  try {
    const flow = await start(db);
    const cancelled = await handleLineOAuth(new Request(`${api}/auth/line/callback?error=access_denied&state=${flow.url.searchParams.get('state')}`, { headers: { Cookie: flow.cookie } }), env, db, null);
    assert.ok(cancelled.headers.get('Location').includes('LINE_CANCELLED'));
    const unconfigured = await handleLineOAuth(new Request(api + '/auth/line/start'), { LINE_LOGIN_CHANNEL_ID: env.LINE_LOGIN_CHANNEL_ID }, db, null);
    assert.ok(unconfigured.headers.get('Location').includes('LINE_CONFIG_ERROR'));
    const next = await start(db), service = provider(next.url.searchParams.get('nonce'));
    const locked = await callback(db, next, service.fetcher, async () => Response.json({ success: false, error: '帳號已鎖定' }, { status: 403 }));
    assert.ok(locked.headers.get('Location').includes('LINE_ACCOUNT_LOCKED'));
  } finally { sqlite.close(); }
});

test('Worker CORS preflight is credentialed only for the production site, and cached LIFF clients cannot submit tokens', async () => {
  const preflight = await worker.fetch(new Request(api + '/auth/line/session', { method: 'OPTIONS', headers: { Origin: 'https://skclub.vip' } }), {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
  const legacyPreflight = await worker.fetch(new Request(api + '/auth/line/login', { method: 'OPTIONS', headers: { Origin: 'https://skclub.vip' } }), {});
  assert.equal(legacyPreflight.status, 204);
  const legacy = await worker.fetch(new Request(api + '/auth/line/login', { method: 'POST' }), {});
  assert.equal(legacy.status, 410);
  assert.equal((await legacy.json()).code, 'LINE_REAUTHORIZE');
});

test('Worker integration preserves existing member identity and balances, registers a new member, and keeps referral binding', async () => {
  const { db, sqlite } = database();
  const originalFetch = globalThis.fetch;
  try {
    const workerEnv = { ...env, raffle_db: db };
    const first = await worker.fetch(new Request(api + '/auth/line/start'), workerEnv);
    assert.equal(first.status, 303);
    assert.ok(first.headers.get('Location').startsWith('https://access.line.me/'));
    // Start must not run the full application's cold-start migrations.
    assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(), undefined);
    await worker.fetch(new Request(api + '/'), workerEnv);
    sqlite.prepare("INSERT INTO users (username,password,display_name,line_user_id,enabled,locked,welfare_balance,discount_balance,s_balance) VALUES (?,?,?,?,?,?,?,?,?)")
      .run('existing-member', 'unchanged-password', 'Original name', 'Uexisting', 1, 0, 100, 200, 300);
    const member = sqlite.prepare("SELECT * FROM users WHERE username='existing-member'").get();
    sqlite.prepare("INSERT INTO referral_codes (user_id,code,created_at) VALUES (?,?,datetime('now'))").run(member.id, 'friend123');
    const flow = { url: new URL(first.headers.get('Location')), cookie: cookieHeader(first) };
    globalThis.fetch = provider(flow.url.searchParams.get('nonce')).fetcher;
    const result = await worker.fetch(new Request(`${api}/auth/line/callback?code=test-code&state=${flow.url.searchParams.get('state')}`, { headers: { Cookie: flow.cookie } }), workerEnv);
    assert.equal(result.headers.get('Location'), 'https://skclub.vip/?line_auth=complete');
    const preserved = sqlite.prepare('SELECT * FROM users WHERE id=?').get(member.id);
    assert.equal(preserved.username, 'existing-member');
    assert.equal(preserved.password, 'unchanged-password');
    assert.equal(preserved.display_name, 'Original name');
    assert.equal(preserved.welfare_balance, 100);
    assert.equal(preserved.discount_balance, 200);
    assert.equal(preserved.s_balance, 300);
    const nextStart = await worker.fetch(new Request(api + '/auth/line/start?mode=register&ref=friend123'), workerEnv);
    const next = { url: new URL(nextStart.headers.get('Location')), cookie: cookieHeader(nextStart) };
    globalThis.fetch = provider(next.url.searchParams.get('nonce'), { sub: 'Unewmember' }).fetcher;
    const registered = await worker.fetch(new Request(`${api}/auth/line/callback?code=new-code&state=${next.url.searchParams.get('state')}`, { headers: { Cookie: next.cookie } }), workerEnv);
    assert.equal(registered.headers.get('Location'), 'https://skclub.vip/?line_auth=complete');
    const created = sqlite.prepare("SELECT * FROM users WHERE line_user_id='Unewmember'").get();
    assert.ok(created);
    assert.equal(created.line_verified, 1);
    const referral = sqlite.prepare('SELECT * FROM referrals WHERE referred_user_id=?').get(created.id);
    assert.equal(referral.referrer_user_id, member.id);
    assert.equal(sqlite.prepare('SELECT count(*) AS total FROM users').get().total, 2);
    assert.equal(sqlite.prepare('SELECT count(*) AS total FROM user_sessions').get().total, 2);
  } finally { globalThis.fetch = originalFetch; sqlite.close(); }
});

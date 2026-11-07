import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { arcadeChallengePage, verifyArcadePreparation } from '../src/arcade-verification.js';

let instance = 0;
async function isolate() { return (await import(`../src/index.js?bootstrap-test=${++instance}`)).default; }
function database() {
  const sqlite = new DatabaseSync(':memory:');
  const queries = [];
  let fail;
  const db = { prepare(sql) {
    queries.push(sql);
    if (fail?.(sql)) throw new Error('D1 temporarily unavailable');
    const stmt = sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      async run() { const value = stmt.run(...values); return { success: true, meta: { changes: Number(value.changes), last_row_id: Number(value.lastInsertRowid) } }; },
      async first() { return stmt.get(...values) || null; },
      async all() { return { results: stmt.all(...values) }; },
    };
  } };
  return { sqlite, queries, db, setFailure(value) { fail = value; } };
}
const request = () => new Request('https://api.skclub.vip/activities');

test('home banner overrides are public, while changes and image uploads require admin access', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const env = { raffle_db: db, RAFFLE_R2: { async put(key, stream) {
      assert.match(key, /^banner\/.+\.png$/);
      await new Response(stream).arrayBuffer();
    } } };
    const call = (path, method = 'GET', body, authorized = false) => worker.fetch(new Request('https://api.skclub.vip' + path, {
      method,
      headers: {
        ...(authorized ? { Authorization: 'Bearer banner-admin' } : {}),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }), env);
    assert.deepEqual((await (await call('/home/banners')).json()).items, []);
    sqlite.exec("INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('banner-admin',1,'owner','admin')");
    const path = '/admin/home/banners/2';
    assert.equal((await call(path, 'PATCH', { link_url:'/welcome' })).status, 401);
    assert.equal((await call(path, 'PATCH', { link_url:'javascript:alert(1)' }, true)).status, 400);
    assert.equal((await call(path, 'PATCH', { link_url:'/\\example.com' }, true)).status, 400);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([137,80,78,71])], { type:'image/png' }), 'banner.png');
    assert.equal((await call('/admin/home/banners/upload', 'POST', form)).status, 401);
    const { url } = await (await call('/admin/home/banners/upload', 'POST', form, true)).json();
    assert.match(url, /^\/r2\/banner\//);
    const saved = await (await call(path, 'PATCH', { image_url:url, link_url:'https://example.com/activity' }, true)).json();
    assert.deepEqual(saved.item, { slot:2, image_url:url, link_url:'https://example.com/activity', deleted:false });
    assert.equal((await call(path, 'PATCH', { link_url:'  ' }, true)).status, 200);
    assert.deepEqual((await (await call('/home/banners')).json()).items, [{ slot:2, image_url:url, link_url:'', deleted:false }]);
    assert.equal((await call('/admin/home/banners/1', 'DELETE')).status, 401);
    for (const slot of [1, 2]) {
      const removed = await call('/admin/home/banners/' + slot, 'DELETE', undefined, true);
      assert.deepEqual((await removed.json()).item, { slot, deleted:true, link_url:'' });
    }
    const deleted = (await (await call('/home/banners')).json()).items;
    assert.deepEqual(deleted.sort((a,b) => a.slot-b.slot), [
      { slot:1, deleted:true, link_url:'' }, { slot:2, deleted:true, link_url:'' },
    ]);
    const restored = await call('/admin/home/banners/1', 'PATCH', { image_url:url }, true);
    assert.deepEqual((await restored.json()).item, { slot:1, deleted:false, link_url:'', image_url:url });
  } finally { sqlite.close(); }
});

test('admin shop keeps hidden products editable and batch deletion preserves product records', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const bucket = { async put(key, stream, options) {
      assert.match(key, /^shop\/.+\.png$/);
      assert.equal(options.httpMetadata.contentType, 'image/png');
      assert.ok((await new Response(stream).arrayBuffer()).byteLength);
    } };
    const call = (path, method = 'GET', body) => worker.fetch(new Request('https://api.skclub.vip' + path, {
      method,
      headers: { Authorization: 'Bearer shop-admin', ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }), { raffle_db: db, RAFFLE_R2: bucket });
    await call('/activities');
    sqlite.exec("INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('shop-admin',1,'owner','admin')");
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type: 'image/png' }), 'photo.png');
    const { url } = await (await call('/admin/shop/upload', 'POST', form)).json();
    assert.match(url, /^\/r2\/shop\/.+\.png$/);
    assert.equal((await call('/admin/shop/products', 'POST', { id:'a', name:'A', category:'現金', enabled:0, image_url:url })).status, 200);
    assert.equal((await call('/admin/shop/products/a', 'PATCH', { reward_discount:14, reward_welfare:8 })).status, 200);
    assert.equal((await call('/admin/shop/products', 'POST', { id:'b', name:'B', category:'現金' })).status, 200);
    const { items } = await (await call('/admin/shop/products')).json();
    const hidden = items.find(item => item.id === 'a');
    assert.deepEqual([hidden.enabled, hidden.reward_discount, hidden.reward_welfare, hidden.image_url], [0,14,8,url]);
    assert.equal((await (await call('/admin/shop/products/batch-delete', 'POST', { ids:['a','b','a'] })).json()).deleted, 2);
    assert.equal((await (await call('/admin/shop/products/batch-delete', 'POST', { ids:['a','b'] })).json()).deleted, 0);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM shop_products WHERE deleted=1').get().count, 2);
    assert.equal((await (await call('/shop/products')).json()).items.length, 0);
  } finally { sqlite.close(); }
});

test('admin user pagination searches across pages and retains ownership filtering', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    await worker.fetch(request(), { raffle_db: db });
    sqlite.exec(`INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('member-admin',1,'admin','admin');
      INSERT INTO users (id,username,password,display_name,created_by_admin_id) VALUES
        (1,'first','pw','小明',1),(2,'second','pw','小明',1),(3,'third','pw','小明',2),(4,'fourth','pw','小華',1);`);
    const call = async search => {
      const result = await worker.fetch(new Request('https://api.skclub.vip/admin/users' + search, {
        headers: { Authorization: 'Bearer member-admin' },
      }), { raffle_db: db });
      assert.equal(result.status, 200);
      return result.json();
    };
    const page = await call('?limit=1');
    assert.deepEqual(page.items.map(item => item.id), [4]);
    assert.equal(page.next_before, 4);
    assert.deepEqual((await call('?limit=1&before=4')).items.map(item => item.id), [2]);
    const search = await call('?limit=50&q=' + encodeURIComponent('小明'));
    assert.deepEqual(search.items.map(item => item.id), [2,1]);
    assert.equal(search.next_before, null);
    assert.deepEqual((await call('')).items.map(item => item.id), [4,2,1]);
  } finally { sqlite.close(); }
});

test('new Worker isolates skip completed migrations and retain activity and member data', async () => {
  const data = database();
  try {
    const first = await isolate();
    const before = await first.fetch(request(), { raffle_db: data.db });
    assert.equal(before.status, 200);
    const activities = await before.json();
    assert.equal(activities.activities.length, 4);
    assert.equal(data.sqlite.prepare("SELECT COUNT(*) AS count FROM admin_accounts").get().count, 0);
    assert.equal(data.sqlite.prepare("SELECT COUNT(*) AS count FROM admins").get().count, 0);
    const initialQueries = data.queries.length;
    assert.ok(initialQueries > 100);
    data.sqlite.prepare("INSERT INTO users (username,password,display_name,welfare_balance) VALUES ('preserved','same-password','Existing member',123)").run();
    data.queries.length = 0;
    const next = await isolate();
    const after = await next.fetch(request(), { raffle_db: data.db });
    assert.deepEqual(await after.json(), activities);
    assert.equal(data.queries.length, 2);
    assert.ok(data.queries.every(sql => /^SELECT/i.test(sql)));
    const member = data.sqlite.prepare("SELECT * FROM users WHERE username='preserved'").get();
    assert.equal(member.password, 'same-password');
    assert.equal(member.welfare_balance, 123);
    console.log(`First initialization: ${initialQueries} queries; new isolate with completed schema: ${data.queries.length} queries.`);
  } finally { data.sqlite.close(); }
});

test('a schema version change reruns initialization, then marks the completed version', async () => {
  const data = database();
  try {
    await (await isolate()).fetch(request(), { raffle_db: data.db });
    data.sqlite.exec("UPDATE app_schema_state SET value='older-version'");
    data.queries.length = 0;
    const response = await (await isolate()).fetch(request(), { raffle_db: data.db });
    assert.equal(response.status, 200);
    assert.ok(data.queries.length > 100);
    assert.equal(data.sqlite.prepare("SELECT value FROM app_schema_state WHERE key='schema_version'").get().value, '2026-11-07.admin-shop-v5');
  } finally { data.sqlite.close(); }
});

test('existing arcade databases only run the additive shop upgrade', async () => {
  const data = database();
  try {
    await (await isolate()).fetch(request(), { raffle_db: data.db });
    data.sqlite.exec(`INSERT INTO shop_products (id,name,reward_welfare) VALUES ('saved','Existing',25);
      ALTER TABLE shop_products DROP COLUMN reward_discount;
      UPDATE app_schema_state SET value='2026-11-07.arcade-v4';`);
    data.queries.length = 0;
    const response = await (await isolate()).fetch(request(), { raffle_db: data.db });
    assert.equal(response.status, 200);
    assert.ok(data.queries.length < 10);
    const row = data.sqlite.prepare("SELECT reward_discount,reward_welfare FROM shop_products WHERE id='saved'").get();
    assert.deepEqual([row.reward_discount, row.reward_welfare], [0,25]);
  } finally { data.sqlite.close(); }
});

test('a transient marker read failure does not run schema changes, and the next request retries', async () => {
  const data = database();
  try {
    await (await isolate()).fetch(request(), { raffle_db: data.db });
    data.queries.length = 0;
    data.setFailure(sql => sql.includes('SELECT value FROM app_schema_state'));
    const worker = await isolate();
    assert.equal((await worker.fetch(request(), { raffle_db: data.db })).status, 500);
    assert.equal(data.queries.length, 1);
    data.setFailure(null);
    assert.equal((await worker.fetch(request(), { raffle_db: data.db })).status, 200);
  } finally { data.sqlite.close(); }
});

test('concurrent first requests share one initialization check per isolate', async () => {
  const data = database();
  try {
    const worker = await isolate();
    const responses = await Promise.all([worker.fetch(request(), { raffle_db: data.db }), worker.fetch(request(), { raffle_db: data.db })]);
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(data.queries.filter(sql => sql.includes('SELECT value FROM app_schema_state')).length, 1);
    assert.equal(data.queries.filter(sql => sql.includes('INSERT INTO app_schema_state')).length, 1);
  } finally { data.sqlite.close(); }
});

test('SC grants and mixed football bets are recorded once, while rewards credit S', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const call = (path, body) => worker.fetch(new Request('https://api.skclub.vip' + path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: 'Bearer sc-user', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }), { raffle_db: db });
    await call('/arcade/settings');
    sqlite.exec(`INSERT INTO users (id, username, password, s_balance) VALUES (1, 'sc-user', 'pw', 100);
      INSERT INTO user_sessions (token, user_id, username) VALUES ('sc-user', 1, 'sc-user');
      UPDATE activities SET enabled=1, start_at=NULL, end_at=NULL WHERE activity_key='football';
      UPDATE football_prizes SET probability=100 WHERE ball_no=1;`);
    const me = await (await call('/me')).json();
    assert.equal(me.user.sc_balance, 3000);
    assert.equal(me.user.sc_claimed_today, true);
    assert.equal((await call('/wallet/sc/claim', {})).status, 409);
    sqlite.exec("UPDATE users SET sc_claim_day=date('now', '+8 hours', '-1 day') WHERE id=1");
    const claims = await Promise.all([call('/wallet/sc/claim', {}), call('/wallet/sc/claim', {})]);
    assert.deepEqual(claims.map(r => r.status).sort(), [200, 409]);

    sqlite.exec('UPDATE users SET sc_balance=150 WHERE id=1');
    const config = await (await call('/football/config')).json();
    assert.deepEqual(config.bet_options, [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    assert.equal((await call('/football/start-shoot', { bet_amount: 150 })).status, 400);
    assert.equal((await call('/football/start-shoot', { bet_amount: 300 })).status, 400);
    const wager = { bet_amount: 200, request_id: 'test-transaction-0001' };
    const started = await Promise.all([call('/football/start-shoot', wager), call('/football/start-shoot', wager)]);
    const [game, retry] = await Promise.all(started.map(r => r.json()));
    assert.equal(game.game_id, retry.game_id);
    assert.deepEqual([game.sc_balance, game.s_balance, game.current_win], [0, 50, 400]);
    const results = await Promise.all([call('/football/claim', { game_id: game.game_id }), call('/football/claim', { game_id: game.game_id })]);
    assert.ok(results.every(response => response.ok));
    const wallet = await (await call('/me')).json();
    assert.deepEqual([wallet.user.sc_balance, wallet.user.s_balance], [0, 450]);
    const logs = sqlite.prepare('SELECT action, delta_sc, delta_s FROM wallet_logs ORDER BY id').all();
    assert.deepEqual(logs.map(r => [r.action, r.delta_sc, r.delta_s]), [
      ['sc_signup', 3000, 0], ['sc_daily', 3000, 0], ['football_start', -150, -50], ['football_claim', 0, 400],
    ]);
  } finally { sqlite.close(); }
});

test('arcade activity rules are validated, admin-only and persisted by section', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const call = (path, { token, patch } = {}) => worker.fetch(new Request('https://api.skclub.vip' + path, {
      method: patch ? 'PATCH' : 'GET',
      headers: { Authorization: `Bearer ${token || 'guest'}`, 'Content-Type': 'application/json' },
      body: patch ? JSON.stringify(patch) : undefined,
    }), { raffle_db: db });
    const first = await (await call('/arcade/settings')).json();
    assert.equal(first.settings.reaction.limit3, 200);
    sqlite.exec("INSERT INTO admin_sessions (token, admin_id, role, username) VALUES ('sc-admin', 1, 'owner', 'admin')");
    const route = '/admin/arcade/settings/reaction';
    assert.equal((await call(route, { patch: { cost: 500 } })).status, 401);
    assert.equal((await call(route, { token: 'sc-admin', patch: { cost: 30 } })).status, 400);
    assert.equal((await call(route, { token: 'sc-admin', patch: { help: '等待火炬點亮', cost: 150 } })).status, 200);
    assert.equal((await call(route, { token: 'sc-admin', patch: { limit3: 220, reward3: 250 } })).status, 200);
    const latest = await (await call('/arcade/settings')).json();
    const { help, cost, limit3, reward3 } = latest.settings.reaction;
    assert.deepEqual([help, cost, limit3, reward3], ['等待火炬點亮', 150, 220, 250]);
  } finally { sqlite.close(); }
});

test('numbers and reaction rounds require single-use proof and settle SC-first exactly once', async t => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const seen = new Set();
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      const { response } = JSON.parse(options.body);
      const success = !seen.has(response);
      seen.add(response);
      return Response.json({ success, hostname: 'api.skclub.vip', action: 'arcade_' + response.split('-')[0] });
    });
    const request = (game, action, body = {}, token = 'arcade-user') => worker.fetch(
      new Request(`https://api.skclub.vip/arcade/${game}/${action}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }), { raffle_db: db, ARCADE_TURNSTILE_SITEKEY: 'test-site-key', ARCADE_TURNSTILE_SECRET: 'test-secret' },
    );
    assert.equal((await request('numbers', 'prepare', {}, 'guest')).status, 401);
    sqlite.exec(`INSERT INTO users (id, username, password, s_balance) VALUES (1, 'arcade-user', 'pw', 100);
      UPDATE users SET sc_balance=50 WHERE id=1;
      INSERT INTO user_sessions (token, user_id, username) VALUES ('arcade-user', 1, 'arcade-user');`);

    assert.equal((await request('numbers', 'prepare')).status, 428);
    assert.equal((await request('numbers', 'prepare', { proof: 'reaction-wrong-game' })).status, 428);
    const numbers = await (await request('numbers', 'prepare', { proof: 'numbers-first' })).json();
    assert.equal(numbers.board.length, 25);
    assert.equal((await request('numbers', 'prepare', { proof: 'numbers-first' })).status, 428);
    const starts = await Promise.all([request('numbers', 'start', { id: numbers.id }), request('numbers', 'start', { id: numbers.id })]);
    for (const start of starts) {
      const result = await start.json();
      assert.deepEqual([result.sc_balance, result.s_balance], [0, 50]);
    }
    assert.equal((await request('numbers', 'finish', { id: numbers.id, moves: [], reward: 100000 })).status, 400);
    const moves = Array.from({ length: numbers.board.length }, (_, i) => numbers.board.indexOf(i + 1));
    const score = await (await request('numbers', 'finish', { id: numbers.id, moves, reward: 100000 })).json();
    assert.deepEqual([score.reward, score.sc_balance, score.s_balance], [1000, 0, 1050]);
    const repeat = await (await request('numbers', 'finish', { id: numbers.id, moves })).json();
    assert.deepEqual(repeat, score);

    sqlite.exec('UPDATE users SET sc_balance=75 WHERE id=1');
    const early = await (await request('reaction', 'prepare', { proof: 'reaction-early' })).json();
    await request('reaction', 'start', { id: early.id });
    const refund = await (await request('reaction', 'finish', { id: early.id, reward: 500 })).json();
    assert.deepEqual([refund.refund, refund.reward, refund.sc_balance, refund.s_balance], [100, 0, 75, 1050]);

    const reaction = await (await request('reaction', 'prepare', { proof: 'reaction-hit' })).json();
    await request('reaction', 'start', { id: reaction.id });
    sqlite.prepare('UPDATE arcade_rounds SET ready_at=? WHERE id=?').run(Date.now() - 1, reaction.id);
    const signal = await (await request('reaction', 'signal', { id: reaction.id })).json();
    assert.ok(signal.signal_token);
    sqlite.prepare('UPDATE arcade_rounds SET armed_at=? WHERE id=?').run(Date.now() - 928, reaction.id);
    const finishReaction = { id: reaction.id, signal_token: signal.signal_token, measured_ms: 195 };
    assert.equal((await request('reaction', 'finish', { ...finishReaction, measured_ms: -1 })).status, 400);
    const reward = await (await request('reaction', 'finish', finishReaction)).json();
    assert.deepEqual([reward.elapsed, reward.reward, reward.sc_balance, reward.s_balance], [195, 200, 0, 1225]);
    assert.deepEqual(await (await request('reaction', 'finish', { ...finishReaction, measured_ms: 1 })).json(), reward);
    for (let i = 3; i < 20; i++) {
      assert.equal((await request('numbers', 'prepare', { proof: 'numbers-limit-' + i })).status, 200);
    }
    assert.equal((await request('reaction', 'prepare', { proof: 'reaction-after-twenty' })).status, 200);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM arcade_rounds").get().n, 21);
  } finally { sqlite.close(); }
});

test('arcade verification widget serves only the configured hostname and never exposes its secret', async () => {
  const env = { ARCADE_TURNSTILE_SITEKEY: 'public-widget-key', ARCADE_TURNSTILE_SECRET: 'private-widget-key' };
  assert.equal(arcadeChallengePage(new URL('https://other.example/arcade/challenge?game=numbers'), env).status, 503);
  assert.equal(arcadeChallengePage(new URL('https://api.skclub.vip/arcade/challenge?game=numbers'), {}).status, 503);
  const widget = arcadeChallengePage(new URL('https://api.skclub.vip/arcade/challenge?game=numbers'), env);
  assert.equal(widget.status, 200);
  const html = await widget.text();
  assert.match(html, /public-widget-key/);
  assert.match(html, /arcade_numbers/);
  assert.doesNotMatch(html, /private-widget-key/);
});

test('arcade can run without a widget, while incomplete widget configuration fails closed', async () => {
  const request = new Request('https://api.skclub.vip/arcade/numbers/prepare');
  assert.equal(await verifyArcadePreparation(request, {}, 'numbers'), null);
  const failure = await verifyArcadePreparation(request, { ARCADE_TURNSTILE_SITEKEY: 'public-widget-key' }, 'numbers');
  assert.equal(failure.status, 503);
});

test('paid claw hides the seed until charged and credits only the verifier result once', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    let replays = 0;
    const verifier = { fetch: async (url, options) => {
      assert.equal(url, 'https://claw-verifier.internal/replay');
      const input = JSON.parse(options.body);
      if (!input.persist) assert.deepEqual(Object.keys(input).sort(), ['moves', 'rules', 'seed']);
      replays++;
      const prizes = input.moves.length ? 1 : 0;
      const count = (input.previous?.machine.toys.length ?? 24) - prizes;
      const checkpoint = input.persist ? { world: 'test-world', machine: { toys: Array(count).fill({}) } } : undefined;
      return Response.json({ prizes, checkpoint });
    } };
    const call = (action, body = {}, active = true) => worker.fetch(new Request(
      'https://api.skclub.vip/arcade/claw/' + action, {
        method: 'POST', headers: { Authorization: 'Bearer claw-user', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ), { raffle_db: db, CLAW_VERIFIER: active ? verifier : undefined });
    await worker.fetch(request(), { raffle_db: db });
    sqlite.exec(`INSERT INTO users (id, username, password, s_balance) VALUES (1, 'claw-user', 'pw', 100);
      UPDATE users SET sc_balance=50 WHERE id=1;
      INSERT INTO user_sessions (token,user_id,username) VALUES ('claw-user',1,'claw-user');`);
    assert.equal((await call('prepare', {}, false)).status, 503);
    const prepared = await (await call('prepare')).json();
    assert.ok(prepared.id && !Object.hasOwn(prepared, 'seed'));
    assert.equal((await call('finish', { id: prepared.id, moves: [] })).status, 400);
    const start = await (await call('start', { id: prepared.id })).json();
    const startRetry = await (await call('start', { id: prepared.id })).json();
    assert.equal(start.seed, startRetry.seed);
    assert.deepEqual([start.sc_balance, start.s_balance], [0, 50]);
    const payload = { id: prepared.id, moves: [[50, 99, -24]], prizes: 500 };
    const result = await (await call('finish', payload)).json();
    assert.deepEqual([result.prizes, result.reward, result.s_balance], [1, 1000, 1050]);
    assert.deepEqual(await (await call('finish', payload)).json(), result);
    assert.equal(replays, 1);
    const miss = await (await call('prepare')).json();
    await call('start', { id: miss.id });
    const missed = await (await call('finish', { id: miss.id, moves: [] })).json();
    assert.deepEqual([missed.prizes, missed.reward, missed.s_balance], [0, 0, 950]);

    const entry = await (await call('prepare', { persistent: true })).json();
    assert.ok(Number.isInteger(entry.seed));
    await call('start', { id: entry.id });
    const picked = await (await call('finish', { id: entry.id, moves: [[50, 99, -24]] })).json();
    assert.equal(picked.checkpoint.machine.toys.length, 23);
    const next = await Promise.all([call('prepare', { previous: entry.id }), call('prepare', { previous: entry.id })]);
    const [first, retry] = await Promise.all(next.map(r => r.json()));
    assert.equal(first.id, retry.id);
    assert.equal(first.seed, entry.seed);
    await call('start', { id: first.id });
    const stayed = await (await call('finish', { id: first.id, moves: [] })).json();
    assert.equal(stayed.checkpoint.machine.toys.length, 23);
    assert.equal((await call('prepare', { previous: entry.id })).status, 409);
    assert.equal(stayed.s_balance, 1750);
  } finally { sqlite.close(); }
});

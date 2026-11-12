import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { pbkdf2Sync } from 'node:crypto';
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
    const stmt = () => sqlite.prepare(sql);
    let values = [];
    return {
      bind(...args) { values = args; return this; },
      execute() { const value = stmt().run(...values); return { success: true, meta: { changes: Number(value.changes), last_row_id: Number(value.lastInsertRowid) } }; },
      async run() { return this.execute(); },
      async first() { return stmt().get(...values) || null; },
      async all() { return { results: stmt().all(...values) }; },
    };
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.execute());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  } };
  return { sqlite, queries, db, setFailure(value) { fail = value; } };
}
const request = () => new Request('https://api.skclub.vip/activities');

test('redpacket uses the configured board, prevents duplicate draws and settles atomically', async () => {
  const { db, sqlite } = database();
  const worker = await isolate();
  const env = { raffle_db: db };
  try {
    await worker.fetch(request(), env);
    sqlite.exec(`INSERT INTO users(id,username,password) VALUES(1,'test-member','test');
      INSERT INTO user_sessions(token,user_id,username) VALUES ('member',1,'test-member');
      INSERT INTO user_activity_usage(user_id,activity_key,times_left) VALUES (1,'redpacket',5);
      INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'owner','fixture','superadmin','active'); INSERT INTO admin_sessions(token,admin_id,role,username) VALUES ('owner',1,'superadmin','owner');
      UPDATE activities SET enabled=1 WHERE activity_key='redpacket';`);
    async function call(path, method = 'GET', body, token = 'member') {
      const response = await worker.fetch(new Request('https://api.skclub.vip' + path, {
        method, headers: { Authorization: 'Bearer ' + token, 'Content-Type':'application/json' },
        body: JSON.stringify(body),
      }), env);
      return { status: response.status, ...await response.json() };
    }
    const configure = (config, pool) => call('/admin/redpacket/config', 'POST', { config, pool }, 'owner');
    const draw = payload => call('/redpacket/draw', 'POST', payload);
    const rules = { count: 2, mode: 'pool', allow_repeat: 0, lock_when_all_opened: 1 };
    assert.equal((await configure(rules, [{ amount:10, prob:1 }])).status, 400);
    assert.equal((await configure(rules, [{ amount:10, prob:1 }, { amount:20, prob:1 }, { amount:99, prob:0 }])).status, 200);
    assert.equal((await call('/redpacket/claim', 'POST')).status, 410);
    const board = await call('/redpacket/config');
    assert.equal(board.count, 2);
    assert.equal(board.left, 5);
    const payload = { board: board.board, slot: 0, request_id: crypto.randomUUID() };
    const same = await Promise.all([draw(payload), draw(payload)]);
    assert.ok(same.every(result => result.success && result.amount === same[0].amount));
    assert.equal((await draw({ ...payload, request_id: crypto.randomUUID() })).status, 409);
    const next = { board: board.board, slot: 1, request_id: crypto.randomUUID() };

    sqlite.exec("CREATE TRIGGER reject_redpacket_log BEFORE INSERT ON wallet_logs WHEN NEW.action='redpacket_draw' BEGIN SELECT RAISE(ABORT, 'test log failure'); END");
    assert.equal((await draw(next)).status, 500);
    const afterFailure = await call('/redpacket/config');
    assert.equal(afterFailure.left, 4);
    assert.deepEqual(afterFailure.opened, [0]);
    assert.equal(sqlite.prepare('SELECT welfare_balance FROM users WHERE id=1').get().welfare_balance, same[0].amount);
    sqlite.exec('DROP TRIGGER reject_redpacket_log');

    const second = await draw(next);
    assert.ok(second.success);
    assert.equal(second.amount + same[0].amount, 30);
    assert.equal(second.left, 3);
    assert.equal(second.used, 2);
    assert.equal(second.locked, true);
    assert.equal((await draw({ ...next, request_id: crypto.randomUUID() })).status, 409);
    assert.equal((await draw(next)).amount, second.amount);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_logs WHERE action='redpacket_draw'").get().n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM draw_records WHERE note='redpacket_draw'").get().n, 2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM winners WHERE activity_key='redpacket'").get().n, 2);

    assert.equal((await configure({ count:3, mode:'fixed', fixed_amount:0, lock_when_all_opened:0 }, [])).status, 200);
    const fresh = await call('/redpacket/config');
    const freshDraws = [0, 1].map(slot => ({ board:fresh.board, slot, request_id:crypto.randomUUID() }));
    const competing = await Promise.all(freshDraws.map(draw));
    assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
    const zero = competing.find(result => result.success);
    assert.equal(zero.amount, 0);
    assert.notEqual(zero.board, fresh.board);
    assert.deepEqual(zero.opened, []);
    assert.equal(zero.left, 2);
    const settledPayload = freshDraws[competing.findIndex(result => result.success)];
    assert.equal((await draw(settledPayload)).left, 2);
    const reopened = await draw({ board:zero.board, slot:settledPayload.slot, request_id:crypto.randomUUID() });
    assert.equal(reopened.left, 1);
    assert.deepEqual(reopened.opened, []);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM winners WHERE activity_key='redpacket'").get().n, 2);
  } finally { sqlite.close(); }
});

test('daily task proofs stay private, approval unlocks one reward, and nicknames stay internal', async (t) => {
  const { db, sqlite } = database();
  const files = new Map();
  let failDelete = false;
  const env = { raffle_db: db, RAFFLE_R2: {
    async put(key, stream, { httpMetadata }) { files.set(key, { body: await new Response(stream).arrayBuffer(), httpMetadata }); },
    async get(key) { return files.get(key); },
    async delete(key) { if (failDelete) throw new Error("temporary R2 outage"); files.delete(key); },
  } };
  try {
    const worker = await isolate();
    await worker.fetch(request(), env);
    sqlite.exec(`INSERT INTO admin_accounts(id,username,password,role,status) VALUES
      (10,'admin','test','admin','active'),(20,'other','test','admin','active');
      INSERT INTO admin_sessions(token,admin_id,role,username) VALUES ('owner',10,'admin','admin'),('other',20,'admin','other');
      INSERT INTO users(id,username,password,created_by_admin_id) VALUES (1,'test-member','test',10);
      INSERT INTO user_sessions(token,user_id,username) VALUES ('member',1,'test-member');`);
    const call = (path, token, method = 'GET', body) => worker.fetch(new Request('https://api.skclub.vip' + path, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body instanceof FormData ? body : JSON.stringify(body),
    }), env);
    assert.equal((await call('/daily-tasks', null)).status, 401);
    assert.equal((await call('/daily-tasks/claim/instagram', 'member', 'POST')).status, 409);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([137,80,78,71,13,10,26,10])], { type:'image/png' }), 'proof.png');
    const submit = await (await call('/daily-tasks/proof/instagram', 'member', 'POST', form)).json();
    assert.equal(submit.tasks.instagram, 'pending');
    const notice = (await (await call('/admin/daily-tasks/notifications', 'owner')).json()).items[0];
    assert.equal(notice.username, 'test-member');
    assert.deepEqual((await (await call('/admin/daily-tasks/notifications', 'other')).json()).items, []);
    const failed = { failed:true, proofId:notice.id };
    failDelete = true;
    const rejected = await Promise.all([1,2].map(() => call('/admin/daily-tasks/users/1/instagram', 'owner', 'PATCH', failed)));
    assert.deepEqual(rejected.map(r=>r.status).sort(), [200,409]);
    assert.equal((await (await call('/daily-tasks','member')).json()).tasks.instagram, 'rejected');
    assert.equal((await call('/admin/daily-tasks/proof/'+notice.id,'owner')).status,404);
    assert.equal(files.size,1);
    failDelete = false;
    await worker.scheduled(null,env);
    assert.equal(files.size,0);
    assert.equal((await call('/daily-tasks/proof/instagram','member','POST',form)).status,200);
    notice.id = (await (await call('/admin/daily-tasks/notifications','owner')).json()).items[0].id;
    const image = '/admin/daily-tasks/proof/' + notice.id;
    assert.equal((await call(image, 'other')).status, 404);
    assert.equal((await call(image, 'owner')).headers.get('cache-control'), 'private, no-store');
    assert.equal((await call('/r2/' + [...files.keys()][0], null)).status, 404);
    assert.equal((await call('/admin/daily-tasks/users/1/instagram', 'other', 'PATCH', { approved:true, proofId:notice.id })).status, 403);
    assert.equal((await call('/admin/daily-tasks/users/1/instagram', 'owner', 'PATCH', { approved:true, proofId:notice.id })).status, 200);
    const repeated = await Promise.all([1, 2].map(() => call('/daily-tasks/claim/instagram', 'member', 'POST')));
    assert.ok(repeated.every(result => result.status === 200));
    const usage = () => sqlite.prepare("SELECT times_left FROM user_activity_usage WHERE user_id=1 AND activity_key='redpacket'").get().times_left;
    assert.equal(usage(), 1);
    const sameDay = await (await call('/daily-tasks', 'member')).json();
    assert.equal(sameDay.progress, 0);
    assert.equal(sameDay.tasks.instagram, 'claimed');
    assert.deepEqual(sameDay.hiddenTasks, []);
    assert.equal((await call('/admin/daily-tasks/users/1/instagram', 'owner', 'PATCH', { approved:false, proofId:notice.id })).status, 200);
    assert.equal((await call('/admin/daily-tasks/users/1/share_post', 'owner', 'PATCH', { approved:true })).status, 200);
    assert.equal((await call('/daily-tasks/claim/share_post', 'member', 'POST')).status, 200);
    // Signup already credits SC, but it does not complete the task check-in.
    assert.equal((await call('/daily-tasks/claim/checkin', 'member', 'POST')).status, 409);
    sqlite.exec("UPDATE users SET sc_claim_day=date('now','+8 hours','-1 day') WHERE id=1");
    const scWallet = () => sqlite.prepare("SELECT sc_balance, sc_claim_day FROM users WHERE id=1").get();
    const beforeCheckin = scWallet();
    const checkins = await Promise.all([1, 2].map(() => call('/daily-tasks/checkin', 'member', 'POST')));
    assert.ok(checkins.every(result => result.status === 200));
    assert.equal((await checkins[0].json()).tasks.checkin, 'approved');
    assert.deepEqual(scWallet(), beforeCheckin);
    assert.equal((await call('/daily-tasks/claim/checkin', 'member', 'POST')).status, 200);
    assert.deepEqual(scWallet(), beforeCheckin);
    assert.equal(usage(), 3);
    assert.equal((await call('/wallet/sc/claim', 'member', 'POST')).status, 200);
    assert.equal(scWallet().sc_balance, beforeCheckin.sc_balance + 3000);
    assert.equal(usage(), 3);
    sqlite.exec(`UPDATE daily_task_claims SET claim_day=date(claim_day,'-1 day') WHERE task='instagram';
      INSERT INTO daily_task_proofs(id,user_id,task,task_day,status)
      VALUES ('threads-proof',1,'threads','','approved');`);
    const nextDay = await (await call('/daily-tasks', 'member')).json();
    assert.equal(nextDay.progress, 2);
    assert.deepEqual(nextDay.hiddenTasks, ['instagram']);
    assert.equal(nextDay.tasks.threads, 'approved');
    const threadsClaim = await (await call('/daily-tasks/claim/threads', 'member', 'POST')).json();
    assert.equal(threadsClaim.progress, 2);
    assert.equal(threadsClaim.tasks.threads, 'claimed');
    assert.deepEqual(threadsClaim.hiddenTasks, ['instagram']);
    sqlite.exec("UPDATE daily_task_claims SET claim_day=date(claim_day,'-1 day') WHERE task='threads'");
    const bothHidden = await (await call('/daily-tasks', 'member')).json();
    assert.deepEqual(bothHidden.hiddenTasks.sort(), ['instagram', 'threads']);
    assert.equal((await call('/daily-tasks/claim/instagram', 'member', 'POST')).status, 200);
    assert.equal(usage(), 4);
    await call('/admin/users/1', 'owner', 'PATCH', { admin_nickname:'內部暱稱' });
    const list = await (await call('/admin/users?limit=50&q=' + encodeURIComponent('內部暱稱'), 'owner')).json();
    assert.equal(list.items[0].admin_nickname, '內部暱稱');
    const me = await (await call('/auth/me', 'member')).json();
    assert.equal(me.user.admin_nickname, undefined);
    const adjust = { delta_welfare:1000, note:'internal-only', notify_member:true, notification_note:'活動系統贈送' };
    assert.equal((await call('/admin/users/1/wallet','other','POST',adjust)).status,403);
    assert.equal((await call('/admin/users/1/wallet','owner','POST',adjust)).status,200);
    assert.equal((await call('/admin/users/1/wallet','owner','POST',{ ...adjust, action:'扣除', delta_welfare:1001 })).status,400);
    assert.equal((await call('/admin/users/1/activity-times','owner','POST',{ activity_key:'wheel', amount:1, notify_member:true })).status,200);
    assert.equal((await call('/admin/users/1/activity-times','owner','POST',{ activity_key:'redpacket', amount:1, notify_member:false })).status,200);
    const messages = await (await call('/member/notifications','member')).json();
    assert.equal(messages.unread,4);
    assert.deepEqual(messages.items.map(x=>x.message),[
      '您獲得了輪盤資格一次。','您獲得了 1,000 福利金。（活動系統贈送）',
      '您的 Instagram 已通過驗證，可前往每日任務領取獎勵。','您的 Instagram 驗證失敗，請聯絡客服。',
    ]);
    assert.doesNotMatch(JSON.stringify(messages),/internal-only|admin_account|admin_id|proofId/);
    sqlite.exec("INSERT INTO users(id,username,password) VALUES (2,'other-member','test'); INSERT INTO user_sessions(token,user_id,username) VALUES ('member2',2,'other-member')");
    assert.equal((await call('/member/notifications')).status,401);
    assert.equal((await call('/member/notifications/read','member2','POST',{ through: messages.items[0].id })).status,200);
    assert.deepEqual((await (await call('/member/notifications','member2')).json()).items,[]);
    assert.equal((await (await call('/member/notifications','member')).json()).unread,4);
    await call('/member/notifications/read','member','POST',{ through: messages.items[0].id });
    assert.equal((await (await call('/member/notifications','member')).json()).unread,0);
    sqlite.exec(`INSERT INTO member_notifications(user_id,message,created_at) VALUES
      (1,'older than seven days',datetime('now','-8 days')),
      (1,'still within seven days',datetime('now','-6 days')),
      (1,'latest',datetime('now'));`);
    const firstPage = await (await call('/member/notifications?page=1','member')).json();
    const secondPage = await (await call('/member/notifications?page=2','member')).json();
    assert.equal(firstPage.items.length,5);
    assert.equal(firstPage.totalPages,2);
    assert.equal(firstPage.unread,2);
    assert.deepEqual(secondPage.items.map(item=>item.message),['您的 Instagram 驗證失敗，請聯絡客服。']);
    assert.equal(secondPage.page,2);
    assert.doesNotMatch(JSON.stringify([firstPage,secondPage]), /older than seven days/);
    await worker.scheduled(null,env);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM member_notifications WHERE message='older than seven days'").get().n,0);
    const clock = t.mock.method(Date, 'now', () => Date.parse('2035-01-12T11:59:59+08:00'));
    const tasks = ['share_post','like_post','share_story'];
    const review = (task, body) => call('/admin/daily-tasks/users/1/'+task,'owner','PATCH',body);
    const adminTasks = async () => (await call('/admin/daily-tasks/users/1','owner')).json();
    assert.equal((await adminTasks()).socialDay,'2035-01-11');
    for (const task of tasks) {
      assert.equal((await review(task,{ approved:true, socialDay:'2035-01-11' })).status,200);
      assert.equal((await call('/daily-tasks/claim/'+task,'member','POST')).status,200);
    }
    assert.equal((await call('/daily-tasks/checkin','member','POST')).status,200);
    assert.equal((await call('/daily-tasks/claim/checkin','member','POST')).status,200);
    assert.equal((await (await call('/daily-tasks','member')).json()).progress,4);
    clock.mock.mockImplementation(() => Date.parse('2035-01-12T12:00:00+08:00'));
    const afterNoon = await (await call('/daily-tasks','member')).json();
    assert.equal(afterNoon.progress,1);
    assert.equal(afterNoon.tasks.checkin,'claimed');
    assert.equal(afterNoon.tasks.instagram,'claimed');
    for (const task of tasks) {
      assert.equal(afterNoon.tasks[task],'available');
      assert.equal((await adminTasks()).items.some(item=>item.task===task),false);
      assert.equal((await call('/daily-tasks/claim/'+task,'member','POST')).status,409);
      assert.equal((await review(task,{ approved:true, socialDay:'2035-01-11' })).status,409);
      assert.equal((await review(task,{ approved:true, socialDay:'2035-01-12' })).status,200);
      assert.equal((await call('/daily-tasks/claim/'+task,'member','POST')).status,200);
    }
    assert.equal((await (await call('/daily-tasks','member')).json()).progress,4);
  } finally { sqlite.close(); }
});

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
    sqlite.exec("INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','owner','active'); INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('banner-admin',1,'owner','admin')");
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
    const create = '/admin/home/banners';
    const banner = { image_url:url, link_url:'/welcome' };
    assert.equal((await call(create,'POST',banner)).status,401);
    assert.equal((await call(create,'POST',{ link_url:'/welcome' },true)).status,400);
    const added = await Promise.all(Array.from({length:7}, () => call(create,'POST',banner,true)));
    assert.equal(added.filter(r=>r.status===201).length,6);
    assert.equal(added.filter(r=>r.status===409).length,1);
    const items = (await (await call('/home/banners')).json()).items;
    assert.equal(items.filter(item=>!item.deleted).length,7); // Slots 3 and 4 are still built-in.
    assert.equal(new Set(items.filter(item=>item.sort).map(item=>item.sort)).size,6);
    assert.equal((await call('/admin/home/banners/3','DELETE',undefined,true)).status,200);
    const replacement = await (await call(create,'POST',banner,true)).json();
    assert.equal(replacement.item.slot,3);
    assert.ok(replacement.item.sort > Math.max(...items.map(item=>item.sort || 0)));
    assert.equal((await call('/admin/home/banners/9','PATCH',{ link_url:'' },true)).status,200);
    assert.equal((await call('/admin/home/banners/9','DELETE',undefined,true)).status,200);
    assert.equal((await call('/admin/home/banners/9','PATCH',{ link_url:'/welcome' },true)).status,404);
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
    sqlite.exec("INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','owner','active'); INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('shop-admin',1,'owner','admin')");
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
    sqlite.exec(`INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','admin','active'); INSERT INTO admin_sessions (token,admin_id,role,username) VALUES ('member-admin',1,'admin','admin');
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
    assert.equal(data.sqlite.prepare("SELECT value FROM app_schema_state WHERE key='schema_version'").get().value, '2026-11-08.notifications-v9');
  } finally { data.sqlite.close(); }
});

test('existing arcade databases only run the additive shop upgrade', async () => {
  const data = database();
  try {
    await (await isolate()).fetch(request(), { raffle_db: data.db });
    data.sqlite.exec(`INSERT INTO shop_products (id,name,reward_welfare) VALUES ('saved','Existing',25);
      DROP TRIGGER settle_shop_order;
      ALTER TABLE shop_products DROP COLUMN reward_discount;
      UPDATE app_schema_state SET value='2026-11-07.arcade-v4';`);
    data.queries.length = 0;
    const response = await (await isolate()).fetch(request(), { raffle_db: data.db });
    assert.equal(response.status, 200);
    assert.ok(data.queries.length < 32);
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
    sqlite.exec("INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','owner','active'); INSERT INTO admin_sessions (token, admin_id, role, username) VALUES ('sc-admin', 1, 'owner', 'admin')");
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

test('shop redemption, owner scope, session revocation and referral awards are enforced by the API', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const call = (path, token, method = 'GET', body) => worker.fetch(new Request('https://api.skclub.vip'+path, {
      method, headers: { authorization: 'Bearer '+token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { raffle_db: db });
    await call('/activities');
    sqlite.exec(`INSERT INTO admin_accounts(id,username,password,role,status) VALUES
        (1,'owner','owner-pass','admin','active'),(2,'other','fixture','admin','active');
      INSERT INTO admin_sessions(token,admin_id,role,username) VALUES
        ('owner',1,'superadmin','owner'),('other',2,'admin','other');
      INSERT INTO users(id,username,password,created_by_admin_id,s_balance,line_id) VALUES
        (10,'buyer','buyer-pass',1,100,'line-buyer'),(11,'referrer','fixture',2,0,'line-referrer');
      INSERT INTO user_sessions(token,user_id,username) VALUES ('buyer',10,'buyer');
      INSERT INTO shop_products(id,name,cost_s,reward_discount,reward_welfare) VALUES ('one','One',100,50,20);
      INSERT INTO referrals(referrer_user_id,referred_user_id,code) VALUES (11,10,'fixture');`);
    const orders = await Promise.all([1,2].map(() => call('/shop/redeem','buyer','POST',{product_id:'one'})));
    assert.deepEqual(orders.map(r=>r.status).sort(),[200,400]);
    const wallet = sqlite.prepare('SELECT s_balance,discount_balance,welfare_balance FROM users WHERE id=10').get();
    assert.deepEqual({...wallet},{s_balance:0,discount_balance:50,welfare_balance:20});
    const order = sqlite.prepare("SELECT id,created_at,status FROM shop_orders WHERE user_id=10").get();
    assert.equal(order.status,'success');
    assert.ok(order.created_at);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_logs WHERE action='redeem' AND delta_s=-100").get().n,1);
    assert.equal((await call('/admin/module/electronic-room/status?user_id=10','other')).status,403);
    assert.equal((await call('/admin/module/electronic-room/update','other','POST',{user_id:10,enabled:1})).status,403);
    assert.equal((await call('/admin/module/electronic-room/status?user_id=10','owner')).status,200);
    assert.equal((await (await call('/admin/shop/orders','other')).json()).items.length,0);
    assert.equal((await call('/admin/shop/orders/'+order.id+'/review','other','POST',{})).status,403);
    assert.equal((await call('/admin/shop/orders/'+order.id+'/review','owner','POST',{})).status,200);
    assert.equal((await call('/admin/admins','owner')).status,403);
    const verified = await Promise.all([1,2].map(() => call('/admin/users/10/line-verify','owner','POST',{verified:1})));
    assert.deepEqual(verified.map(r=>r.status),[200,200]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM draw_records WHERE note='referral_verify_bonus'").get().n,2);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM draw_records WHERE note='line_verify_bonus'").get().n,1);
    assert.equal(sqlite.prepare("SELECT times_left AS n FROM user_activity_usage WHERE user_id=11 AND activity_key='redpacket'").get().n,1);
    const register = await call('/auth/user/register',null,'POST',{username:'legacy-new',password:'legacy'});
    assert.equal(register.status,410);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM users WHERE username='legacy-new'").get().n,0);
    assert.equal((await call('/auth/admin/login',null,'POST',{username:'owner',password:'owner-pass'})).status,200);
    assert.match(sqlite.prepare("SELECT password FROM admin_accounts WHERE id=1").get().password,/^pbkdf2-sha256\$/);
    const salt = Buffer.alloc(16, 42);
    const digest = pbkdf2Sync('buyer-pass', salt, 600_000, 32, 'sha256');
    const existingHash = ['pbkdf2-sha256', 600_000, salt.toString('hex'), digest.toString('hex')].join('$');
    sqlite.prepare("UPDATE users SET password=? WHERE id=10").run(existingHash);
    assert.equal((await call('/auth/user/login',null,'POST',{username:'buyer',password:'incorrect'})).status,401);
    const login = await call('/auth/user/login',null,'POST',{username:'buyer',password:'buyer-pass'});
    assert.equal(login.status,200);
    const { token } = await login.json();
    assert.equal(sqlite.prepare("SELECT password FROM users WHERE id=10").get().password,existingHash);
    sqlite.exec("UPDATE users SET locked=1 WHERE id=10");
    assert.equal((await call('/wallet/logs',token)).status,401);
    sqlite.exec("UPDATE users SET locked=0 WHERE id=10; UPDATE admin_accounts SET status='disabled' WHERE id=1");
    assert.equal((await call('/wallet/logs',token)).status,401);
    assert.equal((await call('/admin/shop/orders','owner')).status,401);
  } finally { sqlite.close(); }
});

test('wheel uses configured weights on the first spin and handles concurrent spins and failed configuration writes', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const call = (path, token, method = 'GET', body) => worker.fetch(new Request('https://api.skclub.vip'+path, {
      method, headers: { authorization: 'Bearer '+token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { raffle_db: db });
    await call('/activities');
    sqlite.exec(`UPDATE activities SET enabled=1 WHERE activity_key='wheel';
      INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','superadmin','active');
      INSERT INTO admin_sessions(token,admin_id,role,username) VALUES ('admin',1,'superadmin','admin');
      INSERT INTO users(id,username,password,created_by_admin_id) VALUES (10,'spinner','fixture',0);
      INSERT INTO user_sessions(token,user_id,username) VALUES ('spinner',10,'spinner');
      INSERT INTO user_activity_usage(user_id,activity_key,times_left) VALUES (10,'wheel',2);`);
    const setPrizes = items => call('/admin/wheel/prizes','admin','PUT',{items});
    assert.equal((await setPrizes([{title:'5000折抵金',prize_type:'discount',amount:5000,weight:0}])).status,200);
    assert.equal((await call('/wheel/spin','spinner','POST',{})).status,400);
    assert.equal(sqlite.prepare("SELECT times_left AS n FROM user_activity_usage WHERE user_id=10").get().n,2);
    assert.equal((await setPrizes([{title:'5000折抵金',prize_type:'discount',amount:5000,weight:0},{title:'S幣8',amount:8,weight:1}])).status,200);
    sqlite.exec("CREATE TRIGGER reject_wheel_prize BEFORE INSERT ON wheel_prizes WHEN NEW.title='reject' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
    assert.equal((await setPrizes([{title:'first',weight:2},{title:'reject',weight:1}])).status,500);
    assert.deepEqual(sqlite.prepare("SELECT title FROM wheel_prizes ORDER BY id").all().map(p=>p.title),['5000折抵金','S幣8']);
    const results = await Promise.all([1,2].map(() => call('/wheel/spin','spinner','POST',{})));
    assert.deepEqual(results.map(r=>r.status),[200,200]);
    const payloads = await Promise.all(results.map(r=>r.json()));
    assert.deepEqual(payloads.map(p=>p.result.prize_value),[8,8]);
    assert.deepEqual({...sqlite.prepare("SELECT s_balance,discount_balance FROM users WHERE id=10").get()},{s_balance:16,discount_balance:0});
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM draw_records WHERE activity_key='wheel'").get().n,2);
  } finally { sqlite.close(); }
});

test('activity fields persist, daily limits reset, promotions are sanitized and football records stay within the range', async () => {
  const { db, sqlite } = database();
  try {
    const worker = await isolate();
    const call = (path, token, method = 'GET', body) => worker.fetch(new Request('https://api.skclub.vip'+path, {
      method, headers: { authorization: 'Bearer '+token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), { raffle_db: db });
    await call('/activities');
    sqlite.exec(`INSERT INTO admin_accounts(id,username,password,role,status) VALUES (1,'admin','fixture','superadmin','active');
      INSERT INTO admin_sessions(token,admin_id,role,username) VALUES ('admin',1,'superadmin','admin');
      INSERT INTO users(id,username,password,created_by_admin_id) VALUES (10,'member','fixture',1);
      INSERT INTO user_sessions(token,user_id,username) VALUES ('member',10,'member');
      INSERT INTO user_activity_usage(user_id,activity_key,times_left,updated_at) VALUES (10,'wheel',1,'2000-01-01');
      INSERT INTO wheel_prizes(title,amount,weight) VALUES ('S幣1',1,1);
      INSERT INTO draw_records(activity_key,user_id,username,status,created_at) VALUES
        ('football',10,'member','win','2026-01-10 00:00:00'),
        ('football',10,'member','win','2026-03-10 00:00:00'),
        ('wheel',10,'member','win','2026-03-10 00:00:00');
      INSERT INTO wallet_logs(user_id,account,category,action,status,delta_sc,created_at)
        VALUES (10,'member','system','sc_checkin','success',3000,datetime('now'));`);
    const settings = { name:'新輪盤', enabled:1, sort:-2, defaultTimes:4, allowOverrideTimes:0, dailyReset:1,
      requireAuthorized:1, startAt:'2020-01-01T00:00', endAt:'2099-12-31T23:59' };
    assert.equal((await call('/admin/activities/wheel','admin','PATCH',settings)).status,200);
    const activities = await (await call('/admin/activities','admin')).json();
    assert.deepEqual(activities.items[0],{ key:'wheel', ...settings });
    assert.equal((await call('/admin/users/10/activity-times','admin','POST',{activity_key:'wheel',mode:'set',amount:2})).status,403);
    assert.equal((await call('/wheel/spin','member','POST',{})).status,403);
    sqlite.exec('UPDATE users SET num_authorized=1 WHERE id=10');
    assert.equal((await (await call('/wheel/spin','member','POST',{})).json()).left,3);
    const record = await (await call('/records?from=2026-01-01&to=2026-03-10&type=football','member')).json();
    assert.deepEqual(record.items.map(x=>x.type),['football']);
    assert.equal(record.range.from,'2026-02-08 16:00:00');
    const logs = await (await call('/admin/users/10/logs','admin')).json();
    assert.ok(logs.items.some(x=>x.delta_sc===3000));
    const malicious = '<p><b>優惠</b><img src=x onerror=alert(1)><a href=javascript:alert(1)>點此</a><script>alert(1)</script></p>';
    sqlite.prepare("INSERT INTO promotions(title,content_html,placement) VALUES ('legacy',?,'coupon')").run(malicious);
    for (const [path, token] of [['/promotions?placement=coupon',''],['/admin/promotions','admin']]) {
      const result = await (await call(path,token)).json();
      assert.match(JSON.stringify(result), /<b>優惠<\/b>/);
      assert.doesNotMatch(JSON.stringify(result), /onerror|javascript:|<script|alert\(1\)/);
    }
  } finally { sqlite.close(); }
});

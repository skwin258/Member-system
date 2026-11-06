import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

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

test('new Worker isolates skip completed migrations and retain activity and member data', async () => {
  const data = database();
  try {
    const first = await isolate();
    const before = await first.fetch(request(), { raffle_db: data.db });
    assert.equal(before.status, 200);
    const activities = await before.json();
    assert.equal(activities.activities.length, 4);
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
    assert.equal(data.sqlite.prepare("SELECT value FROM app_schema_state WHERE key='schema_version'").get().value, '2026-11-07.bootstrap-v1');
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

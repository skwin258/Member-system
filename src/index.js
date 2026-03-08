// raffle-api/src/index.js

// ✅ PERF FIX (2026-03-02):
// 以前每一個 request 都會跑一次「建表/欄位檢查/seed」，會導致讀 D1 需要 2~30 秒。
// 這裡改成：同一個 Worker isolate 只初始化一次（多個同時 request 會共用同一個 Promise），
// 讓登入/讀取 D1 幾乎立即回應，不影響你原本的 API/資料/前端 UI。

const __BOOTSTRAP_STATE__ = { promise: null };

const __HOT_CACHE__ = new Map();

function hotCacheGet(key) {
  const hit = __HOT_CACHE__.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    __HOT_CACHE__.delete(key);
    return null;
  }
  return hit.value;
}

function hotCacheSet(key, value, ttlMs = 1500) {
  __HOT_CACHE__.set(key, { value, expiresAt: Date.now() + Math.max(0, Number(ttlMs) || 0) });
  return value;
}

function hotCacheDel(prefix) {
  const p = String(prefix || '');
  for (const key of [...__HOT_CACHE__.keys()]) {
    if (key === p || key.startsWith(p)) __HOT_CACHE__.delete(key);
  }
}

async function ensureBootstrapped(db) {
  if (__BOOTSTRAP_STATE__.promise) return __BOOTSTRAP_STATE__.promise;

  __BOOTSTRAP_STATE__.promise = (async () => {
/* =========================
 * Schema bootstrap + migrations
 * ========================= */
const tryRun = async (sql, binds = []) => {
  try {
    const stmt = db.prepare(sql);
    return binds.length ? await stmt.bind(...binds).run() : await stmt.run();
  } catch (_) {
    return null;
  }
};

const tableInfo = async (name) => {
  const res = await db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all();
  const rows = res?.results || [];
  return rows.map((r) => String(r.name));
};

const hasAll = (cols, required) => required.every((c) => cols.includes(c));

const ensureTable = async ({
  name,
  createSql,
  requiredCols = [],
  addCols = [],
  rebuildIfMissing = [],
}) => {
  await db.prepare(createSql).run();

  let cols = await tableInfo(name);

  for (const it of addCols) {
    if (!cols.includes(it.col)) {
      await tryRun(it.sql);
    }
  }

  cols = await tableInfo(name);

  if (rebuildIfMissing.length && !hasAll(cols, rebuildIfMissing)) {
    const oldName = `${name}_old_${Date.now()}`;

    await db.prepare(`ALTER TABLE ${name} RENAME TO ${oldName}`).run();
    await db.prepare(createSql).run();

    const newCols = await tableInfo(name);
    const oldCols = await tableInfo(oldName);
    const common = newCols.filter((c) => oldCols.includes(c));

    if (common.length > 0) {
      const colList = common.map((c) => `"${c}"`).join(", ");
      await db
        .prepare(
          `INSERT INTO ${name} (${colList})
           SELECT ${colList} FROM ${oldName}`
        )
        .run();
    }

    await db.prepare(`DROP TABLE ${oldName}`).run();
    cols = await tableInfo(name);
  }

  if (requiredCols.length && !hasAll(cols, requiredCols)) {
    throw new Error(
      `SchemaError: table ${name} missing columns: ${requiredCols
        .filter((c) => !cols.includes(c))
        .join(", ")}`
    );
  }
};

// ---- admins / admin_accounts
await ensureTable({
  name: "admins",
  createSql: `CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["id", "username", "password", "role", "created_at"],
});

await ensureTable({
  name: "admin_accounts",
  createSql: `CREATE TABLE IF NOT EXISTS admin_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'active',
    official_line_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "official_line_url", sql: "ALTER TABLE admin_accounts ADD COLUMN official_line_url TEXT" },
  ],
  rebuildIfMissing: ["id", "username", "password", "role", "status", "created_at"],
});

// ---- activities
await ensureTable({
  name: "activities",
  createSql: `CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_key TEXT UNIQUE NOT NULL,
    activity_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    default_times INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    allow_override_times INTEGER NOT NULL DEFAULT 1,
    daily_reset INTEGER NOT NULL DEFAULT 0,
    require_authorized INTEGER NOT NULL DEFAULT 0,
    start_at TEXT,
    end_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "activity_key", sql: "ALTER TABLE activities ADD COLUMN activity_key TEXT" },
    { col: "activity_name", sql: "ALTER TABLE activities ADD COLUMN activity_name TEXT" },
    { col: "enabled", sql: "ALTER TABLE activities ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1" },
    { col: "default_times", sql: "ALTER TABLE activities ADD COLUMN default_times INTEGER NOT NULL DEFAULT 0" },
    { col: "sort", sql: "ALTER TABLE activities ADD COLUMN sort INTEGER NOT NULL DEFAULT 0" },
    { col: "allow_override_times", sql: "ALTER TABLE activities ADD COLUMN allow_override_times INTEGER NOT NULL DEFAULT 1" },
    { col: "daily_reset", sql: "ALTER TABLE activities ADD COLUMN daily_reset INTEGER NOT NULL DEFAULT 0" },
    { col: "require_authorized", sql: "ALTER TABLE activities ADD COLUMN require_authorized INTEGER NOT NULL DEFAULT 0" },
    { col: "start_at", sql: "ALTER TABLE activities ADD COLUMN start_at TEXT" },
    { col: "end_at", sql: "ALTER TABLE activities ADD COLUMN end_at TEXT" },
    { col: "updated_at", sql: "ALTER TABLE activities ADD COLUMN updated_at TEXT" },
    { col: "created_at", sql: "ALTER TABLE activities ADD COLUMN created_at TEXT" },
  ],
  rebuildIfMissing: ["activity_key", "activity_name", "enabled", "default_times"],
  requiredCols: ["activity_key", "activity_name", "enabled", "default_times", "start_at", "end_at"],
});

// ---- users
await ensureTable({
  name: "users",
  createSql: `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT,
    welfare_balance INTEGER NOT NULL DEFAULT 0,
    s_balance INTEGER NOT NULL DEFAULT 0,
    discount_balance INTEGER NOT NULL DEFAULT 0,
    line_id TEXT,
    birthday TEXT,
    bank_holder TEXT,
    bank_name TEXT,
    bank_branch TEXT,
    bank_account TEXT,
    line_verified INTEGER NOT NULL DEFAULT 0,
    num_authorized INTEGER NOT NULL DEFAULT 0,
    uses_left INTEGER NOT NULL DEFAULT 0,
    times_override INTEGER,
    enabled INTEGER NOT NULL DEFAULT 1,
    locked INTEGER NOT NULL DEFAULT 0,
    created_by_admin_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "display_name", sql: "ALTER TABLE users ADD COLUMN display_name TEXT" },
    { col: "welfare_balance", sql: "ALTER TABLE users ADD COLUMN welfare_balance INTEGER NOT NULL DEFAULT 0" },
    { col: "s_balance", sql: "ALTER TABLE users ADD COLUMN s_balance INTEGER NOT NULL DEFAULT 0" },
    { col: "discount_balance", sql: "ALTER TABLE users ADD COLUMN discount_balance INTEGER NOT NULL DEFAULT 0" },
    { col: "line_id", sql: "ALTER TABLE users ADD COLUMN line_id TEXT" },
    { col: "birthday", sql: "ALTER TABLE users ADD COLUMN birthday TEXT" },
    { col: "bank_holder", sql: "ALTER TABLE users ADD COLUMN bank_holder TEXT" },
    { col: "bank_name", sql: "ALTER TABLE users ADD COLUMN bank_name TEXT" },
    { col: "bank_branch", sql: "ALTER TABLE users ADD COLUMN bank_branch TEXT" },
    { col: "bank_account", sql: "ALTER TABLE users ADD COLUMN bank_account TEXT" },
    { col: "line_verified", sql: "ALTER TABLE users ADD COLUMN line_verified INTEGER NOT NULL DEFAULT 0" },
    { col: "num_authorized", sql: "ALTER TABLE users ADD COLUMN num_authorized INTEGER NOT NULL DEFAULT 0" },
    { col: "uses_left", sql: "ALTER TABLE users ADD COLUMN uses_left INTEGER NOT NULL DEFAULT 0" },
    { col: "times_override", sql: "ALTER TABLE users ADD COLUMN times_override INTEGER" },
    { col: "enabled", sql: "ALTER TABLE users ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1" },
    { col: "locked", sql: "ALTER TABLE users ADD COLUMN locked INTEGER NOT NULL DEFAULT 0" },
    { col: "created_by_admin_id", sql: "ALTER TABLE users ADD COLUMN created_by_admin_id INTEGER" },
    { col: "created_at", sql: "ALTER TABLE users ADD COLUMN created_at TEXT" },
  ],
  rebuildIfMissing: ["id", "username", "password"],
  requiredCols: ["id", "username", "password", "enabled", "locked"],
});

// ---- user_sessions
await ensureTable({
  name: "user_sessions",
  createSql: `CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "user_id", sql: "ALTER TABLE user_sessions ADD COLUMN user_id INTEGER" },
    { col: "username", sql: "ALTER TABLE user_sessions ADD COLUMN username TEXT" },
    { col: "created_at", sql: "ALTER TABLE user_sessions ADD COLUMN created_at TEXT" },
  ],
  rebuildIfMissing: ["token", "user_id", "username"],
  requiredCols: ["token", "user_id", "username", "created_at"],
});

// ---- admin_sessions
await ensureTable({
  name: "admin_sessions",
  createSql: `CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "admin_id", sql: "ALTER TABLE admin_sessions ADD COLUMN admin_id INTEGER" },
    { col: "role", sql: "ALTER TABLE admin_sessions ADD COLUMN role TEXT" },
    { col: "username", sql: "ALTER TABLE admin_sessions ADD COLUMN username TEXT" },
    { col: "created_at", sql: "ALTER TABLE admin_sessions ADD COLUMN created_at TEXT" },
  ],
  rebuildIfMissing: ["token", "admin_id", "role", "username"],
  requiredCols: ["token", "admin_id", "role", "username", "created_at"],
});

// ---- wheel_prizes
await ensureTable({
  name: "wheel_prizes",
  createSql: `CREATE TABLE IF NOT EXISTS wheel_prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    prize_type TEXT NOT NULL DEFAULT 'money',
    prize_text TEXT,
    image_url TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "enabled", sql: "ALTER TABLE wheel_prizes ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1" },
    { col: "prize_type", sql: "ALTER TABLE wheel_prizes ADD COLUMN prize_type TEXT NOT NULL DEFAULT 'money'" },
    { col: "prize_text", sql: "ALTER TABLE wheel_prizes ADD COLUMN prize_text TEXT" },
    { col: "image_url", sql: "ALTER TABLE wheel_prizes ADD COLUMN image_url TEXT" },
    { col: "sort", sql: "ALTER TABLE wheel_prizes ADD COLUMN sort INTEGER NOT NULL DEFAULT 0" },
    { col: "updated_at", sql: "ALTER TABLE wheel_prizes ADD COLUMN updated_at TEXT" },
    { col: "created_at", sql: "ALTER TABLE wheel_prizes ADD COLUMN created_at TEXT" },
  ],
  rebuildIfMissing: ["id", "title", "amount", "weight"],
  requiredCols: ["id", "title", "amount", "weight", "enabled"],
});

// ---- redpacket_config
await ensureTable({
  name: "redpacket_config",
  createSql: `CREATE TABLE IF NOT EXISTS redpacket_config (
    id INTEGER PRIMARY KEY CHECK (id=1),
    mode TEXT NOT NULL DEFAULT 'pool',
    fixed_amount INTEGER NOT NULL DEFAULT 0,
    pool_json TEXT NOT NULL DEFAULT '[]',
    count INTEGER NOT NULL DEFAULT 0,
    allow_repeat INTEGER NOT NULL DEFAULT 1,
    lock_when_all_opened INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "count", sql: "ALTER TABLE redpacket_config ADD COLUMN count INTEGER NOT NULL DEFAULT 0" },
    { col: "allow_repeat", sql: "ALTER TABLE redpacket_config ADD COLUMN allow_repeat INTEGER NOT NULL DEFAULT 1" },
    { col: "lock_when_all_opened", sql: "ALTER TABLE redpacket_config ADD COLUMN lock_when_all_opened INTEGER NOT NULL DEFAULT 0" },
  ],
  rebuildIfMissing: ["id", "mode", "fixed_amount", "pool_json", "updated_at"],
});

await db
  .prepare(
    "INSERT OR IGNORE INTO redpacket_config (id, mode, fixed_amount, pool_json, updated_at) VALUES (1,'pool',0,'[]',datetime('now'))"
  )
  .run();

// ---- user_activity_usage (B方案)
await ensureTable({
  name: "user_activity_usage",
  createSql: `CREATE TABLE IF NOT EXISTS user_activity_usage (
    user_id INTEGER NOT NULL,
    activity_key TEXT NOT NULL,
    times_left INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, activity_key)
  )`,
  rebuildIfMissing: ["user_id", "activity_key", "times_left"],
});

// ---- winners
await ensureTable({
  name: "winners",
  createSql: `CREATE TABLE IF NOT EXISTS winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    activity_key TEXT NOT NULL,
    user_id INTEGER,
    username TEXT,
    prize_title TEXT,
    prize_amount INTEGER NOT NULL DEFAULT 0,
    meta_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["id", "activity_key", "prize_amount", "created_at"],
});

// ---- draw_records (✅ 抽獎紀錄：中/沒中都要記)
await ensureTable({
  name: "draw_records",
  createSql: `CREATE TABLE IF NOT EXISTS draw_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    activity_key TEXT NOT NULL,      -- redpacket / wheel / number
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,

    status TEXT NOT NULL,            -- win / lose
    prize_title TEXT,                -- 獎項名稱（可空）
    prize_amount INTEGER NOT NULL DEFAULT 0, -- 金額/點數（可空）
    note TEXT,                       -- 備註/關鍵字（可空）
    meta_json TEXT,                  -- 其他資訊（可空）

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["id", "activity_key", "user_id", "username", "status", "created_at"],
});

// indexes（沒有也能跑，但有會快很多）
await tryRun(
  "CREATE INDEX IF NOT EXISTS idx_draw_records_user_time ON draw_records(user_id, created_at)"
);
await tryRun(
  "CREATE INDEX IF NOT EXISTS idx_draw_records_time ON draw_records(created_at)"
);
await tryRun("CREATE INDEX IF NOT EXISTS idx_draw_records_activity_time ON draw_records(activity_key, created_at)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_draw_records_activity_status_time ON draw_records(activity_key, status, created_at)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_user_activity_usage_user_activity ON user_activity_usage(user_id, activity_key)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_winners_activity_time ON winners(activity_key, created_at)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_activities_sort_enabled ON activities(sort, enabled)");

// ---- referral_codes：每個使用者一組固定推廣碼
await ensureTable({
  name: "referral_codes",
  createSql: `CREATE TABLE IF NOT EXISTS referral_codes (
    user_id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["user_id", "code", "created_at"],
});

// ---- referrals：推薦關係紀錄
await ensureTable({
  name: "referrals",
  createSql: `CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL,
    referred_user_id INTEGER NOT NULL UNIQUE,
    code TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["id", "referrer_user_id", "referred_user_id", "code", "created_at"],
});



// index
await tryRun("CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)");

// ---- promotions（優惠內容：列表圖片 + 點擊彈窗顯示 HTML）
// 位置：referrals / referral_codes index 之後，seed activities 之前
await ensureTable({
  name: "promotions",
  createSql: `CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    cover_image_url TEXT NOT NULL DEFAULT '',
    content_html TEXT NOT NULL DEFAULT '',
    placement TEXT NOT NULL DEFAULT 'coupon',
    enabled INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "title", sql: "ALTER TABLE promotions ADD COLUMN title TEXT NOT NULL DEFAULT ''" },
    { col: "cover_image_url", sql: "ALTER TABLE promotions ADD COLUMN cover_image_url TEXT NOT NULL DEFAULT ''" },
    { col: "content_html", sql: "ALTER TABLE promotions ADD COLUMN content_html TEXT NOT NULL DEFAULT ''" },
    { col: "enabled", sql: "ALTER TABLE promotions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1" },
    { col: "sort", sql: "ALTER TABLE promotions ADD COLUMN sort INTEGER NOT NULL DEFAULT 0" },
    { col: "placement", sql: "ALTER TABLE promotions ADD COLUMN placement TEXT NOT NULL DEFAULT 'coupon'" },
    { col: "updated_at", sql: "ALTER TABLE promotions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))" },
    { col: "created_at", sql: "ALTER TABLE promotions ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))" },
  ],
  rebuildIfMissing: ["id","title","cover_image_url","content_html","placement","enabled","sort","updated_at","created_at"],
  requiredCols: ["id","title","cover_image_url","content_html","placement","enabled","sort"],
});

await tryRun("CREATE INDEX IF NOT EXISTS idx_promotions_sort ON promotions(sort)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_promotions_enabled ON promotions(enabled)");

// ---- promotion_positions（優惠按鈕位置 / 分類）
await ensureTable({
  name: "promotion_positions",
  createSql: `CREATE TABLE IF NOT EXISTS promotion_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position_key TEXT UNIQUE NOT NULL,
    position_label TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    built_in INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  addCols: [
    { col: "position_key", sql: "ALTER TABLE promotion_positions ADD COLUMN position_key TEXT" },
    { col: "position_label", sql: "ALTER TABLE promotion_positions ADD COLUMN position_label TEXT NOT NULL DEFAULT ''" },
    { col: "sort", sql: "ALTER TABLE promotion_positions ADD COLUMN sort INTEGER NOT NULL DEFAULT 0" },
    { col: "enabled", sql: "ALTER TABLE promotion_positions ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1" },
    { col: "built_in", sql: "ALTER TABLE promotion_positions ADD COLUMN built_in INTEGER NOT NULL DEFAULT 0" },
    { col: "updated_at", sql: "ALTER TABLE promotion_positions ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))" },
    { col: "created_at", sql: "ALTER TABLE promotion_positions ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'))" },
  ],
  rebuildIfMissing: [
    "id",
    "position_key",
    "position_label",
    "sort",
    "enabled",
    "built_in",
    "updated_at",
    "created_at",
  ],
  requiredCols: [
    "id",
    "position_key",
    "position_label",
    "sort",
    "enabled",
    "built_in",
  ],
});

await tryRun("CREATE INDEX IF NOT EXISTS idx_promotion_positions_sort ON promotion_positions(sort)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_promotion_positions_enabled ON promotion_positions(enabled)");

// 預設三個內建位置
await db
  .prepare(
    `INSERT OR IGNORE INTO promotion_positions
     (position_key, position_label, sort, enabled, built_in, updated_at, created_at)
     VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`
  )
  .bind("coupon", "全部", 0)
  .run();

await db
  .prepare(
    `INSERT OR IGNORE INTO promotion_positions
     (position_key, position_label, sort, enabled, built_in, updated_at, created_at)
     VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`
  )
  .bind("event", "入金", 1)
  .run();

await db
  .prepare(
    `INSERT OR IGNORE INTO promotion_positions
     (position_key, position_label, sort, enabled, built_in, updated_at, created_at)
     VALUES (?, ?, ?, 1, 1, datetime('now'), datetime('now'))`
  )
  .bind("task", "返水", 2)
  .run();

// ---- shop_config（商城設定：跑馬燈）
await ensureTable({
  name: "shop_config",
  createSql: `CREATE TABLE IF NOT EXISTS shop_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: ["key", "value", "updated_at"],
});

// 預設塞一筆 marquee_text，避免查不到
await db
  .prepare(
    `INSERT OR IGNORE INTO shop_config (key, value, updated_at)
     VALUES ('marquee_text', '', datetime('now'))`
  )
  .run();

// ---- shop_products（商城商品）
await ensureTable({
  name: "shop_products",
  createSql: `CREATE TABLE IF NOT EXISTS shop_products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    cost_s INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    deleted INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  rebuildIfMissing: [
    "id","name","image_url","cost_s","category","enabled","deleted","sort","updated_at","created_at"
  ],
});

// indexes（沒有也能跑，但有會快很多）
await tryRun("CREATE INDEX IF NOT EXISTS idx_shop_products_cat ON shop_products(category)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_shop_products_sort ON shop_products(sort)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_shop_products_enabled ON shop_products(enabled, deleted)");



// ---- wallet_logs (unified wallet ledger)
await ensureTable({
  name: "wallet_logs",
  createSql: `CREATE TABLE IF NOT EXISTS wallet_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT,
    user_id INTEGER,
    account TEXT,
    category TEXT,
    action TEXT,
    status TEXT,
    delta_s INTEGER NOT NULL DEFAULT 0,
    delta_welfare INTEGER NOT NULL DEFAULT 0,
    delta_discount INTEGER NOT NULL DEFAULT 0,
    result TEXT,
    note TEXT,
    admin_account TEXT
  )`,
  rebuildIfMissing: ["id","created_at","user_id","account"],
});

await tryRun("CREATE INDEX IF NOT EXISTS idx_wallet_logs_user ON wallet_logs(user_id, created_at)");
await tryRun("CREATE INDEX IF NOT EXISTS idx_wallet_logs_created ON wallet_logs(created_at)");

// ---- shop_orders (redeem logs)
await ensureTable({
  name: "shop_orders",
  createSql: `CREATE TABLE IF NOT EXISTS shop_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT,
    user_id INTEGER,
    username TEXT,
    product_id TEXT,
    product_name TEXT,
    cost_s INTEGER NOT NULL DEFAULT 0,
    status TEXT,
    note TEXT,
    reviewed INTEGER NOT NULL DEFAULT 0
  )`,
  addCols: [
    { col: "reviewed", sql: "ALTER TABLE shop_orders ADD COLUMN reviewed INTEGER NOT NULL DEFAULT 0" },
  ],
  rebuildIfMissing: ["id","created_at","user_id","username","product_id"],
});

await tryRun("CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders(user_id, created_at)");
// ---- seed activities
const seedActivities = [
  { key: "redpacket", name: "紅包抽獎", default_times: 0 },
  { key: "wheel", name: "輪盤抽獎", default_times: 0 },
  { key: "number", name: "數字抽獎", default_times: 0 },
];

for (const a of seedActivities) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO activities
       (activity_key, activity_name, enabled, default_times, start_at, end_at, updated_at, created_at)
       VALUES (?,?,1,?,NULL,NULL,datetime('now'),datetime('now'))`
    )
    .bind(a.key, a.name, a.default_times)
    .run();

  await db
    .prepare(
      `UPDATE activities
       SET activity_name = COALESCE(activity_name, ?),
           updated_at = datetime('now')
       WHERE activity_key = ?`
    )
    .bind(a.name, a.key)
    .run();
}

// seed superadmin
await db
  .prepare(
    "INSERT OR IGNORE INTO admin_accounts (username, password, role, status, official_line_url, created_at) VALUES ('superadmin','123456','superadmin','active',NULL,datetime('now'))"
  )
  .run();
await db
  .prepare(
    "INSERT OR IGNORE INTO admins (username, password, role, created_at) VALUES ('superadmin','123456','superadmin',datetime('now'))"
  )
  .run();



  })().catch((err) => {
    // 如果初始化失敗，允許下次再嘗試（避免整個服務卡死）
    __BOOTSTRAP_STATE__.promise = null;
    throw err;
  });

  return __BOOTSTRAP_STATE__.promise;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
  "Access-Control-Max-Age": "86400",
};

    const withCors = (init = {}) => ({
      ...init,
      headers: { ...corsHeaders, ...(init.headers || {}) },
    });

    const json = (data, init = {}) => Response.json(data, withCors(init));
    const text = (t, init = {}) => new Response(t, withCors(init));
    const corsEmpty = (status = 204) =>
      new Response(null, { status, headers: corsHeaders });
		const applyCors = (res) => {
  const headers = new Headers(res.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
};

    if (request.method === "OPTIONS") return corsEmpty(204);

    try {
      const db = env.raffle_db || env.RAFFLE_DB || env.DB;
      if (!db) {
        if (url.pathname === "/" && request.method === "GET") {
          return text("API Running (BUT D1 binding missing)");
        }
        return json(
          {
            success: false,
            error:
              "D1 binding missing. Please bind env.raffle_db (or RAFFLE_DB/DB).",
          },
          { status: 500 }
        );
      }

      /* =========================
       * Helpers
       * ========================= */
      const nowIso = () => new Date().toISOString();

      const formatInTaipei = (value = new Date()) => {
        const d = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(d.getTime())) return "";

        const parts = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Taipei",
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }).formatToParts(d);

        const pick = (type) => parts.find((x) => x.type === type)?.value || "00";
        return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")}`;
      };

      const parseTaipeiDateTimeToUtcMs = (input) => {
        const raw = String(input || "").trim();
        if (!raw) return NaN;
        if (/Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) return Date.parse(raw);

        const normalized = raw.replace(" ", "T");
        const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/);
        if (!m) return Date.parse(raw);

        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const hour = Number(m[4] || 0);
        const minute = Number(m[5] || 0);
        const second = Number(m[6] || 0);

        return Date.UTC(year, month - 1, day, hour - 8, minute, second);
      };

      const toSqliteDT = (d) => {
        const dt = d instanceof Date ? d : new Date(d);
        if (Number.isNaN(dt.getTime())) return "";
        return dt.toISOString().slice(0, 19).replace("T", " ");
      };

      const taipeiYmdToUtcSql = (ymd, kind = "start") => {
        const raw = String(ymd || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
        const hh = kind === "end" ? 23 : 0;
        const mm = kind === "end" ? 59 : 0;
        const ss = kind === "end" ? 59 : 0;
        const utcMs = parseTaipeiDateTimeToUtcMs(
          `${raw} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
        );
        return Number.isFinite(utcMs) ? toSqliteDT(new Date(utcMs)) : "";
      };

      const toTaipeiStringFromUtc = (value) => {
        const raw = String(value || "").trim();
        if (!raw) return "";
        const normalized = /Z$/i.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z";
        const d = new Date(normalized);
        if (Number.isNaN(d.getTime())) {
          return raw.replace("T", " ").replace(/\.\d+Z?$/, "").replace("Z", "");
        }
        return formatInTaipei(d);
      };

const safeJson = async (req) => {
  const ct = (req.headers.get("Content-Type") || "").toLowerCase();
  if (!ct.includes("application/json")) return {};

  const text = await req.text(); // ⭐ 只讀一次
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    // 這裡回傳原文，方便你 debug
    throw new Error("INVALID_JSON_BODY: " + text);
  }
};

      const randToken = () => {
        const a = crypto.getRandomValues(new Uint8Array(16));
        return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
      };

      const getAuth = (req) => {
        const h = req.headers.get("Authorization") || "";
        const m = h.match(/^Bearer\s+(.+)$/i);
        return m ? m[1] : "";
      };

      const forbid = (msg = "Unauthorized", code = 401) =>
        json({ success: false, error: msg }, { status: code });

      const isSuperAdmin = (admin) => String(admin?.role || "") === "superadmin";

const normalizePositionKey = (raw = "") => {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  if (s) return s;
  return `pos_${Date.now().toString(36)}`;
};

const getPromotionPositionByKey = async (key) => {
  if (!key) return null;
  return await db
    .prepare(
      "SELECT id, position_key, position_label, sort, enabled, built_in FROM promotion_positions WHERE position_key=? LIMIT 1"
    )
    .bind(String(key).trim().toLowerCase())
    .first();
};

// ===== wallet helpers (0001) =====
const toInt = (v, fb = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fb;
};

const fetchUserRow = async (userId) => {
  return await db
    .prepare(
      "SELECT id, username, display_name, welfare_balance, discount_balance, s_balance, line_id, birthday, bank_holder, bank_name, bank_branch, bank_account, line_verified FROM users WHERE id=? LIMIT 1"
    )
    .bind(Number(userId))
    .first();
};

const insertWalletLog = async ({
  user_id,
  username,
  category,
  action,
  status = "success",
  delta_s = 0,
  delta_welfare = 0,
  delta_discount = 0,
  result = "",
  note = "",
  admin_account = "",
}) => {
  try {
    await db
      .prepare(
        `INSERT INTO wallet_logs
         (created_at, user_id, account, category, action, status, delta_s, delta_welfare, delta_discount, result, note, admin_account)
         VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(
        Number(user_id || 0),
        String(username || ""),
        String(category || ""),
        String(action || ""),
        String(status || ""),
        toInt(delta_s, 0),
        toInt(delta_welfare, 0),
        toInt(delta_discount, 0),
        String(result || ""),
        String(note || ""),
        admin_account ? String(admin_account) : null
      )
      .run();
  } catch (_) {
    // ignore log failure (do not break main flow)
  }
};

const applyWalletDelta = async ({
  userId,
  delta_s = 0,
  delta_welfare = 0,
  delta_discount = 0,
  category = "system",
  action = "update",
  note = "",
  admin_account = "",
  status = "success",
  result = "",
}) => {
  const u = await fetchUserRow(userId);
  if (!u) return { ok: false, error: "User not found" };

  const curS = toInt(u.s_balance, 0);
  const curW = toInt(u.welfare_balance, 0);
  const curD = toInt(u.discount_balance, 0);

  const nextS = curS + toInt(delta_s, 0);
  const nextW = curW + toInt(delta_welfare, 0);
  const nextD = curD + toInt(delta_discount, 0);

  if (nextS < 0) return { ok: false, error: "S幣不足" };
  if (nextW < 0) return { ok: false, error: "福利金不足" };
  if (nextD < 0) return { ok: false, error: "折抵金不足" };

  await db
    .prepare(
      "UPDATE users SET s_balance=?, welfare_balance=?, discount_balance=? WHERE id=?"
    )
    .bind(nextS, nextW, nextD, Number(userId))
    .run();

  await insertWalletLog({
    user_id: userId,
    username: u.username,
    category,
    action,
    status,
    delta_s,
    delta_welfare,
    delta_discount,
    result,
    note,
    admin_account,
  });

  return {
    ok: true,
    user: {
      id: Number(u.id),
      username: u.username,
      display_name: u.display_name || "",
      welfare_balance: nextW,
      discount_balance: nextD,
      s_balance: nextS,
    },
  };
};


      const activityEnabledNow = (actRow) => {
        if (!actRow) return false;
        if (Number(actRow.enabled || 0) !== 1) return false;
        const now = Date.now();
        const start = actRow.start_at ? parseTaipeiDateTimeToUtcMs(actRow.start_at) : NaN;
        const end = actRow.end_at ? parseTaipeiDateTimeToUtcMs(actRow.end_at) : NaN;
        if (Number.isFinite(start) && now < start) return false;
        if (Number.isFinite(end) && now > end) return false;
        return true;
      };

            // ✅ DB schema/seed 初始化：同一個 isolate 只跑一次（大幅加速）
      await ensureBootstrapped(db);


      const getCachedUserSession = async (token) => {
        const cacheKey = `user_session:${String(token || '')}`;
        const cached = hotCacheGet(cacheKey);
        if (cached) return cached;

        const sess = await db
          .prepare(
            `SELECT token, user_id, username, created_at
             FROM user_sessions
             WHERE token=?
             LIMIT 1`
          )
          .bind(token)
          .first();

        if (sess) hotCacheSet(cacheKey, sess, 2500);
        return sess || null;
      };

      const getCachedActivity = async (activityKey) => {
        const cacheKey = `activity:${String(activityKey || '')}`;
        const cached = hotCacheGet(cacheKey);
        if (cached) return cached;

        const row = await db
          .prepare("SELECT * FROM activities WHERE activity_key=? LIMIT 1")
          .bind(activityKey)
          .first();

        if (row) hotCacheSet(cacheKey, row, 2500);
        return row || null;
      };

      const getCachedRedpacketConfig = async () => {
        const cacheKey = "cfg:redpacket";
        const cached = hotCacheGet(cacheKey);
        if (cached) return cached;

        const row = await db
          .prepare("SELECT mode, fixed_amount, pool_json, count, allow_repeat, lock_when_all_opened FROM redpacket_config WHERE id=1 LIMIT 1")
          .first();

        return hotCacheSet(cacheKey, row || {}, 2500);
      };

      const getCachedWheelPrizes = async () => {
        const cacheKey = "cfg:wheel_prizes";
        const cached = hotCacheGet(cacheKey);
        if (cached) return cached;

        const prizesRes = await db
          .prepare("SELECT id, title, amount, weight, prize_type, prize_text, image_url, sort FROM wheel_prizes WHERE enabled=1 ORDER BY sort ASC, id ASC")
          .all();

        return hotCacheSet(cacheKey, prizesRes?.results || [], 2500);
      };

      /* =========================
       * Auth guards
       * ========================= */
      const requireAdmin = async () => {
        const token = getAuth(request);
        if (!token) return null;

        const sess = await db
          .prepare(
            `SELECT token, admin_id, role, username, created_at
             FROM admin_sessions
             WHERE token=?
             LIMIT 1`
          )
          .bind(token)
          .first();

        return sess || null;
      };

      const requireUser = async () => {
        const token = getAuth(request);
        if (!token) return null;
        return await getCachedUserSession(token);
      };

      const ensureUsageRow = async (userId, activityKey) => {
        const act = await getCachedActivity(activityKey);
        const limitDefault = Number(act?.default_times || 0);
        const now = nowIso();

        await db
          .prepare(
            `INSERT OR IGNORE INTO user_activity_usage (user_id, activity_key, times_left, updated_at)
             VALUES (?,?,?,?)`
          )
          .bind(userId, activityKey, limitDefault, now)
          .run();

        return await db
          .prepare(
            "SELECT user_id, activity_key, times_left, updated_at FROM user_activity_usage WHERE user_id=? AND activity_key=? LIMIT 1"
          )
          .bind(userId, activityKey)
          .first();
      };

      const decUsageIfPossible = async (userId, activityKey) => {
        const act = await getCachedActivity(activityKey);
        const limitDefault = Number(act?.default_times || 0);
        const now = nowIso();

        await db
          .prepare(
            `INSERT OR IGNORE INTO user_activity_usage (user_id, activity_key, times_left, updated_at)
             VALUES (?,?,?,?)`
          )
          .bind(userId, activityKey, limitDefault, now)
          .run();

        const upd = await db
          .prepare(
            "UPDATE user_activity_usage SET times_left = times_left - 1, updated_at=? WHERE user_id=? AND activity_key=? AND times_left > 0"
          )
          .bind(now, userId, activityKey)
          .run();

        if (Number(upd?.meta?.changes || 0) <= 0) {
          const row = await db
            .prepare(
              "SELECT times_left FROM user_activity_usage WHERE user_id=? AND activity_key=? LIMIT 1"
            )
            .bind(userId, activityKey)
            .first();
          return { ok: false, left: Math.max(0, Number(row?.times_left || 0)) };
        }

        const row = await db
          .prepare(
            "SELECT times_left FROM user_activity_usage WHERE user_id=? AND activity_key=? LIMIT 1"
          )
          .bind(userId, activityKey)
          .first();

        return { ok: true, left: Math.max(0, Number(row?.times_left || 0)) };
      };

      const addDrawRecord = async ({
  activity_key,
  user_id,
  username,
  status,        // "win" | "lose"
  prize_title = "",
  prize_amount = 0,
  note = "",
  meta = {},
}) => {
  await db
    .prepare(
      `INSERT INTO draw_records
       (activity_key, user_id, username, status, prize_title, prize_amount, note, meta_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
    )
    .bind(
      String(activity_key || ""),
      Number(user_id || 0),
      String(username || ""),
      String(status || "lose"),
      String(prize_title || ""),
      Number(prize_amount || 0),
      String(note || ""),
      JSON.stringify(meta || {})
    )
    .run();
};

// =========================
// helper: respondMe()
// GET /me or /auth/me
// =========================
const respondMe = async () => {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const userId = Number(sess.user_id);

const user = await db
  .prepare(
    `SELECT id, username, display_name,
            welfare_balance, discount_balance, s_balance,
            line_id, birthday, bank_holder, bank_name, bank_branch, bank_account,
            line_verified, num_authorized, uses_left, times_override,
            enabled, locked, created_by_admin_id
     FROM users
     WHERE id=?
     LIMIT 1`
  )
  .bind(userId)
  .first();

  if (!user) return forbid("User not found", 404);

  const DEFAULT_SUPPORT_LINE_URL = "https://lin.ee/nJbstol";

let support_line_url = DEFAULT_SUPPORT_LINE_URL;

if (Number(user.created_by_admin_id || 0) > 0) {
  const ownerAdmin = await db
    .prepare(
      "SELECT official_line_url FROM admin_accounts WHERE id=? LIMIT 1"
    )
    .bind(Number(user.created_by_admin_id))
    .first();

  const customLine = String(ownerAdmin?.official_line_url || "").trim();
  if (customLine) {
    support_line_url = customLine;
  }
}

  const actsRes = await db
    .prepare("SELECT activity_key, default_times, enabled FROM activities ORDER BY id ASC")
    .all();

  const usageRes = await db
    .prepare("SELECT activity_key, times_left FROM user_activity_usage WHERE user_id=?")
    .bind(Number(user.id))
    .all();

  const usageLeft = new Map(
    (usageRes?.results || []).map((r) => [r.activity_key, Number(r.times_left || 0)])
  );

  const limits = {};
  const used = {};

  for (const a of (actsRes?.results || [])) {
    const key = a.activity_key;
    const defaultLimit = Number(a.default_times || 0);
    const left = usageLeft.has(key) ? Number(usageLeft.get(key) || 0) : defaultLimit;

    const limit = Math.max(defaultLimit, left);
    limits[key] = limit;
    used[key] = Math.max(0, limit - left);
  }

return json({
  success: true,
  user: {
    id: Number(user.id || 0),
    username: String(user.username || ""),
    display_name: user.display_name || "",
    welfare_balance: Number(user.welfare_balance || 0),
    discount_balance: Number(user.discount_balance || 0),
    s_balance: Number(user.s_balance || 0),
    line_id: user.line_id || "",
    birthday: user.birthday || "",
    bank_holder: user.bank_holder || "",
    bank_name: user.bank_name || "",
    bank_branch: user.bank_branch || "",
    bank_account: user.bank_account || "",
    line_verified: Number(user.line_verified || 0),
    num_authorized: Number(user.num_authorized || 0),
    uses_left: Number(user.uses_left || 0),
    times_override: user.times_override === null ? null : Number(user.times_override || 0),
    enabled: Number(user.enabled || 0),
    locked: Number(user.locked || 0),
    created_by_admin_id: Number(user.created_by_admin_id || 0),
    support_line_url,
  },
  limits,
  used,
});
};

      /* =========================
       * Routes
       * ========================= */
      if (url.pathname === "/" && request.method === "GET") return text("OK");

      // PUBLIC activities
      if (url.pathname === "/activities" && request.method === "GET") {
        const rows = await db
          .prepare(
            "SELECT activity_key, activity_name, enabled, default_times, start_at, end_at, updated_at FROM activities ORDER BY id ASC"
          )
          .all();
        return json({ success: true, activities: rows?.results || [] });
      }

// =========================
// SHOP (public): products list
// GET /shop/products?category=折抵金&all=1
// - 預設只回 enabled=1 & deleted=0
// - 若帶 all=1（之後你要給後台用也行）就回全部
// =========================
if (url.pathname === "/shop/products" && request.method === "GET") {
  const category = String(url.searchParams.get("category") || "").trim();
  const all = String(url.searchParams.get("all") || "0").trim() === "1";

  let sql = `
    SELECT id, name, image_url, cost_s, category, enabled, deleted, sort, updated_at, created_at
    FROM shop_products
    WHERE 1=1
  `;
  const binds = [];

  if (!all) {
    sql += " AND enabled=1 AND deleted=0";
  }

  if (category) {
    sql += " AND category=?";
    binds.push(category);
  }

  sql += " ORDER BY sort ASC, datetime(created_at) DESC";

  const rows = binds.length
    ? await db.prepare(sql).bind(...binds).all()
    : await db.prepare(sql).all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: String(r.id),
      name: String(r.name || ""),
      image_url: String(r.image_url || ""),
      cost_s: Number(r.cost_s || 0),
      category: String(r.category || ""),
      enabled: Number(r.enabled || 0),
      deleted: Number(r.deleted || 0),
      sort: Number(r.sort || 0),
      updated_at: toTaipeiStringFromUtc(r.updated_at),
      created_at: toTaipeiStringFromUtc(r.created_at),
    })),
  });
}

// =========================
// SHOP (public): config
// GET /shop/config -> { marquee_text: "..." }
// =========================
if (url.pathname === "/shop/config" && request.method === "GET") {
  const row = await db
    .prepare("SELECT value FROM shop_config WHERE key='marquee_text' LIMIT 1")
    .first();

  return json({
    success: true,
    marquee_text: String(row?.value || ""),
  });
}   

// PUBLIC promotion positions
// GET /promotion-positions
if (url.pathname === "/promotion-positions" && request.method === "GET") {
  const rows = await db
    .prepare(
      `SELECT id, position_key, position_label, sort, enabled
       FROM promotion_positions
       WHERE enabled=1
       ORDER BY sort ASC, id ASC`
    )
    .all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: Number(r.id || 0),
      position_key: String(r.position_key || ""),
      position_label: String(r.position_label || ""),
      sort: Number(r.sort || 0),
      enabled: Number(r.enabled || 0),
    })),
  });
}

// PUBLIC promotions
// GET /promotions?placement=xxx -> 前台「優惠內容」列表用（只回 enabled=1）
if (url.pathname === "/promotions" && request.method === "GET") {
  const placement = String(url.searchParams.get("placement") || "")
    .trim()
    .toLowerCase();

  let sql = `
    SELECT id, title, cover_image_url, content_html, placement, enabled, sort, updated_at, created_at
    FROM promotions
    WHERE enabled=1
  `;
  const binds = [];

  if (placement) {
    sql += ` AND placement=?`;
    binds.push(placement);
  }

  sql += ` ORDER BY sort ASC, id ASC`;

  const stmt = db.prepare(sql);
  const rows = binds.length ? await stmt.bind(...binds).all() : await stmt.all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: Number(r.id || 0),
      title: String(r.title || ""),
      cover_image_url: String(r.cover_image_url || ""),
      content_html: String(r.content_html || ""),
      placement: String(r.placement || ""),
      enabled: Number(r.enabled || 0),
      sort: Number(r.sort || 0),
      updated_at: toTaipeiStringFromUtc(r.updated_at),
    })),
  });
}

// =========================
// PUBLIC: support line
// GET /support/line
// =========================
if (url.pathname === "/support/line" && request.method === "GET") {

  const row = await db
    .prepare(
      "SELECT official_line_url FROM admin_accounts WHERE role='superadmin' LIMIT 1"
    )
    .first();

  return json({
    success: true,
    url: row?.official_line_url || ""
  });
}

// =========================
// public: serve R2 file
// GET /r2/<key>
// =========================
if (url.pathname.startsWith("/r2/") && request.method === "GET") {
  const bucket = env.RAFFLE_R2;
  if (!bucket) {
    return json({ success: false, error: "R2 binding missing" }, { status: 500 });
  }

  const key = decodeURIComponent(url.pathname.slice("/r2/".length));
  if (!key) return json({ success: false, error: "bad key" }, { status: 400 });

  const object = await bucket.get(key);
  if (!object) return json({ success: false, error: "Not found" }, { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return applyCors(new Response(object.body, { headers }));
}

// =========================
// AUTH: admin login
// =========================
if (url.pathname === "/auth/admin/login" && request.method === "POST") {
  // ✅ 兼容：就算 Content-Type 沒寫/寫錯，也盡量解析 JSON（避免 Windows curl/PS 出怪）
  const ct = (request.headers.get("Content-Type") || "").toLowerCase();

  // 先把 raw 讀出來（只讀一次），再自己 parse
  const raw = await request.text();

  let body = {};
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch (e) {
      // 嘗試容錯：有些情況會送成 {username:aaa,password:bbb}
      // 這不是標準 JSON，但我們盡量救回來（僅限簡單 key/value）
      try {
        const fixed = raw
          .trim()
          // 把 {username:superadmin,password:123456} 變成 {"username":"superadmin","password":"123456"}
          .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/:\s*([A-Za-z0-9_@.\-]+)\s*([,}])/g, ':"$1"$2');
        body = JSON.parse(fixed);
      } catch {
        return json(
          {
            success: false,
            error: "INVALID_JSON_BODY",
            hint:
              "請確認送的是合法 JSON。PowerShell 建議用 ConvertTo-Json 或 curl.exe --data-raw \"{\\\"username\\\":\\\"...\\\"}\"",
            raw,
            contentType: ct,
          },
          { status: 400 }
        );
      }
    }
  }

  const username = String(body.username || body.account || body.id || "").trim();
  const password = String(body.password ?? "").trim();

  if (!username || !password) {
    return json({ success: false, error: "帳號或密碼錯誤" }, { status: 401 });
  }

  // ✅ 正確：admin 要查 admin_accounts（不是 users）
  const acc = await db
    .prepare(
      "SELECT id, username, password, role, status FROM admin_accounts WHERE username=? LIMIT 1"
    )
    .bind(username)
    .first();

  if (!acc || String(acc.password || "") !== password) {
    return json({ success: false, error: "帳號或密碼錯誤" }, { status: 401 });
  }

  const st = String(acc.status || "").trim().toLowerCase();
  if (st && st !== "active" && st !== "enabled") {
    return json({ success: false, error: "帳號已停用" }, { status: 403 });
  }

  // ✅ 發 token（沿用你原本系統的 tokens/admin_sessions 機制）
  const token = randToken();
  await db
    .prepare(
      "INSERT INTO admin_sessions (token, admin_id, username, role, created_at) VALUES (?,?,?,?,datetime('now'))"
    )
    .bind(token, Number(acc.id), String(acc.username), String(acc.role || "admin"))
    .run();

  return json({
    success: true,
    token,
    admin: {
      id: Number(acc.id),
      username: String(acc.username),
      role: String(acc.role || "admin"),
    },
  });
}

      // =========================
// USER: get my referral code
// GET /referral/code
// =========================
if (url.pathname === "/referral/code" && request.method === "GET") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const userId = Number(sess.user_id);

  let row = await db
    .prepare("SELECT user_id, code FROM referral_codes WHERE user_id=? LIMIT 1")
    .bind(userId)
    .first();

  if (!row) {
    // 產生一組短碼（10 碼 hex）
    const code = randToken().slice(0, 10);
    await db
      .prepare("INSERT INTO referral_codes (user_id, code, created_at) VALUES (?,?,datetime('now'))")
      .bind(userId, code)
      .run();

    row = await db
      .prepare("SELECT user_id, code FROM referral_codes WHERE user_id=? LIMIT 1")
      .bind(userId)
      .first();
  }

  return json({ success: true, code: row.code });
}

/* =========================
   GET /referral/my
   取得我的推薦統計
========================= */
if (url.pathname === "/referral/my" && request.method === "GET") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const userId = Number(sess.user_id || 0);
  if (!userId) return json({ success: false, error: "Bad session user_id" }, { status: 401 });

  // 推薦總數
  const totalRow = await db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM referrals
       WHERE referrer_user_id = ?`
    )
    .bind(userId)
    .first();

  // 推薦名單
  const listRes = await db
    .prepare(
      `SELECT u.username, r.created_at
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
       WHERE r.referrer_user_id = ?
       ORDER BY r.id DESC`
    )
    .bind(userId)
    .all();

return json({
  success: true,
  total: Number(totalRow?.total || 0),
  list: (listRes?.results || []).map((r) => ({
    username: r.username,
    created_at: toTaipeiStringFromUtc(r.created_at),
  })),
});
}

// =========================
// AUTH: user register (public)
// POST /auth/user/register
// body: { username, password, display_name, ref_code }
// =========================
if (url.pathname === "/auth/user/register" && request.method === "POST") {
  const body = await safeJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();
  const display_name = String(body.display_name || body.name || "").trim();
  const ref_code = String(
  body.referral_code || body.ref_code || body.ref || ""
).trim();

  if (!username || !password) {
    return json({ success: false, error: "缺少帳號或密碼" }, { status: 400 });
  }
  if (username.length < 3 || password.length < 3) {
    return json({ success: false, error: "帳號/密碼長度不足" }, { status: 400 });
  }

  // 帳號不能重複
  const exists = await db
    .prepare("SELECT id FROM users WHERE username=? LIMIT 1")
    .bind(username)
    .first();
  if (exists) {
    return json({ success: false, error: "此帳號已存在" }, { status: 409 });
  }

  // 建立 user
await db
  .prepare(
    `INSERT INTO users
      (username, password, display_name, welfare_balance, num_authorized, uses_left,
       times_override, enabled, locked, created_by_admin_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`
  )
  .bind(
    username,
    password,
    display_name,
    0,          // welfare_balance
    0,          // num_authorized
    0,          // uses_left
    null,       // times_override
    1,          // enabled
    0,          // locked
    null        // created_by_admin_id（public register 沒有 admin）
  )
  .run()
    .catch(() => null);

  // 上面那段若你覺得 bind 奇怪，請用下面這段更乾淨（建議你用這段）
  // await db.prepare(
  //   `INSERT INTO users
  //    (username, password, display_name, welfare_balance, s_balance, num_authorized, uses_left, times_override, enabled, locked, created_by_admin_id, created_at)
  //    VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))`
  // ).bind(username, password, display_name, 0, 0, 0, null, 1, 0, null).run();

  const newUser = await db
    .prepare("SELECT id, username FROM users WHERE username=? LIMIT 1")
    .bind(username)
    .first();

  const newUserId = Number(newUser?.id || 0);
  if (!newUserId) {
    return json({ success: false, error: "註冊失敗" }, { status: 500 });
  }

  // 若帶 ref_code：給推薦人獎勵
  let refRewarded = false;
  if (ref_code) {
    const refRow = await db
      .prepare(
        `SELECT rc.user_id AS referrer_user_id, u.username AS referrer_username
         FROM referral_codes rc
         JOIN users u ON u.id = rc.user_id
         WHERE rc.code=?
         LIMIT 1`
      )
      .bind(ref_code)
      .first();

    const referrerId = Number(refRow?.referrer_user_id || 0);

    // 不能自推（雖然新註冊通常不會）
    if (referrerId > 0 && referrerId !== newUserId) {
      // 確保這個新用戶沒有被綁過（referred_user_id UNIQUE）
      const already = await db
        .prepare("SELECT id FROM referrals WHERE referred_user_id=? LIMIT 1")
        .bind(newUserId)
        .first();

      if (!already) {
        await db
          .prepare(
            "INSERT INTO referrals (referrer_user_id, referred_user_id, code, created_at) VALUES (?,?,?,datetime('now'))"
          )
          .bind(referrerId, newUserId, ref_code)
          .run();

        // ✅ 推薦人獎勵：紅包 +1、輪盤 +1
        await ensureUsageRow(referrerId, "redpacket");
        await ensureUsageRow(referrerId, "wheel");

        await db
          .prepare(
            "UPDATE user_activity_usage SET times_left = times_left + 1, updated_at=? WHERE user_id=? AND activity_key='redpacket'"
          )
          .bind(nowIso(), referrerId)
          .run();

        await db
          .prepare(
            "UPDATE user_activity_usage SET times_left = times_left + 1, updated_at=? WHERE user_id=? AND activity_key='wheel'"
          )
          .bind(nowIso(), referrerId)
          .run();

        // （可選）把「推薦獎勵」寫進 draw_records，方便你在紀錄看到
        await addDrawRecord({
          activity_key: "redpacket",
          user_id: referrerId,
          username: String(refRow?.referrer_username || ""),
          status: "win",
          prize_title: "推薦獎勵-紅包次數+1",
          prize_amount: 0,
          note: "referral_bonus",
          meta: { ref_code, referred_user: username },
        });

        await addDrawRecord({
          activity_key: "wheel",
          user_id: referrerId,
          username: String(refRow?.referrer_username || ""),
          status: "win",
          prize_title: "推薦獎勵-輪盤次數+1",
          prize_amount: 0,
          note: "referral_bonus",
          meta: { ref_code, referred_user: username },
        });

        refRewarded = true;
      }
    }
  }

  return json({
    success: true,
    user: { id: newUserId, username },
    referral: { applied: !!ref_code, rewarded: refRewarded },
  });
}

// =========================
// AUTH: user login
// =========================
if (url.pathname === "/auth/user/login" && request.method === "POST") {
  const body = await safeJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "").trim();

  if (!username || !password) {
    return json({ success: false, error: "帳號或密碼錯誤" }, { status: 401 });
  }

  // ✅ 用 username 查，而且要 SELECT password 才能比對
  const user = await db
    .prepare(
      `SELECT id, username, password, display_name,
              welfare_balance, discount_balance, s_balance,
              line_id, birthday, bank_holder, bank_name, bank_branch, bank_account,
              line_verified, num_authorized, uses_left, times_override,
              enabled, locked
       FROM users
       WHERE username=?
       LIMIT 1`
    )
    .bind(username)
    .first();

  if (!user || String(user.password || "") !== password) {
    return json({ success: false, error: "帳號或密碼錯誤" }, { status: 401 });
  }
  if (Number(user.enabled || 0) !== 1) {
    return json({ success: false, error: "帳號已停用" }, { status: 403 });
  }
  if (Number(user.locked || 0) === 1) {
    return json({ success: false, error: "帳號已鎖定" }, { status: 403 });
  }

  const token = randToken();
  await db
    .prepare(
      "INSERT INTO user_sessions (token, user_id, username, created_at) VALUES (?,?,?,datetime('now'))"
    )
    .bind(token, Number(user.id), String(user.username))
    .run();

  return json({
    success: true,
    token,
    user: {
      user_id: Number(user.id),
      username: user.username,
      display_name: user.display_name || "",
      welfare_balance: Number(user.welfare_balance || 0),
      discount_balance: Number(user.discount_balance || 0),
      s_balance: Number(user.s_balance || 0),
      line_id: user.line_id || "",
      birthday: user.birthday || "",
      bank_holder: user.bank_holder || "",
      bank_name: user.bank_name || "",
      bank_branch: user.bank_branch || "",
      bank_account: user.bank_account || "",
      line_verified: Number(user.line_verified || 0),
      num_authorized: Number(user.num_authorized || 0),
      uses_left: Number(user.uses_left || 0),
      times_override: user.times_override === null ? null : Number(user.times_override || 0),
    },
  });
}

      // ME (user)

     if ((url.pathname === "/me" || url.pathname === "/auth/me") && request.method === "GET") {
        return await respondMe();
      }


      

// ===== Profile (one-time editable) =====
if (url.pathname === "/user/profile" && request.method === "PATCH") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const body = await safeJson(request);
  console.log("PATCH /user/profile body =", body);

  const patch = {
    line_id: String(body.line_id || "").trim(),
    birthday: String(body.birthday || "").trim(),
    bank_holder: String(body.bank_holder || "").trim(),
    bank_name: String(body.bank_name || "").trim(),
    bank_branch: String(body.bank_branch || "").trim(),
    bank_account: String(body.bank_account || "").trim(),
  };

  console.log("PATCH /user/profile patch =", patch);

  const u = await fetchUserRow(sess.user_id);
  if (!u) return forbid("User not found", 404);

  const updates = [];
  const binds = [];

  const canSetOnce = (col, val) => {
    if (!val) return;
    const cur = String(u[col] || "").trim();
    if (!cur) {
      updates.push(`${col}=?`);
      binds.push(val);
    } else if (cur !== val) {
      throw new Error(`${col}_LOCKED`);
    }
  };

  try {
    canSetOnce("line_id", patch.line_id);

    if (patch.birthday) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.birthday)) {
        return json({ success: false, error: "生日格式需為 YYYY-MM-DD" }, { status: 400 });
      }
      canSetOnce("birthday", patch.birthday);
    }

    canSetOnce("bank_holder", patch.bank_holder);
    canSetOnce("bank_name", patch.bank_name);
    canSetOnce("bank_branch", patch.bank_branch);
    canSetOnce("bank_account", patch.bank_account);
  } catch (e) {
    const msg = String(e?.message || "");
    if (msg === "line_id_LOCKED") return json({ success: false, error: "LINE ID 已鎖定，無法修改" }, { status: 400 });
    if (msg === "birthday_LOCKED") return json({ success: false, error: "生日已鎖定，無法修改" }, { status: 400 });
    if (msg.startsWith("bank_") && msg.endsWith("_LOCKED")) return json({ success: false, error: "銀行資料已鎖定，無法修改" }, { status: 400 });
    return json({ success: false, error: "更新失敗" }, { status: 500 });
  }

  console.log("PATCH /user/profile updates =", updates, binds);

  if (!updates.length) {
    return json({ success: true, message: "沒有可更新的欄位（已鎖定或空值）" });
  }

  await db
    .prepare(`UPDATE users SET ${updates.join(", ")} WHERE id=?`)
    .bind(...binds, Number(u.id))
    .run();

  return await respondMe();
}

// ===== User wallet logs =====
if (url.pathname === "/wallet/logs" && request.method === "GET") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 90)));
  const rows = await db
    .prepare(
      `SELECT id, created_at, category, action, status, delta_s, delta_welfare, delta_discount, result, note
       FROM wallet_logs
       WHERE user_id=? AND created_at >= datetime('now', ?)
       ORDER BY id DESC
       LIMIT 300`
    )
    .bind(Number(sess.user_id), `-${days} day`)
    .all();

  return json({ success: true, items: rows?.results || [] });
}

// ===== Shop redeem (deduct S幣) =====
if (url.pathname === "/shop/redeem" && request.method === "POST") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const body = await safeJson(request);
  const productId = String(body.product_id || body.id || "").trim();
  if (!productId) return json({ success: false, error: "product_id required" }, { status: 400 });

  const prod = await db
    .prepare("SELECT id, name, cost_s, reward_discount, reward_welfare, enabled, deleted FROM shop_products WHERE id=? LIMIT 1")
    .bind(productId)
    .first();

  if (!prod || Number(prod.deleted || 0) === 1 || Number(prod.enabled || 0) !== 1) {
    return json({ success: false, error: "商品不存在或已下架" }, { status: 404 });
  }

  const cost = Number(prod.cost_s || 0);
  if (cost <= 0) return json({ success: false, error: "商品成本異常" }, { status: 400 });

  const u = await fetchUserRow(sess.user_id);
  if (!u) return forbid("User not found", 404);

  // 扣 S 幣
const r = await applyWalletDelta({
  userId: Number(u.id),
  delta_s: -cost,
  delta_welfare: Number(prod.reward_welfare || 0),
  delta_discount: Number(prod.reward_discount || 0),
  category: "shop",
  action: "redeem",
  note: `兌換：${prod.name}`,
  result: `扣除 S幣 ${cost}，獲得折抵金 ${prod.reward_discount || 0} 福利金 ${prod.reward_welfare || 0}`,
});

  const ok = !!r.ok;
  await db
    .prepare(
      `INSERT INTO shop_orders (created_at, user_id, username, product_id, product_name, cost_s, status, note)
       VALUES (datetime('now'),?,?,?,?,?,?,?)`
    )
    .bind(
      Number(u.id),
      String(u.username),
      String(prod.id),
      String(prod.name),
      cost,
      ok ? "success" : "fail",
      ok ? "" : String(r.error || "redeem failed")
    )
    .run();

  if (!ok) {
    // 失敗也寫一筆 wallet log（若 applyWalletDelta 因不足提前 return，log 不會寫）
    await insertWalletLog({
      user_id: u.id,
      username: u.username,
      category: "shop",
      action: "redeem",
      status: "fail",
      delta_s: 0,
      delta_welfare: 0,
      delta_discount: 0,
      result: "兌換失敗",
      note: `兌換：${prod.name}（${String(r.error || "fail")}）`,
    });

    return json({ success: false, error: r.error || "兌換失敗" }, { status: 400 });
  }

  return json({ success: true, order: { product_id: prod.id, name: prod.name, cost_s: cost }, me: r.user });
}

// ===== Shop orders (user) =====
if (url.pathname === "/shop/orders" && request.method === "GET") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 90)));
  const rows = await db
    .prepare(
      `SELECT id, created_at, product_id, product_name, cost_s, status, note
       FROM shop_orders
       WHERE user_id=? AND created_at >= datetime('now', ?)
       ORDER BY id DESC
       LIMIT 300`
    )
    .bind(Number(sess.user_id), `-${days} day`)
    .all();

  return json({ success: true, items: rows?.results || [] });
}

/* =========================
       * ADMIN guard
       * ========================= */
      const isAdminRoute =
        url.pathname.startsWith("/admin/") || url.pathname.startsWith("/auth/admin/");
      const admin = isAdminRoute ? await requireAdmin() : null;

// ===== ADMIN: shop orders (all users) =====
if (url.pathname === "/admin/shop/orders" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 90)));

  const rows = await db
    .prepare(
      `SELECT id, created_at, user_id, username,
              product_id, product_name, cost_s,
              status, note, reviewed
       FROM shop_orders
       WHERE created_at >= datetime('now', ?)
       ORDER BY id DESC
       LIMIT 500`
    )
    .bind(`-${days} day`)
    .all();

  return json({
    success: true,
    items: rows?.results || [],
  });
}

// ===== ADMIN: toggle shop order review =====
if (
  url.pathname.startsWith("/admin/shop/orders/") &&
  url.pathname.endsWith("/review") &&
  request.method === "POST"
) {
  if (!admin) return forbid("Unauthorized", 401);

  const parts = url.pathname.split("/").filter(Boolean);
  const id = Number(parts[3] || 0);

  if (!id) {
    return json({ success: false, error: "bad order id" }, { status: 400 });
  }

  const row = await db
    .prepare("SELECT id, reviewed FROM shop_orders WHERE id=? LIMIT 1")
    .bind(id)
    .first();

  if (!row) {
    return json({ success: false, error: "order not found" }, { status: 404 });
  }

  const nextReviewed = Number(row.reviewed || 0) === 1 ? 0 : 1;

  await db
    .prepare("UPDATE shop_orders SET reviewed=? WHERE id=?")
    .bind(nextReviewed, id)
    .run();

  return json({
    success: true,
    id,
    reviewed: nextReviewed,
  });
}

// =========================
// ADMIN: universal R2 upload
// POST /admin/r2/upload?dir=promotions|shop|wheel|misc
// multipart/form-data: file
// return: { url: "/r2/<key>" }
// =========================
if (url.pathname === "/admin/r2/upload" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const bucket = env.RAFFLE_R2;
  if (!bucket) {
    return json({ success: false, error: "R2 binding missing" }, { status: 500 });
  }

  const dirRaw = String(url.searchParams.get("dir") || "misc").trim().toLowerCase();
  const dir =
    dirRaw === "promotions" || dirRaw === "shop" || dirRaw === "wheel"
      ? dirRaw
      : "misc";

  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    return json(
      { success: false, error: "請用 multipart/form-data 上傳（不要手動設 Content-Type）" },
      { status: 415 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json(
      {
        success: false,
        error: "Bad multipart/form-data（請確認前端不要手動設定 Content-Type）",
        detail: String(e?.message || e),
      },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return json({ success: false, error: "file required" }, { status: 400 });
  }

  const origName = String(file.name || "upload.bin");
  const ext = origName.includes(".") ? origName.split(".").pop() : "bin";
  const key = `${dir}/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return json({ success: true, key, url: `/r2/${key}` });
}

// =========================
// SHOP (admin): upload product image to R2
// POST /admin/shop/upload
// multipart/form-data: file
// =========================
if (url.pathname === "/admin/shop/upload" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const bucket = env.RAFFLE_R2;
  if (!bucket) {
    return json({ success: false, error: "R2 binding missing" }, { status: 500 });
  }

  const ct = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!ct.includes("multipart/form-data")) {
    return json(
      { success: false, error: "請用 multipart/form-data 上傳（不要手動設 Content-Type）" },
      { status: 415 }
    );
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return json(
      {
        success: false,
        error: "Bad multipart/form-data（請確認前端不要手動設定 Content-Type）",
        detail: String(e?.message || e),
      },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return json({ success: false, error: "file required" }, { status: 400 });
  }

  const origName = String(file.name || "upload.bin");
  const ext = origName.includes(".") ? origName.split(".").pop() : "bin";
  const key = `shop/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  await bucket.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  return json({ success: true, key, url: `/r2/${key}` });
}

// =========================
// SHOP (admin): list products
// GET /admin/shop/products
// =========================
if (url.pathname === "/admin/shop/products" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

  const rows = await db
    .prepare(
      `SELECT id, name, image_url, cost_s, category, enabled, deleted, sort, updated_at, created_at
       FROM shop_products
       ORDER BY sort ASC, datetime(created_at) DESC`
    )
    .all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: String(r.id || ""),
      name: String(r.name || ""),
      image_url: String(r.image_url || ""),
      cost_s: Number(r.cost_s || 0),
      category: String(r.category || ""),
      enabled: Number(r.enabled || 0),
      deleted: Number(r.deleted || 0),
      sort: Number(r.sort || 0),
      updated_at: toTaipeiStringFromUtc(r.updated_at),
      created_at: toTaipeiStringFromUtc(r.created_at),
    })),
  });
}

// =========================
// SHOP (admin): create product
// POST /admin/shop/products
// body: { id?, name, image_url, cost_s, category, enabled?, sort? }
// =========================
if (url.pathname === "/admin/shop/products" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const body = await safeJson(request);

const id = String(body.id || crypto.randomUUID());
const name = String(body.name || "").trim();
const image_url = String(body.image_url || "").trim();
const cost_s = Number(body.cost_s || 0);
const category = String(body.category || "").trim();
const enabled = Number(body.enabled ?? 1) ? 1 : 0;
const sort = Number(body.sort || 0);
const reward_discount = Math.max(0, Math.floor(Number(body.reward_discount || 0)));
const reward_welfare = Math.max(0, Math.floor(Number(body.reward_welfare || 0)));

  if (!name) return json({ success: false, error: "name required" }, { status: 400 });
  if (!category) return json({ success: false, error: "category required" }, { status: 400 });

  await db
    .prepare(
      `INSERT INTO shop_products
(id, name, image_url, cost_s, category, reward_discount, reward_welfare, enabled, deleted, sort, created_at, updated_at)
VALUES (?,?,?,?,?,?,?, ?,0,?,datetime('now'),datetime('now'))`
    )
    .bind(
  id,
  name,
  image_url,
  Math.max(0, Math.floor(cost_s)),
  category,
  reward_discount,
  reward_welfare,
  enabled,
  sort
)
    .run();

  return json({ success: true, id });
}

// =========================
// SHOP (admin): update product
// PATCH /admin/shop/products/:id
// body: any fields
// =========================
if (url.pathname.startsWith("/admin/shop/products/") && request.method === "PATCH") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!id) return json({ success: false, error: "bad id" }, { status: 400 });

  const body = await safeJson(request);

  const fields = [];
  const binds = [];

  const setIf = (k, v) => {
    fields.push(`${k}=?`);
    binds.push(v);
  };

  if (body.name !== undefined) setIf("name", String(body.name || "").trim());
  if (body.image_url !== undefined) setIf("image_url", String(body.image_url || "").trim());
  if (body.cost_s !== undefined) setIf("cost_s", Math.max(0, Math.floor(Number(body.cost_s || 0))));
  if (body.category !== undefined) setIf("category", String(body.category || "").trim());
  if (body.enabled !== undefined) setIf("enabled", Number(body.enabled) ? 1 : 0);
  if (body.deleted !== undefined) setIf("deleted", Number(body.deleted) ? 1 : 0);
  if (body.sort !== undefined) setIf("sort", Number(body.sort || 0));

  if (!fields.length) return json({ success: true });

  binds.push(id);

  await db
    .prepare(
      `UPDATE shop_products
       SET ${fields.join(", ")}, updated_at=datetime('now')
       WHERE id=?`
    )
    .bind(...binds)
    .run();

  return json({ success: true });
}

// =========================
// SHOP (admin): "delete" product (soft delete)
// DELETE /admin/shop/products/:id
// =========================
if (url.pathname.startsWith("/admin/shop/products/") && request.method === "DELETE") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!id) return json({ success: false, error: "bad id" }, { status: 400 });

  // 你需求是「啟用/刪除按鈕」：這裡用軟刪除 deleted=1
  await db
    .prepare("UPDATE shop_products SET deleted=1, updated_at=datetime('now') WHERE id=?")
    .bind(id)
    .run();

  return json({ success: true });
}

// ==========================
// ADMIN: POST /admin/shop/config
// ==========================
if (url.pathname === "/admin/shop/config" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const body = await safeJson(request);
  const marquee_text = String(body.marquee_text || "").trim();

  await db
    .prepare(`
      INSERT INTO shop_config (key, value, updated_at)
      VALUES ('marquee_text', ?, datetime('now'))
      ON CONFLICT(key)
      DO UPDATE SET
        value=excluded.value,
        updated_at=datetime('now')
    `)
    .bind(marquee_text)
    .run();

  return json({ success: true });
}

// =========================
// SHOP (admin): get config (marquee)
// GET /admin/shop/config
// =========================
if (url.pathname === "/admin/shop/config" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

  const row = await db
    .prepare("SELECT value FROM shop_config WHERE key='marquee_text' LIMIT 1")
    .first();

  return json({ success: true, marquee_text: String(row?.value || "") });
}

// admin: promotion positions list
if (url.pathname === "/admin/promotion-positions" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

  const rows = await db
    .prepare(
      `SELECT
         pp.id,
         pp.position_key,
         pp.position_label,
         pp.sort,
         pp.enabled,
         pp.built_in,
         pp.updated_at,
         pp.created_at,
         COUNT(p.id) AS promotion_count
       FROM promotion_positions pp
       LEFT JOIN promotions p
         ON p.placement = pp.position_key
       GROUP BY
         pp.id, pp.position_key, pp.position_label, pp.sort, pp.enabled, pp.built_in, pp.updated_at, pp.created_at
       ORDER BY pp.sort ASC, pp.id ASC`
    )
    .all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: Number(r.id || 0),
      position_key: String(r.position_key || ""),
      position_label: String(r.position_label || ""),
      sort: Number(r.sort || 0),
      enabled: Number(r.enabled || 0),
      built_in: Number(r.built_in || 0),
      promotion_count: Number(r.promotion_count || 0),
      updated_at: toTaipeiStringFromUtc(r.updated_at),
      created_at: toTaipeiStringFromUtc(r.created_at),
    })),
  });
}

// admin: create promotion position
if (url.pathname === "/admin/promotion-positions" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const body = await safeJson(request);
  const position_label = String(body.position_label || body.label || "").trim();
  let position_key = normalizePositionKey(body.position_key || body.key || "");
  const sort = Number(body.sort || 0);

  if (!position_label) {
    return json({ success: false, error: "position_label required" }, { status: 400 });
  }

  let exists = await getPromotionPositionByKey(position_key);
  if (exists) {
    position_key = `pos_${Date.now().toString(36)}`;
  }

  await db
    .prepare(
      `INSERT INTO promotion_positions
       (position_key, position_label, sort, enabled, built_in, updated_at, created_at)
       VALUES (?, ?, ?, 1, 0, datetime('now'), datetime('now'))`
    )
    .bind(position_key, position_label, sort)
    .run();

  return json({ success: true });
}

// admin: update promotion position
if (url.pathname.startsWith("/admin/promotion-positions/") && request.method === "PATCH") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = Number(url.pathname.split("/").pop() || 0);
  if (!id) return json({ success: false, error: "bad id" }, { status: 400 });

  const body = await safeJson(request);

  const cur = await db
    .prepare("SELECT id, position_key, built_in FROM promotion_positions WHERE id=? LIMIT 1")
    .bind(id)
    .first();

  if (!cur) {
    return json({ success: false, error: "position not found" }, { status: 404 });
  }

  const fields = [];
  const binds = [];

  const setIf = (k, v) => {
    fields.push(`${k}=?`);
    binds.push(v);
  };

  if (body.position_label !== undefined) {
    const label = String(body.position_label || "").trim();
    if (!label) {
      return json({ success: false, error: "position_label required" }, { status: 400 });
    }
    setIf("position_label", label);
  }

  if (body.sort !== undefined) {
    setIf("sort", Number(body.sort || 0));
  }

  if (body.enabled !== undefined) {
    setIf("enabled", Number(body.enabled) ? 1 : 0);
  }

  if (!fields.length) return json({ success: true });

  binds.push(id);

  await db
    .prepare(
      `UPDATE promotion_positions
       SET ${fields.join(", ")}, updated_at=datetime('now')
       WHERE id=?`
    )
    .bind(...binds)
    .run();

  return json({ success: true });
}

// admin: delete promotion position
if (url.pathname.startsWith("/admin/promotion-positions/") && request.method === "DELETE") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = Number(url.pathname.split("/").pop() || 0);
  if (!id) return json({ success: false, error: "bad id" }, { status: 400 });

  const cur = await db
    .prepare(
      "SELECT id, position_key, position_label, built_in FROM promotion_positions WHERE id=? LIMIT 1"
    )
    .bind(id)
    .first();

  if (!cur) {
    return json({ success: false, error: "position not found" }, { status: 404 });
  }

  if (Number(cur.built_in || 0) === 1) {
    return json({ success: false, error: "內建位置不可刪除" }, { status: 400 });
  }

  const used = await db
    .prepare("SELECT COUNT(*) AS c FROM promotions WHERE placement=?")
    .bind(String(cur.position_key || ""))
    .first();

  if (Number(used?.c || 0) > 0) {
    return json(
      { success: false, error: "此位置底下還有優惠，請先移除或改到其他位置後再刪除" },
      { status: 400 }
    );
  }

  await db
    .prepare("DELETE FROM promotion_positions WHERE id=?")
    .bind(id)
    .run();

  return json({ success: true });
}

// =========================
// admin: upload promotion image to R2
// POST /admin/promotions/upload
// form-data: file
// =========================
// =========================
// admin: upload promotion image to R2
// POST /admin/promotions/upload
// - multipart/form-data: file
// - OR application/json: { filename, contentType, base64 }  (base64 可含 dataURL)
// =========================
if (url.pathname === "/admin/promotions/upload" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const bucket = env.RAFFLE_R2;
  if (!bucket) {
    return json({ success: false, error: "R2 binding missing" }, { status: 500 });
  }

  const ct = (request.headers.get("Content-Type") || "").toLowerCase();

  // 1) multipart/form-data（正常上傳）
  if (ct.includes("multipart/form-data")) {
    let formData;
    try {
      formData = await request.formData();
    } catch (e) {
      return json(
        {
          success: false,
          error:
            "Bad multipart/form-data. 請確認前端不要手動設定 Content-Type，讓瀏覽器自動帶 boundary。",
          detail: String(e?.message || e),
        },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return json({ success: false, error: "file required" }, { status: 400 });
    }

    const origName = String(file.name || "upload.bin");
    const ext = origName.includes(".") ? origName.split(".").pop() : "bin";
    const key = `promotions/${Date.now()}_${crypto.randomUUID()}.${ext}`;

    await bucket.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    return json({ success: true, key, url: `/r2/${key}` });
  }

  // 2) application/json（容錯：前端硬塞 Content-Type 時也能傳）
  if (ct.includes("application/json")) {
    const body = await safeJson(request);

    let filename = String(body.filename || body.name || "upload.bin");
    let contentType = String(body.contentType || body.type || "application/octet-stream");
    let base64 = String(body.base64 || body.data || "");

    if (!base64) {
      return json(
        { success: false, error: "json upload requires { base64, filename, contentType }" },
        { status: 400 }
      );
    }

    // 支援 dataURL: data:image/png;base64,xxxx
    const m = base64.match(/^data:([^;]+);base64,(.+)$/i);
    if (m) {
      contentType = m[1] || contentType;
      base64 = m[2] || "";
    }

    // 轉 Uint8Array
    let bytes;
    try {
      const bin = atob(base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch (e) {
      return json({ success: false, error: "base64 decode failed" }, { status: 400 });
    }

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const key = `promotions/${Date.now()}_${crypto.randomUUID()}.${ext}`;

    await bucket.put(key, bytes, {
      httpMetadata: { contentType: contentType || "application/octet-stream" },
    });

    return json({ success: true, key, url: `/r2/${key}` });
  }

  // 3) 其他 Content-Type：直接回清楚錯誤
  return json(
    {
      success: false,
      error:
        "Unsupported Content-Type. 請用 multipart/form-data 上傳檔案，或用 application/json {base64, filename, contentType}。",
      contentType: request.headers.get("Content-Type") || "",
    },
    { status: 415 }
  );
}

      // admin: promotions list
if (url.pathname === "/admin/promotions" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

const rows = await db
  .prepare(
    `SELECT id, title, cover_image_url, content_html, placement, enabled, sort, updated_at, created_at
     FROM promotions
     ORDER BY sort ASC, id ASC`
  )
  .all();

return json({
  success: true,
  items: (rows?.results || []).map((r) => ({
    id: Number(r.id || 0),
    title: String(r.title || ""),
    cover_image_url: String(r.cover_image_url || ""),
    content_html: String(r.content_html || ""),
    placement: String(r.placement || "coupon"), // ✅ 加這個
    enabled: Number(r.enabled || 0),
    sort: Number(r.sort || 0),
    updated_at: toTaipeiStringFromUtc(r.updated_at),
    created_at: toTaipeiStringFromUtc(r.created_at),
  })),
});
}

// admin: create promotion
if (url.pathname === "/admin/promotions" && request.method === "POST") {
  if (!admin) return forbid("Unauthorized", 401);

  const body = await safeJson(request);

  const title = String(body.title || "").trim();
  const cover = String(body.cover_image_url || "");
  const content = String(body.content_html || "");

  // ✅ 新增：放置位置
const placement = String(body.placement || "coupon").trim().toLowerCase();
const pos = await getPromotionPositionByKey(placement);
if (!pos) {
  return json({ success: false, error: "placement 不存在" }, { status: 400 });
}
  // coupon=全部 / event=入金 / task=返水

  const enabled = Number(body.enabled ?? 1) ? 1 : 0;
  const sort = Number(body.sort || 0);

  if (!title) {
    return json({ success:false, error:"title required" },{status:400});
  }

  await db.prepare(`
    INSERT INTO promotions
    (title, cover_image_url, content_html, placement, enabled, sort, updated_at, created_at)
    VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))
  `)
  .bind(title, cover, content, placement, enabled, sort)
  .run();

  return json({ success:true });
}

// admin: update promotion
if (url.pathname.startsWith("/admin/promotions/") && request.method === "PATCH") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = Number(url.pathname.split("/").pop() || 0);
  const body = await safeJson(request);

  const fields = [];
  const binds = [];

  const setIf = (k, v) => {
    fields.push(`${k}=?`);
    binds.push(v);
  };

  if (body.title !== undefined) setIf("title", String(body.title));
  if (body.cover_image_url !== undefined) setIf("cover_image_url", String(body.cover_image_url));
  if (body.content_html !== undefined) setIf("content_html", String(body.content_html));
  if (body.enabled !== undefined) setIf("enabled", Number(body.enabled) ? 1 : 0);
  if (body.sort !== undefined) setIf("sort", Number(body.sort));

  // ✅ 新增：放置位置（coupon / event / task）
  // ✅ 新增：放置位置（coupon / event / task）
if (body.placement !== undefined) {
  const placement = String(body.placement || "").trim().toLowerCase();
  const pos = await getPromotionPositionByKey(placement);
  if (!pos) {
    return json({ success: false, error: "placement 不存在" }, { status: 400 });
  }
  setIf("placement", placement);
}

  if (!fields.length) return json({ success: true });

  binds.push(id);

  await db
    .prepare(
      `UPDATE promotions SET ${fields.join(", ")}, updated_at=datetime('now') WHERE id=?`
    )
    .bind(...binds)
    .run();

  return json({ success: true });
}

// admin: delete promotion
if (url.pathname.startsWith("/admin/promotions/") && request.method === "DELETE") {
  if (!admin) return forbid("Unauthorized", 401);

  const id = Number(url.pathname.split("/").pop() || 0);

  await db
    .prepare("DELETE FROM promotions WHERE id=?")
    .bind(id)
    .run();

  return json({ success:true });
}

      // /admin/me
      if (url.pathname === "/admin/me" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        return json({
          success: true,
          admin: {
            admin_id: Number(admin.admin_id || 0),
            username: admin.username,
            role: admin.role,
          },
        });
      }

      // /admin/change-password
      if (url.pathname === "/admin/change-password" && request.method === "POST") {
        if (!admin) return forbid("Unauthorized", 401);
        const body = await safeJson(request);
        const old_password = String(body.old_password || "").trim();
        const new_password = String(body.new_password || "").trim();

        if (!old_password || !new_password) {
          return json({ success: false, error: "缺少參數" }, { status: 400 });
        }

        const acc = await db
          .prepare("SELECT id, password FROM admin_accounts WHERE id=? LIMIT 1")
          .bind(Number(admin.admin_id))
          .first();

        if (!acc || String(acc.password) !== old_password) {
          return json({ success: false, error: "舊密碼錯誤" }, { status: 400 });
        }

        await db
          .prepare("UPDATE admin_accounts SET password=? WHERE id=?")
          .bind(new_password, Number(admin.admin_id))
          .run();

        await db.prepare("DELETE FROM admin_sessions WHERE username=?").bind(admin.username).run();
        hotCacheDel("cfg:wheel_prizes");
        return json({ success: true });
      }

      // admin: list activities
      if (url.pathname === "/admin/activities" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        const rows = await db
          .prepare(
            `SELECT activity_key, activity_name, enabled, default_times, start_at, end_at,
                    sort, allow_override_times, daily_reset, require_authorized, updated_at
             FROM activities
             ORDER BY sort ASC, id ASC`
          )
          .all();

        const items = (rows?.results || []).map((r) => ({
          key: r.activity_key,
          name: r.activity_name,
          enabled: Number(r.enabled || 0),
          sort: Number(r.sort || 0),
          startAt: r.start_at || "",
          endAt: r.end_at || "",
          defaultTimes: Number(r.default_times || 0),
          allowOverrideTimes: Number(r.allow_override_times ?? 1),
          dailyReset: Number(r.daily_reset || 0),
          requireAuthorized: Number(r.require_authorized || 0),
        }));

        return json({ success: true, items });
      }

      // admin: update activity (PUT)
      if (url.pathname === "/admin/activities" && request.method === "PUT") {
        if (!admin) return forbid("Unauthorized", 401);
        const body = await safeJson(request);
        const activity_key = String(body.activity_key ?? body.key ?? "").trim();
        if (!activity_key) return json({ success: false, error: "activity_key required" }, { status: 400 });

        const enabled = Number(body.enabled || 0) ? 1 : 0;
        const default_times = Number(body.default_times ?? body.defaultTimes ?? 0);
        const start_at = (body.start_at ?? body.startAt) ? String(body.start_at ?? body.startAt) : null;
        const end_at = (body.end_at ?? body.endAt) ? String(body.end_at ?? body.endAt) : null;

        await db
          .prepare(
            `UPDATE activities
             SET enabled=?, default_times=?, start_at=?, end_at=?, updated_at=?
             WHERE activity_key=?`
          )
          .bind(enabled, default_times, start_at, end_at, nowIso(), activity_key)
          .run();

        hotCacheDel(`activity:${activity_key}`);
        return json({ success: true });
      }

      // admin: patch single activity
      if (url.pathname.startsWith("/admin/activities/") && request.method === "PATCH") {
        if (!admin) return forbid("Unauthorized", 401);
        const key = decodeURIComponent(url.pathname.split("/").pop() || "");
        if (!key) return json({ success: false, error: "activity_key required" }, { status: 400 });

        const body = await safeJson(request);

        const enabled =
          body.enabled === undefined ? undefined : (Number(body.enabled) ? 1 : 0);
        const default_times =
          body.default_times === undefined ? undefined : Number(body.default_times || 0);
        const start_at =
          body.start_at === undefined ? undefined : (body.start_at ? String(body.start_at) : null);
        const end_at =
          body.end_at === undefined ? undefined : (body.end_at ? String(body.end_at) : null);

        const cur = await db
          .prepare("SELECT * FROM activities WHERE activity_key=? LIMIT 1")
          .bind(key)
          .first();
        if (!cur) return json({ success: false, error: "activity not found" }, { status: 404 });

        await db
          .prepare(
            `UPDATE activities
             SET enabled=?, default_times=?, start_at=?, end_at=?, updated_at=?
             WHERE activity_key=?`
          )
          .bind(
            enabled === undefined ? Number(cur.enabled || 0) : enabled,
            default_times === undefined ? Number(cur.default_times || 0) : default_times,
            start_at === undefined ? cur.start_at : start_at,
            end_at === undefined ? cur.end_at : end_at,
            nowIso(),
            key
          )
          .run();

        hotCacheDel(`activity:${key}`);
        return json({ success: true });
      }

      // admin: redpacket config GET/POST
      if (url.pathname === "/admin/redpacket/config" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        const row = await db
          .prepare(
            "SELECT mode, fixed_amount, pool_json, count, allow_repeat, lock_when_all_opened, updated_at FROM redpacket_config WHERE id=1 LIMIT 1"
          )
          .first();
        return json({
          success: true,
          config:
            row || { mode: "pool", fixed_amount: 0, pool_json: "[]", count: 0, allow_repeat: 1, lock_when_all_opened: 0, updated_at: nowIso() },
        });
      }

      if (url.pathname === "/admin/redpacket/config" && request.method === "POST") {
        if (!admin) return forbid("Unauthorized", 401);
        const body = await safeJson(request);

        // ✅ 兼容你前端 payload: { config: {...}, pool: [...] }
        const cfg = body.config || body || {};
        const pool = body.pool || cfg.pool || [];

        const mode = String(cfg.mode || "pool");
        const fixed_amount = Number(cfg.fixed_amount || 0);
        const count = Number(cfg.count || 0);
        const allow_repeat = Number(cfg.allow_repeat ?? 1) ? 1 : 0;
        const lock_when_all_opened = Number(cfg.lock_when_all_opened ?? 0) ? 1 : 0;

        const pool_json = typeof cfg.pool_json === "string"
          ? cfg.pool_json
          : JSON.stringify(
              Array.isArray(pool)
                ? pool.map((x, i) => ({
                    amount: Number(x.amount || 0),
                    prob: Number(x.prob || 0),
                    enabled: Number(x.enabled ?? 1) ? 1 : 0,
                    sort: Number(x.sort ?? i),
                  }))
                : []
            );

        await db
          .prepare(
            "UPDATE redpacket_config SET mode=?, fixed_amount=?, pool_json=?, count=?, allow_repeat=?, lock_when_all_opened=?, updated_at=? WHERE id=1"
          )
          .bind(mode, fixed_amount, pool_json, count, allow_repeat, lock_when_all_opened, nowIso())
          .run();

        hotCacheDel("cfg:redpacket");
        return json({ success: true });
      }

      // public: wheel prizes
      if (url.pathname === "/wheel/prizes" && request.method === "GET") {
        const rows = { results: await getCachedWheelPrizes() };

        const prizes = (rows?.results || []).map((r) => ({
          id: r.id,
          name: r.title,
          prize_type: r.prize_type || "money",
          prize_value: Number(r.amount || 0),
          prize_text: r.prize_text || "",
          image_url: r.image_url || "",
          probability: Number(r.weight || 0),
          enabled: Number(r.enabled || 0),
          sort: Number(r.sort || 0),
        }));

        return json({ success: true, prizes });
      }

      // admin: wheel prizes GET/PUT
      if (url.pathname === "/admin/wheel/prizes" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        const rows = await db
          .prepare(
            `SELECT id, title, amount, weight, enabled, prize_type, prize_text, image_url, sort, updated_at
             FROM wheel_prizes
             ORDER BY sort ASC, id ASC`
          )
          .all();

        const items = (rows?.results || []).map((r) => ({
          id: r.id,
          name: r.title,
          prize_type: r.prize_type || "money",
          prize_value: Number(r.amount || 0),
          prize_text: r.prize_text || "",
          image_url: r.image_url || "",
          probability: Number(r.weight || 0),
          enabled: Number(r.enabled || 0),
          sort: Number(r.sort || 0),
        }));

        return json({ success: true, items });
      }

      if (url.pathname === "/admin/wheel/prizes" && request.method === "PUT") {
        if (!admin) return forbid("Unauthorized", 401);
        const body = await safeJson(request);
        const items = Array.isArray(body.items)
          ? body.items
          : Array.isArray(body.prizes)
          ? body.prizes
          : [];

        await db.prepare("DELETE FROM wheel_prizes").run();
        hotCacheDel("cfg:wheel_prizes");

        for (const p of items) {
          const title = String(p.name ?? p.title ?? "");
          const prize_type = String(p.prize_type || "money");
          const prize_text = String(p.prize_text || "");
          const image_url = String(p.image_url || "");
          const amount = Number(p.prize_value ?? p.amount ?? 0);
          const weight = Math.max(0, Number(p.probability ?? p.weight ?? 0));
          const enabled = Number(p.enabled ?? 1) ? 1 : 0;
          const sort = Number(p.sort ?? 0);

          await db
            .prepare(
              `INSERT INTO wheel_prizes
                (title, amount, weight, enabled, prize_type, prize_text, image_url, sort, updated_at, created_at)
               VALUES (?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`
            )
            .bind(title, amount, weight, enabled, prize_type, prize_text, image_url, sort)
            .run();
        }
        hotCacheDel("cfg:wheel_prizes");
        return json({ success: true });
      }

      // admin: users list/upsert/patch/delete
if (url.pathname === "/admin/users" && request.method === "GET") {
  if (!admin) return forbid("Unauthorized", 401);

  const isSuper = isSuperAdmin(admin);
  const binds = [];

  let q = `
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.welfare_balance,
      u.discount_balance,
      u.s_balance,
      u.line_id,
      u.birthday,
      u.bank_holder,
      u.bank_name,
      u.bank_branch,
      u.bank_account,
      u.line_verified,
      u.num_authorized,
      u.uses_left,
      u.times_override,
      u.enabled,
      u.locked,
      u.created_by_admin_id,
      u.created_at,

      COALESCE(rp.times_left, 0) AS redpacket_times,
      COALESCE(wh.times_left, 0) AS wheel_times,
      COALESCE(nb.times_left, 0) AS number_times

    FROM users u
    LEFT JOIN user_activity_usage rp
      ON rp.user_id = u.id AND rp.activity_key = 'redpacket'
    LEFT JOIN user_activity_usage wh
      ON wh.user_id = u.id AND wh.activity_key = 'wheel'
    LEFT JOIN user_activity_usage nb
      ON nb.user_id = u.id AND nb.activity_key = 'number'
  `;

  if (!isSuper) {
    q += ` WHERE u.created_by_admin_id=? `;
    binds.push(Number(admin.admin_id || 0));
  }

  q += ` ORDER BY u.id DESC `;

  const stmt = db.prepare(q);
  const rows = binds.length ? await stmt.bind(...binds).all() : await stmt.all();

  return json({
    success: true,
    items: (rows?.results || []).map((r) => ({
      id: Number(r.id || 0),
      username: r.username || "",
      name: r.display_name || "",

      enabled: Number(r.enabled || 0),
      uses_left: Number(r.uses_left || 0),

      welfare_balance: Number(r.welfare_balance || 0),
      discount_balance: Number(r.discount_balance || 0),
      s_balance: Number(r.s_balance || 0),

      line_id: r.line_id || "",
      birthday: r.birthday || "",
      line_verified: Number(r.line_verified || 0),
      locked: Number(r.locked || 0),
      times_override: r.times_override === null ? null : Number(r.times_override || 0),
      created_at: toTaipeiStringFromUtc(r.created_at),

      bank_holder: r.bank_holder || "",
      bank_name: r.bank_name || "",
      bank_branch: r.bank_branch || "",
      bank_account: r.bank_account || "",

      redpacket_times: Number(r.redpacket_times || 0),
      wheel_times: Number(r.wheel_times || 0),
      number_times: Number(r.number_times || 0),
    })),
  });
}

      if (url.pathname === "/admin/users" && request.method === "POST") {
        if (!admin) return forbid("Unauthorized", 401);

        const body = await safeJson(request);
        const id = body.id ? Number(body.id) : 0;
        const username = String(body.username || "").trim();
        const password = String(body.password || "").trim();
        const display_name = String(body.display_name ?? body.name ?? "");
        const welfare_balance = Number(body.welfare_balance || 0);
        const discount_balance = Number(body.discount_balance || 0);
        const s_balance = Number(body.s_balance || 0);
        const line_id = String(body.line_id || "").trim();
        const birthday = String(body.birthday || "").trim();
        const bank_holder = String(body.bank_holder || "").trim();
        const bank_name = String(body.bank_name || "").trim();
        const bank_branch = String(body.bank_branch || "").trim();
        const bank_account = String(body.bank_account || "").trim();
        const line_verified = Number(body.line_verified || 0) ? 1 : 0;
        const num_authorized = Number(body.num_authorized || 0);
        const uses_left = Number(body.uses_left || 0);
        const times_override =
          body.times_override === undefined
            ? null
            : body.times_override === null
            ? null
            : Number(body.times_override || 0);
        const enabled = Number(body.enabled ?? 1) ? 1 : 0;
        const locked = Number(body.locked ?? 0) ? 1 : 0;

        if (!username)
          return json({ success: false, error: "username required" }, { status: 400 });

        
if (id > 0) {
          if (!isSuperAdmin(admin)) {
            const owner = await db
              .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
              .bind(id)
              .first();
            if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
              return forbid("Forbidden", 403);
            }
          }

          if (password) {
await db
  .prepare(
    `UPDATE users
     SET username=?, password=?, display_name=?,
         welfare_balance=?, discount_balance=?, s_balance=?,
         line_id=?, birthday=?, bank_holder=?, bank_name=?, bank_branch=?, bank_account=?, line_verified=?,
         num_authorized=?, uses_left=?, times_override=?,
         enabled=?, locked=?
     WHERE id=?`
  )
  .bind(
    username,
    password,
    display_name,
    welfare_balance,
    discount_balance,
    s_balance,
    line_id || null,
    birthday || null,
    bank_holder || null,
    bank_name || null,
    bank_branch || null,
    bank_account || null,
    line_verified,
    num_authorized,
    uses_left,
    times_override,
    enabled,
    locked,
    id
  )
  .run();
          } else {
await db
  .prepare(
    `UPDATE users
     SET username=?, display_name=?,
         welfare_balance=?, discount_balance=?, s_balance=?,
         line_id=?, birthday=?, bank_holder=?, bank_name=?, bank_branch=?, bank_account=?, line_verified=?,
         num_authorized=?, uses_left=?, times_override=?,
         enabled=?, locked=?
     WHERE id=?`
  )
  .bind(
    username,
    display_name,
    welfare_balance,
    discount_balance,
    s_balance,
    line_id || null,
    birthday || null,
    bank_holder || null,
    bank_name || null,
    bank_branch || null,
    bank_account || null,
    line_verified,
    num_authorized,
    uses_left,
    times_override,
    enabled,
    locked,
    id
  )
  .run();
          }
        } else {
          if (!password)
            return json({ success: false, error: "password required" }, { status: 400 });

await db
  .prepare(
    `INSERT INTO users
       (username, password, display_name,
        welfare_balance, discount_balance, s_balance,
        line_id, birthday, bank_holder, bank_name, bank_branch, bank_account, line_verified,
        num_authorized, uses_left, times_override, enabled, locked,
        created_by_admin_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  )
  .bind(
    username,
    password,
    display_name,
    welfare_balance,
    discount_balance,
    s_balance,
    line_id || null,
    birthday || null,
    bank_holder || null,
    bank_name || null,
    bank_branch || null,
    bank_account || null,
    line_verified,
    num_authorized,
    uses_left,
    times_override,
    enabled,
    locked,
    Number(admin.admin_id || 0),
    nowIso()
  )
  .run();
        }

        return json({ success: true });
      }

      

// ===== ADMIN: adjust user wallet =====
if (
  url.pathname.startsWith("/admin/users/") &&
  url.pathname.endsWith("/wallet") &&
  request.method === "POST"
) {
  if (!admin) return forbid("Unauthorized", 401);

  const parts = url.pathname.split("/").filter(Boolean);
  const userId = Number(parts[2] || 0);
  if (!userId) return json({ success: false, error: "bad user id" }, { status: 400 });

  // owner guard
  if (!isSuperAdmin(admin)) {
    const owner = await db
      .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
      .bind(userId)
      .first();
    if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
      return forbid("Forbidden", 403);
    }
  }

  const body = await safeJson(request);
  const delta_s = toInt(body.delta_s, 0);
  const delta_welfare = toInt(body.delta_welfare, 0);
  const delta_discount = toInt(body.delta_discount, 0);
  const action = String(body.action || "調整").trim() || "調整";
  const note = String(body.note || "").trim();

  const r = await applyWalletDelta({
    userId,
    delta_s,
    delta_welfare,
    delta_discount,
    category: "admin",
    action,
    note,
    admin_account: String(admin.username || ""),
    result: `後台調整：S幣${delta_s} 福利金${delta_welfare} 折抵金${delta_discount}`,
  });

  if (!r.ok) {
    await insertWalletLog({
      user_id: userId,
      username: "",
      category: "admin",
      action,
      status: "fail",
      result: "調整失敗",
      note: note ? `${note}（${r.error}）` : String(r.error || ""),
      admin_account: String(admin.username || ""),
    });
    return json({ success: false, error: r.error || "調整失敗" }, { status: 400 });
  }

  return json({ success: true, user: r.user });
}

// ===== ADMIN: user wallet logs =====
if (
  url.pathname.startsWith("/admin/users/") &&
  url.pathname.endsWith("/logs") &&
  request.method === "GET"
) {
  if (!admin) return forbid("Unauthorized", 401);

  const parts = url.pathname.split("/").filter(Boolean);
  const userId = Number(parts[2] || 0);
  if (!userId) return json({ success: false, error: "bad user id" }, { status: 400 });

  if (!isSuperAdmin(admin)) {
    const owner = await db
      .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
      .bind(userId)
      .first();
    if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
      return forbid("Forbidden", 403);
    }
  }

  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") || 90)));
  const rows = await db
    .prepare(
      `SELECT id, created_at, category, action, status, delta_s, delta_welfare, delta_discount, result, note, admin_account
       FROM wallet_logs
       WHERE user_id=? AND created_at >= datetime('now', ?)
       ORDER BY id DESC
       LIMIT 500`
    )
    .bind(userId, `-${days} day`)
    .all();

  return json({ success: true, items: rows?.results || [] });
}

// ===== ADMIN: verify user LINE =====
if (
  url.pathname.startsWith("/admin/users/") &&
  url.pathname.endsWith("/line-verify") &&
  request.method === "POST"
) {
  if (!admin) return forbid("Unauthorized", 401);

  const parts = url.pathname.split("/").filter(Boolean);
  const userId = Number(parts[2] || 0);
  if (!userId) return json({ success: false, error: "bad user id" }, { status: 400 });

  if (!isSuperAdmin(admin)) {
    const owner = await db
      .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
      .bind(userId)
      .first();
    if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
      return forbid("Forbidden", 403);
    }
  }

  const body = await safeJson(request);
  const v = Number(body.verified ?? 1) ? 1 : 0;

  await db
    .prepare("UPDATE users SET line_verified=? WHERE id=?")
    .bind(v, userId)
    .run();

  await insertWalletLog({
    user_id: userId,
    username: "",
    category: "admin",
    action: "line_verify",
    status: "success",
    result: v ? "LINE 已驗證" : "LINE 取消驗證",
    note: "",
    admin_account: String(admin.username || ""),
  });

  return json({ success: true });
}

// ✅ NEW: set/add activity times (B方案) => /admin/users/:id/activity-times
      if (
        url.pathname.startsWith("/admin/users/") &&
        url.pathname.endsWith("/activity-times") &&
        request.method === "POST"
      ) {
        if (!admin) return forbid("Unauthorized", 401);

        const parts = url.pathname.split("/").filter(Boolean);
const raw = decodeURIComponent(parts[2] || "").trim();
if (!raw) return json({ success: false, error: "bad user id" }, { status: 400 });

let userId = 0;

// 1) 先嘗試當數字 id
if (/^\d+$/.test(raw)) {
  userId = Number(raw);
}

// 2) 若不是數字 or 找不到該 id，就當 username 查 users.id
if (!userId) {
  const u = await db
    .prepare("SELECT id FROM users WHERE username=? LIMIT 1")
    .bind(raw)
    .first();
  userId = Number(u?.id || 0);
}

if (!userId) {
  return json({ success: false, error: "user not found" }, { status: 404 });
}

        // 權限：非 superadmin 只能管理自己建立的 user
        if (!isSuperAdmin(admin)) {
          const owner = await db
            .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
            .bind(userId)
            .first();
          if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
            return forbid("Forbidden", 403);
          }
        }

const body = await safeJson(request);
const activity_key = String(body.activity_key || "").trim();
const mode = String(body.mode || "add").trim().toLowerCase(); // add | subtract | set
const amount = Number(body.amount || 0);

if (!activity_key) {
  return json({ success: false, error: "activity_key required" }, { status: 400 });
}
if (!Number.isFinite(amount)) {
  return json({ success: false, error: "amount invalid" }, { status: 400 });
}

const safeAmount = Math.max(0, Math.floor(amount));

const act = await db
  .prepare("SELECT activity_key FROM activities WHERE activity_key=? LIMIT 1")
  .bind(activity_key)
  .first();

if (!act) {
  return json({ success: false, error: "activity not found" }, { status: 404 });
}

await ensureUsageRow(userId, activity_key);

const cur = await db
  .prepare(
    "SELECT user_id, activity_key, times_left FROM user_activity_usage WHERE user_id=? AND activity_key=? LIMIT 1"
  )
  .bind(userId, activity_key)
  .first();

const currentLeft = Number(cur?.times_left || 0);

let nextLeft = currentLeft;

if (mode === "set") {
  nextLeft = safeAmount;
} else if (mode === "subtract") {
  nextLeft = Math.max(0, currentLeft - safeAmount);
} else {
  nextLeft = currentLeft + safeAmount;
}

await db
  .prepare(
    "UPDATE user_activity_usage SET times_left=?, updated_at=? WHERE user_id=? AND activity_key=?"
  )
  .bind(nextLeft, nowIso(), userId, activity_key)
  .run();

const row = await db
  .prepare(
    "SELECT user_id, activity_key, times_left FROM user_activity_usage WHERE user_id=? AND activity_key=? LIMIT 1"
  )
  .bind(userId, activity_key)
  .first();

return json({ success: true, row });
}

if (url.pathname.startsWith("/admin/users/") && request.method === "PATCH") {
        if (!admin) return forbid("Unauthorized", 401);
        const id = Number(url.pathname.split("/").pop() || 0);
        const body = await safeJson(request);

        const cur = await db
          .prepare(
            "SELECT id, created_by_admin_id FROM users WHERE id=? LIMIT 1"
          )
          .bind(id)
          .first();
        if (!cur) return forbid("User not found", 404);

        if (!isSuperAdmin(admin)) {
          if (Number(cur.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
            return forbid("Forbidden", 403);
          }
        }

        const fields = [];
        const binds = [];

        const setIf = (k, v) => {
          fields.push(`${k}=?`);
          binds.push(v);
        };

        if (body.username !== undefined) setIf("username", String(body.username || "").trim());
        if (body.password !== undefined) setIf("password", String(body.password || "").trim());
        if (body.display_name !== undefined) setIf("display_name", String(body.display_name || ""));
        if (body.name !== undefined) setIf("display_name", String(body.name || ""));
        if (body.uses_left !== undefined) setIf("uses_left", Number(body.uses_left || 0));
        if (body.times_override !== undefined) setIf("times_override", body.times_override === null ? null : Number(body.times_override || 0));
        if (body.welfare_balance !== undefined) setIf("welfare_balance", Number(body.welfare_balance || 0));
        if (body.num_authorized !== undefined) setIf("num_authorized", Number(body.num_authorized || 0));
        if (body.enabled !== undefined) setIf("enabled", Number(body.enabled) ? 1 : 0);
        if (body.locked !== undefined) setIf("locked", Number(body.locked) ? 1 : 0);
                // ✅ profile fields
        if (body.line_id !== undefined) setIf("line_id", String(body.line_id || "").trim());
        if (body.birthday !== undefined) setIf("birthday", String(body.birthday || "").trim());
        if (body.line_verified !== undefined) setIf("line_verified", Number(body.line_verified) ? 1 : 0);

        // ✅ bank fields (users 表是平鋪欄位)
        if (body.bank_holder !== undefined) setIf("bank_holder", String(body.bank_holder || "").trim());
        if (body.bank_name !== undefined) setIf("bank_name", String(body.bank_name || "").trim());
        if (body.bank_branch !== undefined) setIf("bank_branch", String(body.bank_branch || "").trim());
        if (body.bank_account !== undefined) setIf("bank_account", String(body.bank_account || "").trim());

        // ✅ wallet fields (optional: 允許後台直接改餘額)
        if (body.discount_balance !== undefined) setIf("discount_balance", Number(body.discount_balance || 0));
        if (body.s_balance !== undefined) setIf("s_balance", Number(body.s_balance || 0));

        if (fields.length === 0) return json({ success: true });

        binds.push(id);

        await db
          .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id=?`)
          .bind(...binds)
          .run();

        return json({ success: true });
      }

      if (url.pathname.startsWith("/admin/users/") && request.method === "DELETE") {
        if (!admin) return forbid("Unauthorized", 401);
        const id = Number(url.pathname.split("/").pop() || 0);

        if (!isSuperAdmin(admin)) {
          const owner = await db
            .prepare("SELECT created_by_admin_id FROM users WHERE id=? LIMIT 1")
            .bind(id)
            .first();
          if (!owner || Number(owner.created_by_admin_id || 0) !== Number(admin.admin_id || 0)) {
            return forbid("Forbidden", 403);
          }
        }

        await db.prepare("DELETE FROM users WHERE id=?").bind(id).run();
        return json({ success: true });
      }

      // admin: winners list
      if (url.pathname === "/admin/winners" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        const rows = await db
          .prepare(
            `SELECT id, activity_key, user_id, username, prize_title, prize_amount, meta_json, created_at
             FROM winners
             ORDER BY id DESC
             LIMIT 300`
          )
          .all();
        return json({ success: true, winners: rows?.results || [] });
      }

      // admin: admins list/create/patch/delete (superadmin only)
      if (url.pathname === "/admin/admins" && request.method === "GET") {
        if (!admin) return forbid("Unauthorized", 401);
        if (!isSuperAdmin(admin)) return forbid("Forbidden", 403);

const rows = await db
  .prepare(
    "SELECT id, username, role, status, official_line_url, created_at FROM admin_accounts ORDER BY id DESC"
  )
  .all();
        return json({ success: true, items: rows?.results || [] });
      }

      if (url.pathname === "/admin/admins" && request.method === "POST") {
        if (!admin) return forbid("Unauthorized", 401);
        if (!isSuperAdmin(admin)) return forbid("Forbidden", 403);

        const body = await safeJson(request);
        const username = String(body.username || "").trim();
        const password = String(body.password || "").trim();
        const role = String(body.role || "admin").trim() || "admin";
        const status = String(body.status || "active").trim() || "active";
        const official_line_url = String(body.official_line_url || "").trim();

        if (!username || !password) {
          return json({ success: false, error: "username/password required" }, { status: 400 });
        }

await db
  .prepare(
    "INSERT INTO admin_accounts (username, password, role, status, official_line_url, created_at) VALUES (?,?,?,?,?,datetime('now'))"
  )
  .bind(username, password, role, status, official_line_url || null)
  .run();

        return json({ success: true });
      }

      if (url.pathname.startsWith("/admin/admins/") && request.method === "PATCH") {
        if (!admin) return forbid("Unauthorized", 401);
        if (!isSuperAdmin(admin)) return forbid("Forbidden", 403);

        const id = Number(url.pathname.split("/").pop() || 0);
        const body = await safeJson(request);

        const fields = [];
        const binds = [];
        const setIf = (k, v) => {
          fields.push(`${k}=?`);
          binds.push(v);
        };

if (body.username !== undefined) setIf("username", String(body.username || "").trim());
if (body.password !== undefined) setIf("password", String(body.password || "").trim());
if (body.role !== undefined) setIf("role", String(body.role || "admin").trim() || "admin");
if (body.status !== undefined)
  setIf("status", String(body.status || "active").trim() || "active");
if (body.official_line_url !== undefined)
  setIf("official_line_url", String(body.official_line_url || "").trim());

        if (fields.length === 0) return json({ success: true });

        binds.push(id);

        await db
          .prepare(`UPDATE admin_accounts SET ${fields.join(", ")} WHERE id=?`)
          .bind(...binds)
          .run();

        return json({ success: true });
      }

      if (url.pathname.startsWith("/admin/admins/") && request.method === "DELETE") {
        if (!admin) return forbid("Unauthorized", 401);
        if (!isSuperAdmin(admin)) return forbid("Forbidden", 403);

        const id = Number(url.pathname.split("/").pop() || 0);

        if (Number(id) === Number(admin.admin_id)) {
          return json({ success: false, error: "不能刪除自己" }, { status: 400 });
        }

        await db.prepare("DELETE FROM admin_accounts WHERE id=?").bind(id).run();
        await db.prepare("DELETE FROM admin_sessions WHERE admin_id=?").bind(id).run();

        return json({ success: true });
      }

      // =========================
// redpacket claim
// POST /redpacket/claim
// 每日可領取一次：紅包次數 +1
// =========================
if (url.pathname === "/redpacket/claim" && request.method === "POST") {
  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);

  const userId = Number(sess.user_id || 0);
  if (!userId) return forbid("Unauthorized", 401);

  const act = await db
    .prepare("SELECT * FROM activities WHERE activity_key='redpacket' LIMIT 1")
    .first();

  if (!activityEnabledNow(act)) {
    return forbid("活動未開放", 403);
  }

  // ✅ 今天是否已領取過
  const todayClaim = await db
    .prepare(
      `
      SELECT id
      FROM draw_records
      WHERE user_id = ?
        AND activity_key = 'redpacket'
        AND note = 'daily_claim'
        AND date(datetime(created_at, '+8 hours')) = date(datetime('now', '+8 hours'))
      LIMIT 1
      `
    )
    .bind(userId)
    .first();

  if (todayClaim) {
    return json(
      { success: false, error: "今日已領取過" },
      { status: 400 }
    );
  }

  // ✅ 確保 usage row 存在
  await ensureUsageRow(userId, "redpacket");

  // ✅ 次數 +1
  await db
    .prepare(
      `
      UPDATE user_activity_usage
      SET times_left = times_left + 1,
          updated_at = ?
      WHERE user_id = ?
        AND activity_key = 'redpacket'
      `
    )
    .bind(nowIso(), userId)
    .run();

  const usage = await db
    .prepare(
      `
      SELECT times_left
      FROM user_activity_usage
      WHERE user_id = ?
        AND activity_key = 'redpacket'
      LIMIT 1
      `
    )
    .bind(userId)
    .first();

  // ✅ 寫一筆紀錄，當作今天已領取標記
  await addDrawRecord({
    activity_key: "redpacket",
    user_id: userId,
    username: String(sess.username || ""),
    status: "win",
    prize_title: "每日領取次數+1",
    prize_amount: 0,
    note: "daily_claim",
    meta: {
      claim_times: 1,
      times_left: Number(usage?.times_left || 0),
    },
  });

  return json({
    success: true,
    message: "今日領取成功",
    left: Number(usage?.times_left || 0),
  });
}

      /* =========================
       * USER APIs: redpacket / wheel
       * ========================= */
      if (url.pathname === "/redpacket/draw" && request.method === "POST") {
        const sess = await requireUser();
        if (!sess) return forbid("Unauthorized", 401);

        const act = await getCachedActivity("redpacket");
        if (!activityEnabledNow(act)) return forbid("活動未開放", 403);

        const dec = await decUsageIfPossible(Number(sess.user_id), "redpacket");
        if (!dec.ok) return forbid("抽獎次數不足", 403);

        const cfg = await getCachedRedpacketConfig();

        let amount = 0;

        if (cfg?.mode === "fixed") {
          amount = Number(cfg.fixed_amount || 0);
        } else {
          let pool = [];
          try {
            pool = JSON.parse(cfg?.pool_json || "[]");
          } catch {
            pool = [];
          }

          // enabled=0 不參與（如果你要）
          const enabledPool = pool.filter((x) => Number(x.enabled ?? 1) ? true : false);

          let total = 0;
          for (const it of enabledPool) total += Math.max(0, Number(it.prob || it.weight || 0));
          if (total <= 0) amount = 0;
          else {
            let r = Math.random() * total;
            for (const it of enabledPool) {
              r -= Math.max(0, Number(it.prob || it.weight || 0));
              if (r <= 0) {
                amount = Number(it.amount || 0);
                break;
              }
            }
          }
        }

        await db
          .prepare("UPDATE users SET welfare_balance = welfare_balance + ? WHERE id=?")
          .bind(Number(amount), Number(sess.user_id))
          .run();

        await insertWalletLog({
          user_id: Number(sess.user_id),
          username: String(sess.username),
          category: "raffle",
          action: "redpacket_draw",
          status: "success",
          delta_welfare: Number(amount),
          delta_s: 0,
          delta_discount: 0,
          result: Number(amount) > 0 ? `中獎 福利金 ${Number(amount)}` : "未中獎",
          note: "紅包抽獎",
        });
        
        await addDrawRecord({
  activity_key: "redpacket",
  user_id: Number(sess.user_id),
  username: String(sess.username),
  status: Number(amount) > 0 ? "win" : "lose",
  prize_title: "紅包",
  prize_amount: Number(amount),
  note: "",
  meta: { left: dec.left, mode: cfg?.mode || "pool" },
});  

        await db
          .prepare(
            "INSERT INTO winners (activity_key, user_id, username, prize_title, prize_amount, meta_json, created_at) VALUES (?,?,?,?,?,?,datetime('now'))"
          )
          .bind(
            "redpacket",
            Number(sess.user_id),
            String(sess.username),
            "紅包",
            Number(amount),
            JSON.stringify({ left: dec.left })
          )
          .run();

        return json({ success: true, amount, left: dec.left });
      }

// =========================
// redpacket history
// GET /redpacket/history
// =========================
if (url.pathname === "/redpacket/history" && request.method === "GET") {
  try {
    const rows = await db
      .prepare(`
        SELECT
          d.id,
          d.prize_amount AS amount,
          d.created_at,
          u.username,
          u.display_name
        FROM draw_records d
        LEFT JOIN users u
          ON d.user_id = u.id
        WHERE d.activity_key = 'redpacket'
          AND d.status = 'win'
        ORDER BY d.id DESC
        LIMIT 12
      `)
      .all();

    return json({
      success: true,
      items: (rows?.results || []).map((r) => ({
        ...r,
        created_at: toTaipeiStringFromUtc(r.created_at),
      }))
    });
  } catch (e) {
    return json(
      {
        success: false,
        error: String(e?.message || e || "history failed"),
      },
      { status: 500 }
    );
  }
}

// =========================
// wheel history
// GET /wheel/history
// =========================
if (url.pathname === "/wheel/history" && request.method === "GET") {
  try {
    const rows = await db
      .prepare(`
        SELECT
          d.id,
          d.prize_title AS prize_name,
          d.prize_amount AS amount,
          d.created_at,
          u.username,
          u.display_name
        FROM draw_records d
        LEFT JOIN users u
          ON d.user_id = u.id
        WHERE d.activity_key = 'wheel'
          AND d.status = 'win'
        ORDER BY d.id DESC
        LIMIT 12
      `)
      .all();

    return json({
      success: true,
      items: (rows?.results || []).map((r) => ({
        ...r,
        created_at: toTaipeiStringFromUtc(r.created_at),
      }))
    });
  } catch (e) {
    return json(
      {
        success: false,
        error: String(e?.message || e || "wheel history failed"),
      },
      { status: 500 }
    );
  }
}

      if (url.pathname === "/wheel/spin" && request.method === "POST") {
        const sess = await requireUser();
        if (!sess) return forbid("Unauthorized", 401);

        const act = await getCachedActivity("wheel");
        if (!activityEnabledNow(act)) return forbid("活動未開放", 403);

        const dec = await decUsageIfPossible(Number(sess.user_id), "wheel");
        if (!dec.ok) return forbid("抽獎次數不足", 403);

        const prizes = await getCachedWheelPrizes();
        if (prizes.length === 0) {
          return json({ success: false, error: "尚無獎項" }, { status: 400 });
        }

        // 本次抽獎使用的獎項順序（前端輪盤對齊用）
        const order_ids = prizes.map((p) => Number(p.id));

        // 權重抽獎
        let total = 0;
        for (const p of prizes) total += Math.max(1, Number(p.weight || 1));

        let r = Math.random() * total;
        let pick = prizes[0];
        for (const p of prizes) {
          r -= Math.max(1, Number(p.weight || 1));
          if (r <= 0) {
            pick = p;
            break;
          }
        }

        const result_index = Math.max(
          0,
          order_ids.findIndex((id) => String(id) === String(pick.id))
        );

        const rawTitle = String(pick.title || "").trim();
        const rawPrizeType = String(pick.prize_type || "").trim().toLowerCase();
        const rawPrizeText = String(pick.prize_text || "");
        const rawImageUrl = String(pick.image_url || "");
        const rawWeight = Number(pick.weight || 0);

        let amount = Number(pick.amount || 0);

        // 如果 amount 沒填，就從標題抓數字，例如：S幣888 / 現金666 / 折抵金1000
        if (!Number.isFinite(amount) || amount <= 0) {
          const m = rawTitle.replace(/,/g, "").match(/\d+/);
          amount = m ? Number(m[0]) : 0;
        }

        // S幣 / 折抵金 / 福利金 分流
        const isScoin =
          rawPrizeType === "scoin" ||
          rawPrizeType === "scoins" ||
          rawPrizeType === "s_coin" ||
          rawPrizeType === "s-coins" ||
          rawPrizeType === "coin" ||
          rawPrizeType.includes("scoin") ||
          /s\s*幣/i.test(rawTitle) ||
          rawTitle.includes("S幣") ||
          rawTitle.includes("S币");

        const isDiscount =
          rawPrizeType === "discount" ||
          rawPrizeType === "discount_balance" ||
          rawTitle.includes("折抵") ||
          rawTitle.includes("折抵金");

        const isCash =
          rawPrizeType === "money" ||
          rawPrizeType === "cash" ||
          rawTitle.includes("現金");

        // 真正回前端的格式
        const result = {
          id: Number(pick.id),
          name: rawTitle,
          prize_type: isScoin ? "scoin" : isDiscount ? "discount" : isCash ? "money" : (rawPrizeType || "none"),
          prize_value: Number(amount || 0),
          prize_text: rawPrizeText,
          image_url: rawImageUrl,
          probability: rawWeight,
        };

        // 入帳
        if (Number(amount) > 0) {
          if (isScoin) {
            await db
              .prepare("UPDATE users SET s_balance = COALESCE(s_balance,0) + ? WHERE id=?")
              .bind(Number(amount), Number(sess.user_id))
              .run();
          } else if (isDiscount) {
            await db
              .prepare("UPDATE users SET discount_balance = COALESCE(discount_balance,0) + ? WHERE id=?")
              .bind(Number(amount), Number(sess.user_id))
              .run();
          } else {
            await db
              .prepare("UPDATE users SET welfare_balance = COALESCE(welfare_balance,0) + ? WHERE id=?")
              .bind(Number(amount), Number(sess.user_id))
              .run();
          }
        }

        // 餘額後續會由前端 onRefreshMe 重新同步，這裡避免多一次查詢拖慢抽獎開始時間

        await insertWalletLog({
          user_id: Number(sess.user_id),
          username: String(sess.username),
          category: "raffle",
          action: "wheel_spin",
          status: "success",
          delta_welfare: isScoin || isDiscount ? 0 : Number(amount),
          delta_s: isScoin ? Number(amount) : 0,
          delta_discount: isDiscount ? Number(amount) : 0,
          result:
            Number(amount) > 0
              ? isScoin
                ? `中獎 S幣 ${Number(amount)}`
                : isDiscount
                ? `中獎 折抵金 ${Number(amount)}`
                : `中獎 福利金 ${Number(amount)}`
              : "未中獎",
          note: `輪盤抽獎：${String(rawTitle || "")}`,
        });

        await addDrawRecord({
          activity_key: "wheel",
          user_id: Number(sess.user_id),
          username: String(sess.username),
          status: Number(amount) > 0 ? "win" : "lose",
          prize_title: String(rawTitle || "輪盤"),
          prize_amount: Number(amount),
          note: "",
          meta: { prize_id: pick.id, left: dec.left },
        });

        await db
          .prepare(
            "INSERT INTO winners (activity_key, user_id, username, prize_title, prize_amount, meta_json, created_at) VALUES (?,?,?,?,?,?,datetime('now'))"
          )
          .bind(
            "wheel",
            Number(sess.user_id),
            String(sess.username),
            String(rawTitle || "輪盤"),
            Number(amount),
            JSON.stringify({ prize_id: pick.id, left: dec.left })
          )
          .run();

        return json({
          success: true,
          result,
          result_index,
          order_ids,
          left: dec.left,
          balances: null,
        });
      }

            // =========================
      // USER: records 查詢（抽獎紀錄）
      // GET /records?from=YYYY-MM-DD&to=YYYY-MM-DD&status=all|win|lose&type=all|redpacket|wheel|number&q=keyword&user_id=1212
      // - 使用者端：預設只能查自己（忽略 user_id）
      // - 最多 30 天
      // =========================
      if (url.pathname === "/records" && request.method === "GET") {
        const sess = await requireUser();
        if (!sess) return forbid("Unauthorized", 401);

        const qp = url.searchParams;

        // 前端常見參數
        const from = String(qp.get("from") || qp.get("start") || qp.get("date_from") || "").trim();
        const to = String(qp.get("to") || qp.get("end") || qp.get("date_to") || "").trim();

        const status = String(qp.get("status") || "all").trim(); // all | win | lose
        const type = String(qp.get("type") || qp.get("activity") || "all").trim(); // all | redpacket | wheel | number
        const q = String(qp.get("q") || qp.get("keyword") || "").trim();

        const limitRaw = Number(qp.get("limit") || 200);
        const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

        // ✅ 使用者只能查自己
        const userId = Number(sess.user_id);

// ---- 日期處理：若沒給，就預設今天；最多 30 天
const toDate = to ? new Date(`${to}T23:59:59.999`) : new Date();
const fromDate = from ? new Date(`${from}T00:00:00.000`) : new Date(toDate.getTime());

// 若未給 from，就同一天
if (!from) {
  fromDate.setHours(0, 0, 0, 0);
}

// 最多 30 天（含當天）
const maxRangeMs = 30 * 24 * 60 * 60 * 1000;
if (toDate.getTime() - fromDate.getTime() > maxRangeMs) {
  fromDate.setTime(toDate.getTime() - maxRangeMs);
}

// ✅ 改成 SQLite 同格式：YYYY-MM-DD HH:MM:SS
const fromDT = from ? taipeiYmdToUtcSql(from, "start") : taipeiYmdToUtcSql(to || formatInTaipei(new Date()).slice(0, 10), "start");
const toDT = to ? taipeiYmdToUtcSql(to, "end") : toSqliteDT(new Date());

let sql = `
  SELECT id, activity_key, user_id, username, status,
         prize_title, prize_amount, note, meta_json, created_at
  FROM draw_records
  WHERE user_id = ?
    AND datetime(created_at) >= datetime(?)
    AND datetime(created_at) <= datetime(?)
`;

const binds = [userId, fromDT, toDT];

        if (status !== "all" && (status === "win" || status === "lose")) {
          sql += ` AND status = ?`;
          binds.push(status);
        }

        if (type !== "all" && ["redpacket", "wheel", "number"].includes(type)) {
          sql += ` AND activity_key = ?`;
          binds.push(type);
        }

        if (q) {
          // 關鍵字：會搜尋 prize_title / note / meta_json
          sql += ` AND (prize_title LIKE ? OR note LIKE ? OR meta_json LIKE ?)`;
          const like = `%${q}%`;
          binds.push(like, like, like);
        }

        sql += ` ORDER BY datetime(created_at) DESC LIMIT ?`;
        binds.push(limit);

        const rows = await db.prepare(sql).bind(...binds).all();
        const list = (rows?.results || []).map((r) => ({
          id: Number(r.id || 0),
          time: toTaipeiStringFromUtc(r.created_at),                 // 給前端顯示「時間」
          user_id: Number(r.user_id || 0),
          username: r.username || "",
          type: r.activity_key || "",         // 類型
          status: r.status || "",             // win/lose
          prize_title: r.prize_title || "",
          prize_amount: Number(r.prize_amount || 0),
          note: r.note || "",
          meta: (() => {
            try { return JSON.parse(r.meta_json || "{}"); } catch { return {}; }
          })(),
        }));

return json({
  success: true,
  range: { from: fromDT, to: toDT },
  count: list.length,
  items: list,
});
      }

      // ✅ 保險：有些前端會打 /draw-records 或 /draw_records
if ((url.pathname === "/draw-records" || url.pathname === "/draw_records") && request.method === "GET") {
  return applyCors(new Response(null, {
    status: 307,
    headers: { Location: "/records" },
  }));
}

      return json({ success: false, error: "Not Found" }, { status: 404 });
} catch (err) {
  return json(
    { success: false, error: String(err?.message || err) },
    { status: 500 }
  );
}
  },
};

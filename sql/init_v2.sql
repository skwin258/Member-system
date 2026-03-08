/* =========================
   使用者 / 管理員
========================= */
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,         -- 先用明碼，Step 3 我會幫你改成 hash
  role TEXT NOT NULL DEFAULT 'admin', -- admin | superadmin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,         -- 先用明碼，Step 3 我會幫你改成 hash
  display_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active', -- active|disabled

  welfare_balance INTEGER NOT NULL DEFAULT 0,

  rp_limit INTEGER,       -- null => 用活動預設
  wheel_limit INTEGER,    -- null => 用活動預設
  num_limit INTEGER,      -- null => 用活動預設
  num_authorized INTEGER NOT NULL DEFAULT 0, -- 0/1

  created_by_admin_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_created_by ON users(created_by_admin_id);

/* =========================
   活動設定（共用）
========================= */
CREATE TABLE IF NOT EXISTS activities (
  key TEXT PRIMARY KEY,        -- redpacket | wheel | number
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,           -- unix ms（可空）
  ends_at INTEGER,             -- unix ms（可空）
  daily_reset INTEGER NOT NULL DEFAULT 0,
  default_limit INTEGER NOT NULL DEFAULT 1,
  allow_user_override INTEGER NOT NULL DEFAULT 1,
  require_authorized INTEGER NOT NULL DEFAULT 0  -- number 專用
);

INSERT OR IGNORE INTO activities(key,name,enabled,sort_order,default_limit,allow_user_override,require_authorized)
VALUES
('redpacket','紅包抽獎',1,1,1,1,0),
('wheel','輪盤抽獎',1,2,1,1,0),
('number','數字抽獎',1,3,0,1,1);

/* =========================
   紅包：金額池（機率）
========================= */
CREATE TABLE IF NOT EXISTS redpacket_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount INTEGER NOT NULL,
  prob INTEGER NOT NULL,         -- 0~100（總和你後台控制）
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO redpacket_pool(id,amount,prob,enabled)
VALUES
(1,10,40,1),
(2,66,30,1),
(3,188,20,1),
(4,666,10,1);

/* =========================
   輪盤：獎項
========================= */
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'none',  -- money | item | none
  value INTEGER NOT NULL DEFAULT 0,   -- money=金額；item可先0
  prob INTEGER NOT NULL DEFAULT 0,    -- 0~100（總和100）
  image_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 範例 10 格（可改）
INSERT OR IGNORE INTO wheel_prizes(id,name,type,value,prob,enabled)
VALUES
(1,'參加獎','none',0,45,1),
(2,'66元','money',66,20,1),
(3,'188元','money',188,15,1),
(4,'金子','item',0,10,1),
(5,'666元','money',666,10,1);

/* =========================
   數字抽獎：設定
========================= */
CREATE TABLE IF NOT EXISTS number_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  min_number INTEGER NOT NULL DEFAULT 1,
  max_number INTEGER NOT NULL DEFAULT 100,
  winning_number INTEGER NOT NULL DEFAULT 66,

  reward_type TEXT NOT NULL DEFAULT 'money', -- money|item|text
  reward_value INTEGER NOT NULL DEFAULT 66,  -- money 金額
  reward_text TEXT,
  reward_image_url TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO number_settings(id,enabled,min_number,max_number,winning_number,reward_type,reward_value)
VALUES (1,0,1,100,66,'money',66);

/* =========================
   抽獎紀錄（後台中獎資訊）
========================= */
CREATE TABLE IF NOT EXISTS draw_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  activity_key TEXT NOT NULL,  -- redpacket|wheel|number
  result_type TEXT NOT NULL,   -- money|item|none|text
  result_value INTEGER NOT NULL DEFAULT 0,
  result_text TEXT,
  result_image_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  admin_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_draw_logs_activity ON draw_logs(activity_key);
CREATE INDEX IF NOT EXISTS idx_draw_logs_user ON draw_logs(user_id);
-- =========================
-- Wheel (輪盤抽獎) prizes
-- =========================
CREATE TABLE IF NOT EXISTS wheel_prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 對應活動 key（固定 wheel）
  activity_key TEXT NOT NULL DEFAULT 'wheel',

  -- 顯示名稱
  name TEXT NOT NULL,

  -- 類型：money / item / none
  prize_type TEXT NOT NULL DEFAULT 'none',

  -- 金額（money 用），或 0
  prize_value INTEGER NOT NULL DEFAULT 0,

  -- 額外文字（例如：參加獎、再接再厲）
  prize_text TEXT,

  -- 圖片（item 用）
  image_url TEXT,

  -- 機率（0~100，允許 0；前端仍顯示）
  probability REAL NOT NULL DEFAULT 0,

  -- 顯示排序（輪盤順序）
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- 是否啟用（1=顯示，0=隱藏）
  enabled INTEGER NOT NULL DEFAULT 1,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wheel_prizes_activity ON wheel_prizes(activity_key);
CREATE INDEX IF NOT EXISTS idx_wheel_prizes_enabled ON wheel_prizes(enabled);
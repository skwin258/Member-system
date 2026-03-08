-- 抽獎活動
CREATE TABLE IF NOT EXISTS raffles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  max_winners INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 參加者
CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 中獎者
CREATE TABLE IF NOT EXISTS winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raffle_id INTEGER NOT NULL,
  participant_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (raffle_id, participant_id)
);

-- 常用索引（加速查詢）
CREATE INDEX IF NOT EXISTS idx_participants_raffle ON participants(raffle_id);
CREATE INDEX IF NOT EXISTS idx_winners_raffle ON winners(raffle_id);
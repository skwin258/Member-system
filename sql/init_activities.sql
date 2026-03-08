-- activities：抽獎活動清單（控制前端按鈕顯示）
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,     -- redpacket / wheel / number
  title TEXT NOT NULL,           -- 按鈕顯示文字
  description TEXT DEFAULT '',
  start_at TEXT,
  end_at TEXT,
  status TEXT DEFAULT 'active'   -- active / disabled
);

-- 先清掉舊資料（避免重跑重複）
DELETE FROM activities;

-- 三個按鈕
INSERT INTO activities (code, title, description, status) VALUES
('redpacket', '紅包抽獎', '紅包抽獎活動', 'active'),
('wheel',     '輪盤抽獎', '輪盤抽獎活動', 'active'),
('number',    '數字抽獎', '數字抽獎活動', 'active');
export const SC_GRANT = 3000;
export const FOOTBALL_BASE_BET = 1000;

export const SC_SCHEMA = [
  `CREATE TRIGGER IF NOT EXISTS users_sc_signup AFTER INSERT ON users
   BEGIN
     UPDATE users SET sc_balance = ${SC_GRANT} WHERE id = NEW.id;
     UPDATE users SET sc_claim_day = date('now', '+8 hours') WHERE id = NEW.id;
     INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_sc, result)
     VALUES (datetime('now'), NEW.id, NEW.username, 'system', 'sc_signup', 'success', ${SC_GRANT}, '註冊贈送 SC 幣');
   END`,
  `CREATE TRIGGER IF NOT EXISTS users_sc_daily AFTER UPDATE OF sc_claim_day ON users
   WHEN NEW.sc_claim_day IS NOT OLD.sc_claim_day AND NEW.sc_balance = OLD.sc_balance + ${SC_GRANT}
   BEGIN
     INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_sc, result)
     VALUES (datetime('now'), NEW.id, NEW.username, 'system', 'sc_daily', 'success', ${SC_GRANT}, '每日領取 SC 幣');
   END`,
  `CREATE UNIQUE INDEX IF NOT EXISTS football_game_request ON football_games(user_id, request_id)`,
  `CREATE TRIGGER IF NOT EXISTS football_sc_bet AFTER INSERT ON football_games
   WHEN NEW.request_id IS NOT NULL
   BEGIN
     INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_sc, delta_s, result)
     SELECT datetime('now'), id, username, 'raffle', 'football_start', 'success',
            -min(sc_balance, NEW.bet_amount), -max(0, NEW.bet_amount - sc_balance), '足球射門投注'
     FROM users WHERE id = NEW.user_id;
     UPDATE users SET s_balance = s_balance - max(0, NEW.bet_amount - sc_balance),
                      sc_balance = max(0, sc_balance - NEW.bet_amount)
     WHERE id = NEW.user_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS football_s_prize AFTER UPDATE OF status ON football_games
   WHEN OLD.status = 'playing' AND NEW.status = 'claimed'
   BEGIN
     UPDATE users SET s_balance = s_balance + NEW.current_win WHERE id = NEW.user_id;
     INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_s, result)
     VALUES (datetime('now'), NEW.user_id, NEW.username, 'raffle', 'football_claim', 'success', NEW.current_win, '足球射門領獎');
     INSERT INTO draw_records (activity_key, user_id, username, status, prize_title, prize_amount, note, meta_json)
     VALUES ('football', NEW.user_id, NEW.username, 'win', '足球射門第' || NEW.current_step || '球領取',
             NEW.current_win, 'football_claim', json_object('game_id', NEW.id, 'current_step', NEW.current_step));
     INSERT INTO winners (activity_key, user_id, username, prize_title, prize_amount, meta_json)
     VALUES ('football', NEW.user_id, NEW.username, '足球射門第' || NEW.current_step || '球領取',
             NEW.current_win, json_object('game_id', NEW.id));
   END`,
];

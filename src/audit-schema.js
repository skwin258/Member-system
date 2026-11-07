export const AUDIT_SCHEMA = [
  `CREATE TRIGGER IF NOT EXISTS settle_shop_order
  AFTER INSERT ON shop_orders WHEN NEW.status = 'settling'
  BEGIN
    UPDATE users SET
      s_balance = COALESCE(s_balance, 0) - NEW.cost_s,
      welfare_balance = COALESCE(welfare_balance, 0) + (SELECT reward_welfare FROM shop_products WHERE id=NEW.product_id),
      discount_balance = COALESCE(discount_balance, 0) + (SELECT reward_discount FROM shop_products WHERE id=NEW.product_id)
    WHERE id=NEW.user_id;
    INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_s, delta_welfare, delta_discount, result, note)
    SELECT datetime('now'), NEW.user_id, NEW.username, 'shop', 'redeem', 'success', -NEW.cost_s, reward_welfare, reward_discount,
      printf('扣除 S幣 %d，獲得折抵金 %d 福利金 %d', NEW.cost_s, reward_discount, reward_welfare), '兌換：' || NEW.product_name
    FROM shop_products WHERE id=NEW.product_id;
    UPDATE shop_orders SET status='success' WHERE id=NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS revoke_locked_user_sessions
  AFTER UPDATE OF enabled, locked ON users WHEN NEW.enabled <> 1 OR NEW.locked <> 0
  BEGIN
    DELETE FROM user_sessions WHERE user_id=NEW.id;
    UPDATE module_tickets SET revoked=1 WHERE user_id=NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS revoke_disabled_admin_sessions
  AFTER UPDATE OF status ON admin_accounts WHEN LOWER(TRIM(COALESCE(NEW.status,''))) NOT IN ('active','enabled','')
  BEGIN
    DELETE FROM admin_sessions WHERE admin_id=NEW.id;
  END`,
  `CREATE TRIGGER IF NOT EXISTS settle_referral_verification
  AFTER UPDATE OF verified_rewarded_at ON referrals
  WHEN COALESCE(OLD.verified_rewarded_at,'') = '' AND COALESCE(NEW.verified_rewarded_at,'') <> ''
  BEGIN
    INSERT INTO user_activity_usage (user_id, activity_key, times_left, updated_at)
    SELECT NEW.referrer_user_id, 'redpacket', 1 + COALESCE((SELECT default_times FROM activities WHERE activity_key='redpacket'),0), datetime('now')
    UNION ALL
    SELECT NEW.referrer_user_id, 'wheel', 1 + COALESCE((SELECT default_times FROM activities WHERE activity_key='wheel'),0), datetime('now')
    UNION ALL
    SELECT NEW.referred_user_id, 'wheel', 1 + COALESCE((SELECT default_times FROM activities WHERE activity_key='wheel'),0), datetime('now')
    ON CONFLICT(user_id, activity_key) DO UPDATE SET
      times_left = 1 + CASE WHEN date(updated_at,'+8 hours') IS NOT date('now','+8 hours')
        AND (SELECT daily_reset FROM activities WHERE activity_key=excluded.activity_key)=1
        THEN excluded.times_left-1 ELSE times_left END,
      updated_at=excluded.updated_at;

    INSERT INTO draw_records (activity_key, user_id, username, status, prize_title, prize_amount, note, meta_json)
    SELECT 'redpacket', r.id, r.username, 'win', '推薦驗證獎勵-紅包次數+1', 0, 'referral_verify_bonus', json_object('code',NEW.code,'referred_user',u.username)
    FROM users r, users u WHERE r.id=NEW.referrer_user_id AND u.id=NEW.referred_user_id
    UNION ALL
    SELECT 'wheel', r.id, r.username, 'win', '推薦驗證獎勵-輪盤次數+1', 0, 'referral_verify_bonus', json_object('code',NEW.code,'referred_user',u.username)
    FROM users r, users u WHERE r.id=NEW.referrer_user_id AND u.id=NEW.referred_user_id
    UNION ALL
    SELECT 'wheel', u.id, u.username, 'win', 'LINE驗證獎勵-輪盤次數+1', 0, 'line_verify_bonus', json_object('code',NEW.code,'referrer_user',r.username)
    FROM users r, users u WHERE r.id=NEW.referrer_user_id AND u.id=NEW.referred_user_id;
  END`,
  `CREATE TABLE IF NOT EXISTS wheel_spin_settlements (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, username TEXT NOT NULL,
    prize_id INTEGER NOT NULL, title TEXT NOT NULL, amount INTEGER NOT NULL,
    currency TEXT NOT NULL, forced INTEGER NOT NULL
  )`,
  `CREATE TRIGGER IF NOT EXISTS settle_wheel_spin AFTER INSERT ON wheel_spin_settlements
  BEGIN
    UPDATE user_activity_usage SET times_left=times_left-1, updated_at=datetime('now')
    WHERE user_id=NEW.user_id AND activity_key='wheel';
    UPDATE users SET
      first_wheel_forced_done=CASE WHEN NEW.forced=1 THEN 1 ELSE first_wheel_forced_done END,
      s_balance=COALESCE(s_balance,0)+CASE WHEN NEW.currency='scoin' THEN NEW.amount ELSE 0 END,
      welfare_balance=COALESCE(welfare_balance,0)+CASE WHEN NEW.currency='welfare' THEN NEW.amount ELSE 0 END,
      discount_balance=COALESCE(discount_balance,0)+CASE WHEN NEW.currency='discount' THEN NEW.amount ELSE 0 END
    WHERE id=NEW.user_id;
    INSERT INTO wallet_logs (created_at, user_id, account, category, action, status, delta_s, delta_welfare, delta_discount, result, note)
    VALUES (datetime('now'), NEW.user_id, NEW.username, 'raffle', 'wheel_spin', 'success',
      CASE WHEN NEW.currency='scoin' THEN NEW.amount ELSE 0 END,
      CASE WHEN NEW.currency='welfare' THEN NEW.amount ELSE 0 END,
      CASE WHEN NEW.currency='discount' THEN NEW.amount ELSE 0 END,
      CASE WHEN NEW.amount=0 THEN '未中獎' ELSE '中獎 ' ||
        CASE NEW.currency WHEN 'scoin' THEN 'S幣' WHEN 'discount' THEN '折抵金' ELSE '福利金' END || ' ' || NEW.amount END,
      '輪盤抽獎：' || NEW.title);
    INSERT INTO draw_records (activity_key, user_id, username, status, prize_title, prize_amount, note, meta_json)
    SELECT 'wheel', NEW.user_id, NEW.username, CASE WHEN NEW.amount>0 THEN 'win' ELSE 'lose' END,
      NEW.title, NEW.amount, '', json_object('prize_id',NEW.prize_id,'left',times_left)
    FROM user_activity_usage WHERE user_id=NEW.user_id AND activity_key='wheel';
    INSERT INTO winners (activity_key, user_id, username, prize_title, prize_amount, meta_json)
    SELECT 'wheel', NEW.user_id, NEW.username, NEW.title, NEW.amount, json_object('prize_id',NEW.prize_id,'left',times_left)
    FROM user_activity_usage WHERE user_id=NEW.user_id AND activity_key='wheel';
  END`,
];

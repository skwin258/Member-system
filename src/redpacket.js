const MAX_COUNT = 100;
const safeAmount = value => Number.isSafeInteger(value) && value >= 0;

export const REDPACKET_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS redpacket_draws (
    user_id INTEGER NOT NULL, request_id TEXT NOT NULL, board_id TEXT NOT NULL, round_no INTEGER NOT NULL,
    slot INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount>=0),
    PRIMARY KEY(user_id, request_id), UNIQUE(user_id, board_id, round_no, slot)
  )`,
  `CREATE TRIGGER IF NOT EXISTS redpacket_draw_settle AFTER INSERT ON redpacket_draws
    BEGIN
      UPDATE user_activity_usage SET times_left=times_left-1, updated_at=datetime('now')
      WHERE user_id=NEW.user_id AND activity_key='redpacket' AND times_left>0;
      SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'redpacket usage unavailable') END;
      UPDATE users SET welfare_balance=COALESCE(welfare_balance,0)+NEW.amount WHERE id=NEW.user_id;
      SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'redpacket user unavailable') END;
      INSERT INTO wallet_logs(created_at,user_id,account,category,action,status,delta_welfare,result,note)
      SELECT datetime('now'),id,username,'raffle','redpacket_draw','success',NEW.amount,
             CASE WHEN NEW.amount>0 THEN '中獎 福利金 ' || NEW.amount ELSE '未中獎' END,'紅包抽獎'
      FROM users WHERE id=NEW.user_id;
      INSERT INTO draw_records(activity_key,user_id,username,status,prize_title,prize_amount,note,meta_json,created_at)
      SELECT 'redpacket',id,username,CASE WHEN NEW.amount>0 THEN 'win' ELSE 'lose' END,'紅包',NEW.amount,
             'redpacket_draw',json_object('request_id',NEW.request_id,'slot',NEW.slot),datetime('now')
      FROM users WHERE id=NEW.user_id;
      INSERT INTO winners(activity_key,user_id,username,prize_title,prize_amount,meta_json,created_at)
      SELECT 'redpacket',id,username,'紅包',NEW.amount,json_object('request_id',NEW.request_id),datetime('now')
      FROM users WHERE id=NEW.user_id AND NEW.amount>0;
    END`,
];

function readPool(value) {
  try {
    const rows = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(rows) || rows.length > 200) return null;
    const pool = rows.map(row => ({
      amount: Number(row?.amount ?? 0), prob: Number(row?.prob ?? row?.weight ?? 0),
      enabled: Number(row?.enabled ?? 1) ? 1 : 0, sort: Number(row?.sort ?? 0),
    }));
    return pool.every(row => safeAmount(row.amount) && Number.isFinite(row.prob) && row.prob >= 0
      && row.prob <= 1e9 && Number.isFinite(row.sort)) ? pool : null;
  } catch {
    return null;
  }
}

export function parseRedpacketConfig(config, poolInput) {
  const mode = config?.mode || "pool";
  const fixed = Number(config?.fixed_amount ?? 0);
  const count = Number(config?.count ?? 30);
  const allowRepeat = Number(config?.allow_repeat ?? 1) === 1;
  const lock = Number(config?.lock_when_all_opened ?? 0) === 1;
  const pool = readPool(poolInput ?? config?.pool_json ?? []);
  if (!["pool", "fixed"].includes(mode) || !safeAmount(fixed) || !Number.isInteger(count) ||
    count < 1 || count > MAX_COUNT || !pool) return null;
  return { mode, fixed, count, allowRepeat, lock, pool };
}

export function redpacketConfigError(rules) {
  if (!rules) return "紅包設定有誤，請聯絡客服";
  if (rules.mode === "fixed") return "";
  const active = rules.pool.filter(row => row.enabled && row.prob > 0);
  if (!active.length) return "紅包尚未設定可抽獎項";
  if (!rules.allowRepeat && new Set(active.map(row => row.amount)).size < rules.count) {
    return "禁止重複金額時，可抽金額的種類須至少等於紅包格數";
  }
  return "";
}

async function getRedpacketBoard(db, userId, rules, enabled) {
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rules)));
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
  const boardId = today + "-" + hash.slice(0, 20);
  const [{ results }, usage, used] = await Promise.all([
    db.prepare(`SELECT round_no,slot,amount FROM redpacket_draws WHERE user_id=? AND board_id=?
      AND round_no=(SELECT MAX(round_no) FROM redpacket_draws WHERE user_id=? AND board_id=?)`)
      .bind(userId, boardId, userId, boardId).all(),
    db.prepare("SELECT times_left FROM user_activity_usage WHERE user_id=? AND activity_key='redpacket'").bind(userId).first(),
    db.prepare("SELECT COUNT(*) AS total FROM draw_records WHERE user_id=? AND activity_key='redpacket' AND prize_title='紅包' AND note IN ('','redpacket_draw') AND created_at>=datetime(?, '-8 hours')")
      .bind(userId, today).first(),
  ]);
  const count = rules?.count ?? 30;
  const full = results.length >= count;
  const resetEachDraw = Boolean(rules && !rules.lock && (rules.mode === "fixed" || rules.allowRepeat));
  const reset = Boolean(results.length && resetEachDraw) || (full && !rules?.lock);
  const round = Number(results[0]?.round_no ?? 1) + Number(reset);
  const rows = reset ? [] : results;
  return {
    boardId, round, rows, resetEachDraw,
    state: {
      enabled, count, board: boardId + ":" + round, opened: rows.map(row => row.slot),
      locked: Boolean(full && rules?.lock), left: Math.max(0, Number(usage?.times_left || 0)),
      used: Number(used?.total || 0), error: redpacketConfigError(rules),
    },
  };
}

function pickRedpacketAmount(rules, opened) {
  if (rules.mode === "fixed") return rules.fixed;
  const used = new Set(opened.map(row => row.amount));
  const pool = rules.pool.filter(row => row.enabled && row.prob > 0 && (rules.allowRepeat || !used.has(row.amount)));
  let roll = Math.random() * pool.reduce((sum, row) => sum + row.prob, 0);
  for (const row of pool) {
    roll -= row.prob;
    if (roll < 0) return row.amount;
  }
  return pool.at(-1)?.amount;
}

async function insertRedpacketDraw(db, { userId, requestId, boardId, round, slot, amount, uniqueAmount, resetEachDraw }) {
  await db.prepare(`INSERT INTO redpacket_draws(user_id,request_id,board_id,round_no,slot,amount)
    SELECT ?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM user_activity_usage WHERE user_id=? AND activity_key='redpacket' AND times_left>0
    ) AND (?=0 OR NOT EXISTS (
      SELECT 1 FROM redpacket_draws WHERE user_id=? AND board_id=? AND round_no=? AND (?=1 OR amount=?)
    )) ON CONFLICT DO NOTHING`)
    .bind(userId,requestId,boardId,round,slot,amount,userId,Number(uniqueAmount || resetEachDraw),userId,boardId,round,Number(resetEachDraw),amount).run();
}

export async function handleRedpacket({ request, url, db, requireUser, safeJson, activityEnabledNow, ensureUsageRow, json, forbid }) {
  if (url.pathname === "/redpacket/claim" && request.method === "POST") {
    return forbid("請前往首頁的每日任務取得紅包次數", 410);
  }
  const isConfig = url.pathname === "/redpacket/config" && request.method === "GET";
  const isDraw = url.pathname === "/redpacket/draw" && request.method === "POST";
  if (!isConfig && !isDraw) return null;

  const sess = await requireUser();
  if (!sess) return forbid("Unauthorized", 401);
  const userId = Number(sess.user_id);
  const user = await db.prepare("SELECT id FROM users WHERE id=? AND enabled=1 AND locked=0").bind(userId).first();
  if (!user) return forbid("會員帳號暫時無法使用", 403);
  const body = isDraw ? await safeJson(request) : null;
  const requestId = body?.request_id;
  if (isDraw && (typeof requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestId))) {
    return forbid("請重新開啟紅包頁面再抽獎", 400);
  }
  const getResult = () => db.prepare("SELECT amount,board_id,round_no,slot FROM redpacket_draws WHERE user_id=? AND request_id=?")
    .bind(userId, requestId).first();
  const [act, config] = await Promise.all([
    db.prepare("SELECT * FROM activities WHERE activity_key='redpacket'").first(),
    db.prepare("SELECT mode,fixed_amount,pool_json,count,allow_repeat,lock_when_all_opened FROM redpacket_config WHERE id=1").first(),
  ]);
  const enabled = activityEnabledNow(act);
  const rules = parseRedpacketConfig({ ...config, count: Number(config?.count || 30) });
  if (enabled) await ensureUsageRow(userId, "redpacket");
  const loadBoard = () => getRedpacketBoard(db, userId, rules, enabled);
  const board = await loadBoard();
  const state = board.state;
  if (isConfig) return json({ success: true, ...state });
  const previous = await getResult();
  const matches = result => result.slot === body.slot && result.board_id + ":" + result.round_no === body.board;
  if (previous) {
    if (!matches(previous)) return forbid("紅包請求已使用", 409);
    return json({ success: true, amount: previous.amount, ...state });
  }
  if (!enabled) return forbid("紅包活動暫停開放", 403);
  if (state.error) return forbid(state.error, 409);
  if (body.board !== state.board || state.locked) return forbid("紅包盤面已更新或鎖定", 409);
  const slot = body.slot;
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.count) return forbid("紅包位置錯誤", 400);
  if (state.opened.includes(slot)) return forbid("這個紅包已經開過", 409);
  if (!state.left) return forbid("抽獎次數不足", 403);
  const amount = pickRedpacketAmount(rules, board.rows);
  if (amount === undefined) return forbid("目前沒有可抽獎項", 409);

  await insertRedpacketDraw(db, {
    userId, requestId, boardId: board.boardId, round: board.round, slot, amount,
    uniqueAmount: rules.mode === "pool" && !rules.allowRepeat,
    resetEachDraw: board.resetEachDraw,
  });
  const result = await getResult();
  if (!result) return forbid("紅包盤面或次數已更新，請再試一次", 409);
  if (!matches(result)) return forbid("紅包請求已使用", 409);
  return json({ success: true, amount: result.amount, ...(await loadBoard()).state });
}

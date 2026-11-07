import { defaultGameRules } from "./game-settings.js";

export const ARCADE_ROUND_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS arcade_rounds (
     id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, game TEXT NOT NULL,
     cost INTEGER NOT NULL, spent_sc INTEGER NOT NULL, rules TEXT NOT NULL,
     challenge TEXT NOT NULL, started_at INTEGER NOT NULL, ready_at INTEGER,
     armed_at INTEGER, status TEXT NOT NULL DEFAULT 'playing',
     elapsed INTEGER, reward INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE INDEX IF NOT EXISTS arcade_round_owner ON arcade_rounds(user_id, game, started_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS claw_round_successor ON arcade_rounds(json_extract(challenge,'$.previous'))
   WHERE game='claw' AND json_extract(challenge,'$.previous') IS NOT NULL`,
  `CREATE TRIGGER IF NOT EXISTS arcade_round_debit AFTER UPDATE OF status ON arcade_rounds
   WHEN OLD.status='prepared' AND NEW.status='playing'
   BEGIN
     UPDATE users SET sc_balance=sc_balance-NEW.spent_sc,
                      s_balance=s_balance-(NEW.cost-NEW.spent_sc) WHERE id=NEW.user_id;
     INSERT INTO wallet_logs (created_at,user_id,account,category,action,status,delta_sc,delta_s,result)
     SELECT datetime('now'),id,username,'raffle',NEW.game || '_start','success',
            -NEW.spent_sc,-(NEW.cost-NEW.spent_sc),'遊戲扣款'
     FROM users WHERE id=NEW.user_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS arcade_round_credit AFTER UPDATE OF status ON arcade_rounds
   WHEN OLD.status='playing' AND NEW.status IN ('finished','refunded')
        AND (NEW.reward>0 OR NEW.status='refunded')
   BEGIN
     UPDATE users SET sc_balance=sc_balance+CASE WHEN NEW.status='refunded' THEN NEW.spent_sc ELSE 0 END,
       s_balance=s_balance+CASE WHEN NEW.status='refunded' THEN NEW.cost-NEW.spent_sc ELSE NEW.reward END
     WHERE id=NEW.user_id;
     INSERT INTO wallet_logs (created_at,user_id,account,category,action,status,delta_sc,delta_s,result)
     SELECT datetime('now'),id,username,'raffle',NEW.game || '_' || NEW.status,'success',
            CASE WHEN NEW.status='refunded' THEN NEW.spent_sc ELSE 0 END,
            CASE WHEN NEW.status='refunded' THEN NEW.cost-NEW.spent_sc ELSE NEW.reward END,
            CASE WHEN NEW.status='refunded' THEN '遊戲退款' ELSE '遊戲獎勵' END
     FROM users WHERE id=NEW.user_id;
   END`,
];

export async function gameRules(db, key) {
  const row = await db.prepare("SELECT config FROM arcade_game_settings WHERE game_key=?").bind(key).first();
  return { ...defaultGameRules(key), ...(row ? JSON.parse(row.config) : {}) };
}

export async function handleClawRound(db, verifier, userId, action, body) {
  const now = Date.now();
  if (action === "prepare") {
    const currentRules = await gameRules(db, "claw");
    let rules = currentRules;
    const previous = body?.previous;
    const persistent = body?.persistent === true || previous !== undefined;
    let seed = crypto.getRandomValues(new Uint32Array(1))[0];
    if (!currentRules.enabled) return fail("夾娃娃機暫停開放", 403);
    if (previous !== undefined) {
      if (!validId(previous)) return fail("無效的遊戲編號");
      const prior = await db.prepare("SELECT rules,challenge FROM arcade_rounds WHERE id=? AND user_id=? AND game='claw' AND status='finished'")
        .bind(previous, userId).first();
      const previousResult = prior && JSON.parse(prior.challenge);
      if (!previousResult?.checkpoint) return fail("無法接續上一局，請返回大廳再進入");
      if (!previousResult.checkpoint.machine.toys.length) return fail("娃娃已經夾完，請返回大廳再進入");
      seed = previousResult.seed;
      rules = JSON.parse(prior.rules);
    }
    const id = crypto.randomUUID();
    const inserted = await db.prepare(
      `INSERT OR IGNORE INTO arcade_rounds (id,user_id,game,cost,spent_sc,rules,challenge,started_at,status)
       VALUES (?,?,'claw',?,0,?,?,?,'prepared')`
    ).bind(id, userId, rules.cost, JSON.stringify(rules),
      JSON.stringify(persistent ? { seed, persistent, previous } : seed), now).run();
    if (!inserted.meta?.changes) {
      const existing = await db.prepare(
        `SELECT id,status FROM arcade_rounds WHERE game='claw' AND user_id=? AND json_extract(challenge,'$.previous')=?`
      ).bind(userId, previous ?? null).first();
      if (!existing || existing.status === "finished") return fail("這一局已結束，請返回大廳再進入", 409);
      return { success: true, id: existing.id, rules, seed };
    }
    return { success: true, id, rules, ...(persistent ? { seed } : {}) };
  }
  if (!validId(body?.id)) return fail("無效的遊戲編號");
  const getRound = () => db.prepare("SELECT * FROM arcade_rounds WHERE id=? AND user_id=? AND game='claw'")
    .bind(body.id, userId).first();
  let round = await getRound();
  if (!round) return fail("找不到這一局");
  const challenge = JSON.parse(round.challenge);
  const seed = typeof challenge === "number" ? challenge : challenge.seed;
  const rules = JSON.parse(round.rules);
  if (action === "start") {
    if (round.status === "prepared") {
      if (!challenge.persistent && now - round.started_at > 600000) return fail("請重新開啟遊戲");
      await db.prepare(
        `UPDATE arcade_rounds SET status='playing', started_at=?,
           spent_sc=min(cost,(SELECT sc_balance FROM users WHERE id=?))
         WHERE id=? AND user_id=? AND status='prepared'
         AND cost <= (SELECT sc_balance+s_balance FROM users WHERE id=?)`
      ).bind(now, userId, round.id, userId, userId).run();
      round = await getRound();
      if (round.status === "prepared") return fail("SC 幣與 S 幣餘額不足");
    }
    return response(db, userId, { id: round.id, seed, rules, status: round.status });
  }
  if (action !== "finish") return fail("找不到遊戲操作", 404);
  if (round.status === "prepared") return fail("遊戲尚未開始");
  if (round.status === "playing") {
    if (!Array.isArray(body.moves) || body.moves.length > 1200 ||
        body.moves.some(span => !Array.isArray(span) || span.length !== 3 || !span.every(Number.isInteger))) {
      return fail("無效的搖桿操作紀錄");
    }
    const acquired = await db.prepare(
      `UPDATE arcade_rounds SET armed_at=?
       WHERE id=? AND status='playing' AND (armed_at IS NULL OR armed_at<=?)`
    ).bind(now, round.id, now - 30000).run();
    if (acquired.meta?.changes) {
      try {
        const prior = challenge.previous && await db.prepare(
          "SELECT challenge FROM arcade_rounds WHERE id=? AND user_id=? AND game='claw' AND status='finished'"
        ).bind(challenge.previous, userId).first();
        const previous = prior && JSON.parse(prior.challenge).checkpoint;
        if (challenge.previous && !previous) return fail("無法讀取上一局的機台狀態", 503);
        const result = await verifier.fetch("https://claw-verifier.internal/replay", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seed, rules, moves: body.moves,
            ...(challenge.persistent ? { previous, persist: true } : {}) }),
        });
        if (result.status === 400) return fail("無效的搖桿操作紀錄");
        if (!result.ok) return fail("夾娃娃機結算暫時無法使用，請重試", 503);
        const { prizes, checkpoint } = await result.json();
        if (!Number.isInteger(prizes) || prizes < 0 || prizes > 24) return fail("無法確認本局結果", 503);
        if (challenge.persistent && (!checkpoint?.world || !Array.isArray(checkpoint?.machine?.toys))) {
          return fail("無法保存機台狀態，請重試", 503);
        }
        await db.prepare(
          `UPDATE arcade_rounds SET status='finished', reward=?, challenge=?
           WHERE id=? AND status='playing' AND armed_at=?`
        ).bind(prizes * rules.reward, JSON.stringify({ seed, prizes, persistent: challenge.persistent,
          previous: challenge.previous, checkpoint }), round.id, now).run();
      } catch {
        return fail("夾娃娃機結算暫時無法使用，請重試", 503);
      } finally {
        await db.prepare("UPDATE arcade_rounds SET armed_at=NULL WHERE id=? AND status='playing' AND armed_at=?")
          .bind(round.id, now).run();
      }
    }
    round = await getRound();
  }
  if (round.status !== "finished") return fail("本局仍在結算，請稍後重試", 409);
  const result = JSON.parse(round.challenge);
  return response(db, userId, { prizes: result.prizes, reward: round.reward, checkpoint: result.checkpoint });
}

function shuffledBoard(size) {
  const values = Array.from({ length: size * size }, (_, i) => i + 1);
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

async function response(db, userId, fields = {}) {
  const wallet = await db.prepare("SELECT sc_balance, s_balance FROM users WHERE id=?").bind(userId).first();
  return { success: true, ...fields, ...wallet };
}

const fail = (error, status = 400) => ({ success: false, error, status });
const validId = id => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);

export async function handleArcadeRound(db, userId, game, action, body) {
  const now = Date.now();
  if (action === "prepare") {
    const rules = await gameRules(db, game);
    if (!rules.enabled) return fail("遊戲暫停開放", 403);
    const id = crypto.randomUUID();
    const board = game === "numbers" ? shuffledBoard(rules.grid) : [];
    // The prepared board and policy snapshot do not touch the wallet.
    await db.prepare(
      `INSERT INTO arcade_rounds (id,user_id,game,cost,spent_sc,rules,challenge,started_at,status)
       VALUES (?,?,?,?,0,?,?,?,'prepared')`
    ).bind(id, userId, game, rules.cost, JSON.stringify(rules), JSON.stringify(board), now).run();
    return { success: true, id, board, rules };
  }

  if (!validId(body?.id)) return fail("無效的遊戲編號");
  const getRound = () => db.prepare("SELECT * FROM arcade_rounds WHERE id=? AND user_id=? AND game=?")
    .bind(body.id, userId, game).first();
  if (action === "start") {
    const prior = await getRound();
    if (!prior || (prior.status === "prepared" && now - prior.started_at > 600000)) return fail("請重新開啟遊戲");
    if (prior.status !== "prepared") return response(db, userId, { id: prior.id, status: prior.status });
    const rules = JSON.parse(prior.rules);
    const ready = game === "reaction" ? now + rules.minWait + Math.floor(Math.random() * (rules.waitRange + 1)) : null;
    await db.prepare(
      `UPDATE arcade_rounds SET status='playing', started_at=?, ready_at=?,
         spent_sc=min(cost,(SELECT sc_balance FROM users WHERE id=?))
       WHERE id=? AND user_id=? AND status='prepared'
       AND cost <= (SELECT sc_balance+s_balance FROM users WHERE id=?)`
    ).bind(now, ready, userId, body.id, userId, userId).run();
    const round = await getRound();
    if (round.status === "prepared") return fail("SC 幣與 S 幣餘額不足");
    return response(db, userId, { id: round.id, status: round.status });
  }

  let round = await getRound();
  if (!round) return fail("遊戲尚未開始");
  const rules = JSON.parse(round.rules);
  if (action === "signal" && game === "reaction") {
    if (round.status !== "playing") return fail("本局已結束", 409);
    if (now < round.ready_at) {
      await new Promise(resolve => setTimeout(resolve, Math.min(3000, round.ready_at - now)));
      round = await getRound();
      if (round.status !== "playing") return fail("本局已結束", 409);
      if (Date.now() < round.ready_at) return { success: true, ready: false };
    }
    const signalAt = Date.now();
    if (signalAt - round.ready_at > 30000) return fail("本局已逾時", 409);
    await db.prepare("UPDATE arcade_rounds SET armed_at=?, challenge=? WHERE id=? AND status='playing' AND armed_at IS NULL")
      .bind(signalAt, JSON.stringify(crypto.randomUUID()), round.id).run();
    const armed = await getRound();
    return armed.status === "playing"
      ? { success: true, ready: true, signal_token: JSON.parse(armed.challenge) }
      : fail("本局已結束", 409);
  }

  if (action !== "finish") return fail("找不到遊戲操作", 404);
  if (round.status === "prepared") return fail("遊戲尚未開始");
  if (round.status === "playing") {
    let elapsed;
    let status = "finished";
    let reward = 0;
    if (game === "numbers") {
      const board = JSON.parse(round.challenge);
      if (!Array.isArray(body.moves) || body.moves.length !== board.length ||
          body.moves.some((position, index) => board[position] !== index + 1)) return fail("數字順序不符");
      elapsed = now - round.started_at;
    } else if (round.armed_at === null) {
      status = rules.refundEarly ? "refunded" : "finished";
    } else if (body.signal_token === JSON.parse(round.challenge)) {
      const serverWindow = now - round.armed_at;
      const measured = body.measured_ms;
      if (measured === undefined) {
        elapsed = serverWindow;
      } else {
        if (!Number.isInteger(measured) || measured < 1 || measured > serverWindow + 25) {
          return fail("無法確認反應時間");
        }
        elapsed = serverWindow <= 60000 ? measured : serverWindow;
      }
    }
    if (elapsed !== undefined) {
      reward = Math.max(0, ...[1, 2, 3].filter(i => elapsed <= rules["limit" + i]).map(i => rules["reward" + i]));
    }
    await db.prepare(
      "UPDATE arcade_rounds SET status=?, elapsed=?, reward=? WHERE id=? AND status='playing' AND armed_at IS ?"
    ).bind(status, elapsed ?? null, reward, round.id, round.armed_at).run();
  }
  const settled = await getRound();
  if (settled.status === "playing") return fail("遊戲狀態已更新，請再試一次", 409);
  return response(db, userId, {
    elapsed: settled.elapsed, reward: settled.reward, refund: settled.status === "refunded" ? settled.cost : 0,
  });
}

export const DAILY_TASK_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS daily_task_proofs (
    id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, task TEXT NOT NULL, task_day TEXT NOT NULL,
    image_key TEXT, status TEXT NOT NULL, submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, task, task_day)
  )`,
  `CREATE INDEX IF NOT EXISTS daily_task_proofs_pending ON daily_task_proofs(status, submitted_at)`,
  `CREATE TABLE IF NOT EXISTS daily_task_claims (
    user_id INTEGER NOT NULL, task TEXT NOT NULL, task_day TEXT NOT NULL,
    claim_day TEXT NOT NULL, PRIMARY KEY(user_id, task, task_day)
  )`,
  `CREATE INDEX IF NOT EXISTS daily_task_claims_progress ON daily_task_claims(user_id, claim_day)`,
  `CREATE TRIGGER IF NOT EXISTS daily_task_redpacket_grant AFTER INSERT ON daily_task_claims
    BEGIN
      INSERT INTO user_activity_usage (user_id, activity_key, times_left, updated_at)
      VALUES (NEW.user_id, 'redpacket', 1 + COALESCE((SELECT default_times FROM activities WHERE activity_key='redpacket'), 0), datetime('now'))
      ON CONFLICT(user_id, activity_key) DO UPDATE SET times_left=times_left+1, updated_at=datetime('now');
    END`,
];

const verification = ["instagram", "threads"];
const social = ["share_post", "like_post", "share_story"];
const daily = ["checkin", ...social];
const allTasks = [...verification, ...daily];
export const DAILY_TASK_PROOF_PREFIX = "daily-task-proofs/";
const taipeiDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const taskDay = (task, today) => verification.includes(task) ? "" : today;

async function statuses(db, user, today) {
  const id = user.id;
  const [{ results: proofs }, { results: claims }] = await Promise.all([
    db.prepare("SELECT task,status FROM daily_task_proofs WHERE user_id=? AND task_day IN ('',?)").bind(id, today).all(),
    db.prepare("SELECT task,claim_day FROM daily_task_claims WHERE user_id=? AND task_day IN ('',?)").bind(id, today).all(),
  ]);
  return {
    day: today,
    tasks: Object.fromEntries(allTasks.map(task => [
      task,
      claims.some(row => row.task === task) ? "claimed" :
        task === "checkin" ? (user.sc_claim_day === today ? "approved" : "available") :
        proofs.find(row => row.task === task)?.status || "available",
    ])),
    hiddenTasks: claims.filter(row => verification.includes(row.task) && row.claim_day < today).map(row => row.task),
    progress: claims.filter(row => daily.includes(row.task) && row.claim_day === today).length,
  };
}

async function validImage(file) {
  if (!file || typeof file === "string" || !imageTypes.has(file.type) || !file.size || file.size > 6 * 1024 * 1024) return false;
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/png") return [137,80,78,71,13,10,26,10].every((byte, i) => b[i] === byte);
  if (file.type === "image/jpeg") return b[0] === 255 && b[1] === 216 && b[2] === 255;
  return String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP";
}

export async function handleDailyTasks({ request, url, db, env, requireUser, requireAdmin, isSuperAdmin, json, forbid }) {
  const path = url.pathname;
  if (path !== "/daily-tasks" && !path.startsWith("/daily-tasks/") && !path.startsWith("/admin/daily-tasks/")) return null;
  const today = taipeiDay();

  if (!path.startsWith("/admin/")) {
    const session = await requireUser();
    if (!session) return forbid("請先登入會員", 401);
    const user = await db.prepare("SELECT id, sc_claim_day FROM users WHERE id=? AND enabled=1 AND locked=0").bind(session.user_id).first();
    if (!user) return forbid("會員帳號暫時無法使用", 403);
    if (path === "/daily-tasks" && request.method === "GET") return json({ success: true, ...await statuses(db, user, today) });

    const proofTask = path.match(/^\/daily-tasks\/proof\/(instagram|threads)$/)?.[1];
    if (proofTask && request.method === "POST") {
      const bucket = env.RAFFLE_R2;
      if (!bucket) return forbid("圖片上傳服務暫時無法使用", 503);
      const old = await db.prepare("SELECT status,image_key FROM daily_task_proofs WHERE user_id=? AND task=? AND task_day=''").bind(user.id, proofTask).first();
      if (old && old.status !== "revoked") return forbid("已送出驗證資料", 409);
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!await validImage(file)) return forbid("請選擇 6 MB 以內的 PNG、JPG 或 WebP 截圖", 400);
      const id = crypto.randomUUID();
      const key = DAILY_TASK_PROOF_PREFIX + id;
      await bucket.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
      let saved;
      try {
        saved = await db.prepare(`INSERT INTO daily_task_proofs(id,user_id,task,task_day,image_key,status)
          VALUES (?,?,?,'',?,'pending') ON CONFLICT(user_id,task,task_day) DO UPDATE
          SET id=excluded.id,image_key=excluded.image_key,status='pending',submitted_at=datetime('now')
          WHERE daily_task_proofs.status='revoked'`).bind(id, user.id, proofTask, key).run();
      } catch (error) {
        await bucket.delete(key).catch(() => {});
        throw error;
      }
      if (!saved.meta?.changes) {
        await bucket.delete(key);
        return forbid("已送出驗證資料", 409);
      }
      if (old?.image_key) await bucket.delete(old.image_key).catch(() => {});
      return json({ success: true, ...await statuses(db, user, today) });
    }

    const task = path.match(/^\/daily-tasks\/claim\/([a-z_]+)$/)?.[1];
    if (task && allTasks.includes(task) && request.method === "POST") {
      const day = taskDay(task, today);
      const condition = task === "checkin"
        ? "EXISTS (SELECT 1 FROM users WHERE id=? AND sc_claim_day=?)"
        : "EXISTS (SELECT 1 FROM daily_task_proofs WHERE user_id=? AND task_day=? AND task=? AND status='approved')";
      const args = task === "checkin" ? [user.id, today] : [user.id, day, task];
      const result = await db.prepare(`INSERT OR IGNORE INTO daily_task_claims(user_id,task,task_day,claim_day)
        SELECT ?,?,?,? WHERE ${condition}`).bind(user.id, task, day, today, ...args).run();
      if (!result.meta?.changes) {
        const state = await statuses(db, user, today);
        if (state.tasks[task] !== "claimed") return forbid("尚未完成這個任務", 409);
        return json({ success: true, ...state });
      }
      return json({ success: true, ...await statuses(db, user, today) });
    }
    return forbid("找不到任務", 404);
  }

  const session = await requireAdmin();
  if (!session) return forbid("請先登入後台", 401);
  const admin = await db.prepare("SELECT id,role,status FROM admin_accounts WHERE id=?").bind(session.admin_id).first();
  if (!admin || !["active", "enabled"].includes(String(admin.status).toLowerCase())) return forbid("管理員權限已停用", 403);
  const superAdmin = isSuperAdmin(admin);
  const owner = Number(admin.id);
  if (path === "/admin/daily-tasks/notifications" && request.method === "GET") {
    const { results } = await db.prepare(`SELECT p.id, p.user_id, p.task, p.submitted_at, u.username, u.admin_nickname
      FROM daily_task_proofs p JOIN users u ON u.id=p.user_id
      WHERE p.status='pending' AND (?=1 OR u.created_by_admin_id=?)
      ORDER BY p.submitted_at DESC, p.id LIMIT 100`).bind(Number(superAdmin), owner).all();
    return json({ success: true, items: results });
  }

  const proofId = path.match(/^\/admin\/daily-tasks\/proof\/([a-f0-9-]{36})$/)?.[1];
  if (proofId && request.method === "GET") {
    const proof = await db.prepare(`SELECT p.image_key FROM daily_task_proofs p JOIN users u ON u.id=p.user_id
      WHERE p.id=? AND (?=1 OR u.created_by_admin_id=?)`).bind(proofId, Number(superAdmin), owner).first();
    const object = proof?.image_key && await env.RAFFLE_R2?.get(proof.image_key);
    if (!object) return forbid("找不到驗證截圖", 404);
    return new Response(object.body, { headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
    } });
  }

  const match = path.match(/^\/admin\/daily-tasks\/users\/(\d+)(?:\/([a-z_]+))?$/);
  if (!match) return forbid("找不到任務", 404);
  const userId = Number(match[1]);
  const user = await db.prepare("SELECT id,created_by_admin_id FROM users WHERE id=?").bind(userId).first();
  if (!user || (!superAdmin && Number(user.created_by_admin_id) !== owner)) return forbid("無法管理這位會員", 403);
  if (request.method === "GET" && !match[2]) {
    const { results } = await db.prepare("SELECT id,task,status,submitted_at,image_key IS NOT NULL AS has_image FROM daily_task_proofs WHERE user_id=? AND task_day IN ('',?)").bind(userId, today).all();
    return json({ success: true, items: results });
  }
  const task = match[2];
  if (request.method === "PATCH" && [...verification, ...social].includes(task)) {
    const body = await request.json().catch(() => null);
    if (typeof body?.approved !== "boolean") return forbid("驗證狀態錯誤", 400);
    const status = body.approved ? "approved" : "revoked";
    if (verification.includes(task)) {
      if (typeof body.proofId !== "string") return forbid("請先取得會員的驗證截圖", 409);
      const result = await db.prepare("UPDATE daily_task_proofs SET status=? WHERE id=? AND user_id=? AND task=? AND task_day=''")
        .bind(status, body.proofId, userId, task).run();
      if (!result.meta?.changes) return forbid("會員已更新截圖，請重新讀取", 409);
    } else {
      await db.prepare(`INSERT INTO daily_task_proofs(id,user_id,task,task_day,status) VALUES (?,?,?,?,?)
        ON CONFLICT(user_id,task,task_day) DO UPDATE SET status=excluded.status`)
        .bind(crypto.randomUUID(), userId, task, today, status).run();
    }
    return json({ success: true });
  }
  return forbid("找不到任務", 404);
}

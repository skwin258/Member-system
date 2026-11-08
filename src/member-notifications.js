export const MEMBER_NOTIFICATION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS member_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), read_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS member_notifications_user ON member_notifications(user_id,id DESC)`,
  `CREATE INDEX IF NOT EXISTS member_notifications_unread ON member_notifications(user_id,id) WHERE read_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS daily_task_image_purge (image_key TEXT PRIMARY KEY)`,
  `CREATE TRIGGER IF NOT EXISTS queue_rejected_daily_task_image
    AFTER UPDATE OF status ON daily_task_proofs
    WHEN NEW.status='rejected' AND OLD.image_key IS NOT NULL AND NEW.image_key IS NULL
    BEGIN
      INSERT OR IGNORE INTO daily_task_image_purge VALUES (OLD.image_key);
    END`,
];

export function memberNotification(db, userId, body, message, always = false, requireChange = true) {
  if (!message || (!always && body?.notify_member !== true)) return null;
  const note = typeof body?.notification_note === "string" ? body.notification_note.trim().slice(0, 200) : "";
  const text = note ? `${message}（${note}）` : message;
  return db.prepare(`INSERT INTO member_notifications (user_id,message) SELECT ?,? ${requireChange ? "WHERE changes()>0" : ""}`)
    .bind(userId, text);
}

export async function runMemberChange(db, change, notification) {
  if (!notification) return change.run();
  const [result] = await db.batch([change, notification]);
  return result;
}

const pageSize = 5;
const retentionCutoff = "datetime('now','-7 days')";

export function purgeExpiredNotifications(db) {
  return db.prepare(`DELETE FROM member_notifications WHERE created_at <= ${retentionCutoff}`).run();
}

export async function handleMemberNotifications({ request, url, db, requireUser, json, forbid }) {
  if (!["/member/notifications", "/member/notifications/read"].includes(url.pathname)) return null;
  const session = await requireUser();
  if (!session) return forbid("請先登入會員", 401);
  if (request.method === "GET" && url.pathname === "/member/notifications") {
    const userId = session.user_id;
    const requestedPage = Number(url.searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(requestedPage) || requestedPage < 1) return forbid("通知頁碼無效", 400);
    const count = await db.prepare(
      `SELECT COUNT(*) AS total, COUNT(CASE WHEN read_at IS NULL THEN 1 END) AS unread
       FROM member_notifications WHERE user_id=? AND created_at > ${retentionCutoff}`
    ).bind(userId).first();
    const totalPages = Math.max(1, Math.ceil(Number(count.total) / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const { results } = await db.prepare(
      `SELECT id,message,created_at,read_at FROM member_notifications
       WHERE user_id=? AND created_at > ${retentionCutoff} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).bind(userId, pageSize, (page - 1) * pageSize).all();
    return json({ success: true, items: results || [], unread: Number(count.unread), page, totalPages });
  }
  if (request.method === "POST" && url.pathname.endsWith("/read")) {
    const body = await request.json().catch(() => null);
    if (!Number.isSafeInteger(body?.through) || body.through < 1) return forbid("通知編號無效", 400);
    await db.prepare(`UPDATE member_notifications SET read_at=datetime('now')
      WHERE user_id=? AND id<=? AND read_at IS NULL AND created_at > ${retentionCutoff}`)
      .bind(session.user_id, body.through).run();
    return json({ success: true });
  }
  return forbid("找不到通知", 404);
}

export async function purgeRejectedProofs(db, bucket, onlyKey) {
  if (!bucket) return;
  const keys = onlyKey ? [{ image_key: onlyKey }] :
    (await db.prepare("SELECT image_key FROM daily_task_image_purge ORDER BY image_key LIMIT 50").all()).results || [];
  await Promise.all(keys.map(async ({ image_key }) => {
    try {
      await bucket.delete(image_key);
      await db.prepare("DELETE FROM daily_task_image_purge WHERE image_key=?").bind(image_key).run();
    } catch {
      // Keep the queued object for the next scheduled attempt.
    }
  }));
}

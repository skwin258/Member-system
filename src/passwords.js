import { pbkdf2, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const prefix = "pbkdf2-sha256$600000$";
const derive = (password, salt) => new Promise((resolve, reject) => {
  pbkdf2(password, salt, 600_000, 32, "sha256", (error, hash) => {
    if (error) reject(error);
    else resolve(hash);
  });
});

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return prefix + Buffer.from(salt).toString("hex") + "$" + hash.toString("hex");
}

export async function checkPassword(db, table, account, password) {
  if (!account?.password) return false;
  const stored = account.password;
  if (stored.startsWith(prefix)) {
    const [salt, expected] = stored.slice(prefix.length).split("$");
    if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(expected)) return false;
    const hash = await derive(password, Buffer.from(salt, "hex"));
    return timingSafeEqual(hash, Buffer.from(expected, "hex"));
  }

  const encoder = new TextEncoder();
  const [expected, actual] = await Promise.all([stored, password].map(
    value => crypto.subtle.digest("SHA-256", encoder.encode(value))
  ));
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return false;

  const updated = await db.prepare(`UPDATE ${table} SET password=? WHERE id=? AND password=?`)
    .bind(await hashPassword(password), account.id, stored).run();
  if (updated.meta.changes) return true;
  const current = await db.prepare(`SELECT id, password FROM ${table} WHERE id=?`).bind(account.id).first();
  return Boolean(current?.password?.startsWith(prefix)) && checkPassword(db, table, current, password);
}

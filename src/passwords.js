import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

const iterations = 600_000;
const prefix = `pbkdf2-sha256$${iterations}$`;
const encoder = new TextEncoder();

// The production Workers runtime caps native PBKDF2 at 100,000 iterations.
const derive = (password, salt) => pbkdf2Async(sha256, encoder.encode(password), salt, { c: iterations, dkLen: 32 });

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return prefix + Buffer.from(salt).toString("hex") + "$" + Buffer.from(hash).toString("hex");
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

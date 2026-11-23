import bcrypt from "npm:bcryptjs@3.0.2";
import { randomInt } from "node:crypto";
import { query, transaction } from "../database.js";

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function issuePin() {
  const code = String(randomInt(100000, 1000000));
  const hash = await bcrypt.hash(code, 10);
  const saved = await query(`
    insert into pos_private.admin_pin (hash, expires_at, cooldown_until)
    values ($1, now() + $2 * interval '1 millisecond', now() + $3 * interval '1 millisecond')
    on conflict (singleton) do update
      set hash = excluded.hash, expires_at = excluded.expires_at,
          cooldown_until = excluded.cooldown_until, attempts = 0
      where admin_pin.cooldown_until <= now()
    returning singleton
  `, [hash, TTL_MS, COOLDOWN_MS]);
  if (!saved.rowCount) {
    const error = new Error("Please wait a minute before requesting another PIN.");
    error.status = 429;
    throw error;
  }
  return { code, ttlMs: TTL_MS, cooldownMs: COOLDOWN_MS };
}

export async function verifyAndConsume(code) {
  return transaction(async (run) => {
    const { rows: [pin] } = await run(`
      select hash, expires_at > now() as valid, attempts
      from pos_private.admin_pin where singleton for update
    `);
    if (!pin?.valid || !pin.hash) return { ok: false, reason: "expired" };

    const attempts = pin.attempts + 1;
    const ok = await bcrypt.compare(String(code), pin.hash);
    const exhausted = attempts >= MAX_ATTEMPTS;
    await run(`
      update pos_private.admin_pin set hash = $1, attempts = $2 where singleton
    `, [ok || exhausted ? null : pin.hash, attempts]);
    return { ok, reason: exhausted ? "too-many-attempts" : "mismatch" };
  });
}

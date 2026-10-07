/**
 * Per-account sign-in lockout, kept in Postgres. A six-digit PIN has a million values; a per-IP or per-process limit
 * does not stop someone who spreads guesses over addresses or replicas, so the count lives on the account (the phone
 * number) in the one database every replica uses, and survives a restart.
 *
 * After LOGIN_LOCKOUT_THRESHOLD wrong PINs in a row the account refuses attempts for LOGIN_LOCKOUT_BASE_SECONDS, doubling
 * with each further wrong PIN up to LOGIN_LOCKOUT_MAX_SECONDS. Attempts made while locked are refused before the PIN is
 * checked and do not extend the lock, so an attacker cannot keep a real user out for ever, only for the cap. The key is
 * the phone number whether or not an account exists, so the response never reveals which numbers have one.
 */
import { withoutTenant } from '../persistence/pool';
import { env } from '../config/env';
import { AppError } from '../domain/errors';

export class LockedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'account-locked', `Too many wrong PINs. Try again in ${retryAfterSeconds < 90 ? `${retryAfterSeconds} seconds` : `${Math.ceil(retryAfterSeconds / 60)} minutes`}.`);
  }
}

/** Throws LockedError while the account is locked. */
export async function assertNotLocked(phone: string): Promise<void> {
  const row = await withoutTenant(async (client) =>
    (await client.query(`SELECT ceil(extract(epoch FROM (locked_until - now())))::int AS wait FROM login_lockouts WHERE phone = $1 AND locked_until > now()`, [phone])).rows[0]
  );
  if (row) throw new LockedError(Math.max(1, row.wait as number));
}

export async function recordFailure(phone: string): Promise<void> {
  await withoutTenant(async (client) => {
    // failures older than a day do not count against someone who got their PIN wrong once last week
    const { rows } = await client.query(
      `INSERT INTO login_lockouts (phone, failures, last_failure_at) VALUES ($1, 1, now())
       ON CONFLICT (phone) DO UPDATE SET
         failures = CASE WHEN login_lockouts.last_failure_at < now() - interval '1 day' THEN 1 ELSE login_lockouts.failures + 1 END,
         last_failure_at = now()
       RETURNING failures`,
      [phone]
    );
    const failures = rows[0].failures as number;
    if (failures >= env.LOGIN_LOCKOUT_THRESHOLD) {
      const seconds = Math.min(env.LOGIN_LOCKOUT_MAX_SECONDS, env.LOGIN_LOCKOUT_BASE_SECONDS * 2 ** Math.min(failures - env.LOGIN_LOCKOUT_THRESHOLD, 20));
      await client.query(`UPDATE login_lockouts SET locked_until = now() + ($2 || ' seconds')::interval WHERE phone = $1`, [phone, String(seconds)]);
    }
    // rows are one per phone number ever guessed at, so old ones are swept now and then
    if (Math.random() < 0.02) await client.query(`DELETE FROM login_lockouts WHERE last_failure_at < now() - interval '2 days'`);
  });
}

export async function clearFailures(phone: string): Promise<void> {
  await withoutTenant((client) => client.query('DELETE FROM login_lockouts WHERE phone = $1', [phone]));
}

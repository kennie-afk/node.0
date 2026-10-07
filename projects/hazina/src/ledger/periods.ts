/**
 * Closing periods. Once an owner or accountant closes the books through a date, the ledger refuses any entry dated on or
 * before it (postEntries checks, under the numbering lock). System postings that must not be lost (money received, accruals)
 * move to the first open day instead; people's postings are refused with the reason.
 *
 * Closing also writes balance snapshots: the cumulative balance of every account at that date and at each month end passed
 * on the way. Because nothing can be posted into a closed period, a snapshot cannot go stale, and a report only reads the lines
 * after the latest snapshot. Reopening a period deletes the snapshots that covered it.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError } from '../domain/errors';
import { Ctx, audit } from '../common/context';
import { lockedThrough } from './service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const lockSchema = z.object({ through: day, note: z.string().trim().max(300).optional() });
export const unlockSchema = z.object({ through: day.nullable(), note: z.string().trim().min(3).max(300) });

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

/** Writes the cumulative snapshot as at `date`, building on the latest earlier one. Safe to repeat. */
export async function takeSnapshot(client: PoolClient, orgId: string, date: string): Promise<number> {
  const prev = (await client.query(`SELECT to_char(max(as_of), 'YYYY-MM-DD') AS d FROM ledger_snapshots WHERE as_of < $1::date`, [date])).rows[0].d as string | null;
  const { rowCount } = await client.query(
    `INSERT INTO ledger_snapshots (org_id, as_of, account_id, debit_cents, credit_cents)
     SELECT $1, $2::date, x.account_id, sum(x.dr), sum(x.cr) FROM (
       SELECT s.account_id, s.debit_cents AS dr, s.credit_cents AS cr FROM ledger_snapshots s WHERE $3::date IS NOT NULL AND s.as_of = $3::date
       UNION ALL
       SELECT l.account_id, l.debit_cents, l.credit_cents FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
        WHERE e.entry_date <= $2::date AND ($3::date IS NULL OR e.entry_date > $3::date)
     ) x GROUP BY x.account_id
     ON CONFLICT (org_id, as_of, account_id) DO NOTHING`,
    [orgId, date, prev]
  );
  return rowCount ?? 0;
}

export async function periodStatus(client: PoolClient) {
  const snaps = (await client.query(`SELECT to_char(as_of, 'YYYY-MM-DD') AS d FROM ledger_snapshots GROUP BY as_of ORDER BY as_of DESC LIMIT 12`)).rows.map((r) => r.d as string);
  const row = (await client.query(`SELECT locked_by, locked_at, note FROM period_locks LIMIT 1`)).rows[0];
  return { lockedThrough: await lockedThrough(client), lockedAt: row?.locked_at ?? null, lockedBy: row?.locked_by ?? null, note: row?.note ?? null, snapshots: snaps };
}

export async function lockPeriod(client: PoolClient, ctx: Ctx, input: z.infer<typeof lockSchema>) {
  const now = await today(client);
  if (input.through > now) throw new BadRequestError('A period that has not ended cannot be closed.');
  // Wait for postings in flight (they hold this row until they commit) so the snapshot below sees every one of them.
  await client.query(`SELECT 1 FROM org_counters WHERE name = 'journal' FOR UPDATE`);
  const current = await lockedThrough(client);
  if (current && input.through <= current) throw new ConflictError(`The books are already closed through ${current}. Reopen the period to change it.`);
  await client.query(
    `INSERT INTO period_locks (org_id, locked_through, locked_by, note) VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id) DO UPDATE SET locked_through = EXCLUDED.locked_through, locked_by = EXCLUDED.locked_by, locked_at = now(), note = EXCLUDED.note`,
    [ctx.orgId, input.through, ctx.userId, input.note ?? null]
  );
  // a snapshot at every month end passed through, and at the closing date itself
  const ends = (await client.query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS d FROM (
       SELECT (date_trunc('month', g) + interval '1 month - 1 day')::date AS d
         FROM generate_series(COALESCE((SELECT max(as_of) FROM ledger_snapshots), (SELECT min(entry_date) FROM journal_entries), $1::date), $1::date, interval '1 month') g
     ) m WHERE d <= $1::date ORDER BY d`,
    [input.through]
  )).rows.map((r) => r.d as string);
  const dates = [...new Set([...ends, input.through])].sort();
  for (const d of dates) await takeSnapshot(client, ctx.orgId, d);
  await audit(client, ctx, 'period.lock', 'period', null, { through: input.through, snapshots: dates.length });
  return periodStatus(client);
}

/** Reopens: moves the closing date back (or removes it) and deletes the snapshots that covered the reopened days. */
export async function unlockPeriod(client: PoolClient, ctx: Ctx, input: z.infer<typeof unlockSchema>) {
  await client.query(`SELECT 1 FROM org_counters WHERE name = 'journal' FOR UPDATE`);
  const current = await lockedThrough(client);
  if (!current) throw new ConflictError('No period is closed.');
  if (input.through !== null && input.through >= current) throw new BadRequestError(`Reopening moves the closing date back from ${current}.`);
  if (input.through === null) {
    await client.query('DELETE FROM period_locks');
    await client.query('DELETE FROM ledger_snapshots');
  } else {
    await client.query('UPDATE period_locks SET locked_through = $1, locked_by = $2, locked_at = now(), note = $3', [input.through, ctx.userId, input.note]);
    await client.query('DELETE FROM ledger_snapshots WHERE as_of > $1::date', [input.through]);
  }
  await audit(client, ctx, 'period.unlock', 'period', null, { from: current, through: input.through, note: input.note });
  return periodStatus(client);
}

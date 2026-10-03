/**
 * The firm's deduction tables and holiday list. Nothing here is a statutory fact: a table starts empty and unconfirmed; the firm enters
 * or adopts illustrative values and a named person confirms them; changing a confirmed table un-confirms it.
 */
import { PoolClient } from 'pg';
import { audit, Ctx, need } from '../common/context';
import { isDay, monthBounds, monthOf } from '../common/time';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { DeductionKind, ILLUSTRATIVE, KINDS, TableState, validateConfig } from './deductions';

export async function seedRateTables(client: PoolClient, orgId: string): Promise<void> {
  for (const kind of KINDS) await client.query(`INSERT INTO rate_tables (org_id, kind) VALUES ($1, $2) ON CONFLICT (org_id, kind) DO NOTHING`, [orgId, kind]);
}

export async function loadTableStates(client: PoolClient): Promise<TableState[]> {
  const rows = (await client.query('SELECT kind, status, source, config FROM rate_tables')).rows;
  return rows.map((r) => ({ kind: r.kind, status: r.status, source: r.source, config: r.config }));
}

export async function listTables(client: PoolClient) {
  const rows = (await client.query(`SELECT t.kind, t.config, t.source, t.status, t.confirmed_at, t.note, t.updated_at, u.display_name AS confirmed_by FROM rate_tables t LEFT JOIN users u ON u.id = t.confirmed_by ORDER BY t.kind`)).rows;
  return rows.map((r) => ({ kind: r.kind as DeductionKind, config: r.config, source: r.source, status: r.status, confirmedAt: r.confirmed_at, confirmedBy: r.confirmed_by, note: r.note, updatedAt: r.updated_at }));
}

async function must(client: PoolClient, kind: string) {
  if (!(KINDS as readonly string[]).includes(kind)) throw new NotFoundError('No such deduction table.');
  const row = (await client.query('SELECT * FROM rate_tables WHERE kind = $1 FOR UPDATE', [kind])).rows[0];
  if (!row) throw new NotFoundError('That deduction table was not found.');
  return row;
}

export async function setTable(client: PoolClient, ctx: Ctx, kind: DeductionKind, config: unknown) {
  need(ctx, 'rates_write');
  await must(client, kind);
  let clean: unknown;
  try {
    clean = validateConfig(kind, config);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'That table is not valid.');
  }
  await client.query(`UPDATE rate_tables SET config = $2::jsonb, source = 'firm_entered', status = 'unconfirmed', confirmed_by = NULL, confirmed_at = NULL, updated_at = now() WHERE kind = $1`, [kind, JSON.stringify(clean)]);
  await audit(client, ctx, 'rates.set', 'rate_table', kind, { config: clean });
  return (await listTables(client)).find((t) => t.kind === kind)!;
}

export async function loadIllustrative(client: PoolClient, ctx: Ctx, kind: DeductionKind) {
  need(ctx, 'rates_write');
  await must(client, kind);
  await client.query(`UPDATE rate_tables SET config = $2::jsonb, source = 'illustrative_unverified', status = 'unconfirmed', confirmed_by = NULL, confirmed_at = NULL, updated_at = now() WHERE kind = $1`, [kind, JSON.stringify(ILLUSTRATIVE[kind])]);
  await audit(client, ctx, 'rates.load_illustrative', 'rate_table', kind);
  return (await listTables(client)).find((t) => t.kind === kind)!;
}

/** A named person says they checked this table against the current official schedule. The note says what they checked. */
export async function confirmTable(client: PoolClient, ctx: Ctx, kind: DeductionKind, note: string) {
  need(ctx, 'rates_write');
  const row = await must(client, kind);
  if (row.source === 'none') throw new ConflictError('Enter the table first.');
  if (note.trim().length < 5) throw new BadRequestError('Say what you checked it against (for example the schedule and its date).');
  await client.query(`UPDATE rate_tables SET status = 'confirmed', confirmed_by = $2, confirmed_at = now(), note = $3, updated_at = now() WHERE kind = $1`, [kind, ctx.userId, note.trim()]);
  await audit(client, ctx, 'rates.confirm', 'rate_table', kind, { note: note.trim(), source: row.source });
  return (await listTables(client)).find((t) => t.kind === kind)!;
}

export async function markNotApplicable(client: PoolClient, ctx: Ctx, kind: DeductionKind, note: string) {
  need(ctx, 'rates_write');
  await must(client, kind);
  if (note.trim().length < 5) throw new BadRequestError('Say why this deduction does not apply to your firm.');
  await client.query(`UPDATE rate_tables SET status = 'not_applicable', confirmed_by = $2, confirmed_at = now(), note = $3, updated_at = now() WHERE kind = $1`, [kind, ctx.userId, note.trim()]);
  await audit(client, ctx, 'rates.not_applicable', 'rate_table', kind, { note: note.trim() });
  return (await listTables(client)).find((t) => t.kind === kind)!;
}

// ---- holidays --------------------------------------------------------------------------------------

export async function listHolidays(client: PoolClient, year?: number) {
  const rows = (await client.query(`SELECT to_char(day, 'YYYY-MM-DD') AS day, name FROM org_holidays WHERE ($1::int IS NULL OR extract(year FROM day) = $1) ORDER BY day`, [year ?? null])).rows;
  return rows.map((r) => ({ day: r.day as string, name: r.name as string }));
}

async function assertMonthOpen(client: PoolClient, day: string) {
  const closed = await client.query(`SELECT 1 FROM pay_periods WHERE month = $1 AND status = 'closed'`, [monthOf(day)]);
  if (closed.rows.length > 0) throw new ConflictError(`${monthOf(day)} is closed; its holidays cannot change.`);
}

export async function addHoliday(client: PoolClient, ctx: Ctx, day: string, name: string) {
  need(ctx, 'rates_write');
  if (!isDay(day)) throw new BadRequestError('use YYYY-MM-DD');
  if (name.trim().length < 2) throw new BadRequestError('Name the holiday.');
  await assertMonthOpen(client, day);
  await client.query('INSERT INTO org_holidays (org_id, day, name) VALUES ($1, $2, $3) ON CONFLICT (org_id, day) DO UPDATE SET name = EXCLUDED.name', [ctx.orgId, day, name.trim()]);
  await audit(client, ctx, 'holiday.add', 'holiday', day, { name });
  return { day, name: name.trim() };
}

export async function removeHoliday(client: PoolClient, ctx: Ctx, day: string) {
  need(ctx, 'rates_write');
  await assertMonthOpen(client, day);
  const r = await client.query('DELETE FROM org_holidays WHERE day = $1', [day]);
  if (r.rowCount === 0) throw new NotFoundError('That holiday was not found.');
  await audit(client, ctx, 'holiday.remove', 'holiday', day);
}

export { monthBounds };

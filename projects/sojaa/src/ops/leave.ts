/**
 * Leave: annual, sick and unpaid, requested, then approved or rejected by someone with the right. Days are calendar days, both ends
 * included. Annual leave is held to the entitlement the firm sets (a PLACEHOLDER of 21 the firm must check); sick leave has no cap unless
 * the firm sets one. Approved unpaid leave reduces pay only if the employer has switched the absence deduction on (see payroll/compute.ts).
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, getSettings, need } from '../common/context';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { isDay, localDayOf, monthOf, addDays } from '../common/time';

export const leaveSchema = z.object({
  guardId: z.string().uuid(),
  kind: z.enum(['annual', 'sick', 'unpaid']),
  startDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(500).optional().nullable()
});

const view = (r: Record<string, any>) => ({
  id: r.id as string, guardId: r.guard_id as string, guard: r.guard as string, guardNo: r.guard_no as string, kind: r.kind as string,
  startDay: r.start_day as string, endDay: r.end_day as string, days: r.days as number, status: r.status as string, reason: r.reason as string | null,
  decidedBy: (r.decided_by_name ?? null) as string | null, decidedAt: r.decided_at as Date | null, decisionNote: r.decision_note as string | null, createdAt: r.created_at as Date
});
const SELECT = `SELECT l.id, l.guard_id, g.full_name AS guard, g.guard_no, l.kind, to_char(l.start_day, 'YYYY-MM-DD') AS start_day, to_char(l.end_day, 'YYYY-MM-DD') AS end_day, l.days, l.status, l.reason,
  u.display_name AS decided_by_name, l.decided_at, l.decision_note, l.created_at FROM leave_requests l JOIN guards g ON g.id = l.guard_id LEFT JOIN users u ON u.id = l.decided_by`;

async function guardInScope(client: PoolClient, ctx: Ctx, guardId: string) {
  const g = (await client.query('SELECT id, branch_id, status FROM guards WHERE id = $1', [guardId])).rows[0];
  if (!g || (ctx.branchId && g.branch_id !== ctx.branchId)) throw new NotFoundError('That guard was not found.');
  return g;
}

/** Days of the given kind that count against the year (approved and pending), clipped to that year. */
async function usedDays(client: PoolClient, guardId: string, kind: string, year: number, excludeId?: string): Promise<number> {
  const r = (await client.query(
    `SELECT COALESCE(sum(LEAST(end_day, make_date($3, 12, 31)) - GREATEST(start_day, make_date($3, 1, 1)) + 1), 0)::int AS n FROM leave_requests
      WHERE guard_id = $1 AND kind = $2 AND status IN ('pending', 'approved') AND start_day <= make_date($3, 12, 31) AND end_day >= make_date($3, 1, 1) AND ($4::uuid IS NULL OR id <> $4)`,
    [guardId, kind, year, excludeId ?? null])).rows[0];
  return r.n as number;
}

async function checkEntitlement(client: PoolClient, guardId: string, kind: string, start: string, end: string, excludeId?: string) {
  if (kind === 'unpaid') return;
  const s = await getSettings(client);
  const cap = kind === 'annual' ? s.annualLeaveDays : s.sickLeaveDays;
  if (cap === null) return;
  for (let year = Number(start.slice(0, 4)); year <= Number(end.slice(0, 4)); year += 1) {
    const from = start > `${year}-01-01` ? start : `${year}-01-01`;
    const to = end < `${year}-12-31` ? end : `${year}-12-31`;
    const asked = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    const used = await usedDays(client, guardId, kind, year, excludeId);
    if (used + asked > cap) throw new ConflictError(`That would be ${used + asked} days of ${kind} leave in ${year}; the firm's setting allows ${cap} (${used} already requested or taken).`);
  }
}

export async function requestLeave(client: PoolClient, ctx: Ctx, input: z.infer<typeof leaveSchema>) {
  need(ctx, 'leave_write');
  if (!isDay(input.startDay) || !isDay(input.endDay) || input.endDay < input.startDay) throw new BadRequestError('Give a start day and an end day on or after it.');
  if (Date.parse(input.endDay) - Date.parse(input.startDay) > 365 * 86_400_000) throw new BadRequestError('A single request can cover at most a year.');
  const g = await guardInScope(client, ctx, input.guardId);
  if (g.status !== 'active') throw new ConflictError('That guard has left.');
  await checkEntitlement(client, input.guardId, input.kind, input.startDay, input.endDay);
  let id: string;
  try {
    id = (await client.query(
      `INSERT INTO leave_requests (org_id, guard_id, kind, start_day, end_day, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.orgId, input.guardId, input.kind, input.startDay, input.endDay, input.reason ?? null, ctx.userId])).rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === '23P01') throw new ConflictError('That guard already has leave requested or approved on some of those days.');
    throw error;
  }
  await audit(client, ctx, 'leave.request', 'guard', input.guardId, { kind: input.kind, startDay: input.startDay, endDay: input.endDay });
  return getLeave(client, ctx, id);
}

export async function getLeave(client: PoolClient, ctx: Ctx, id: string) {
  const r = (await client.query(`${SELECT} WHERE l.id = $1${ctx.branchId ? ' AND g.branch_id = $2' : ''}`, ctx.branchId ? [id, ctx.branchId] : [id])).rows[0];
  if (!r) throw new NotFoundError('That leave request was not found.');
  return view(r);
}

export async function listLeave(client: PoolClient, ctx: Ctx, opts: { status?: string; guardId?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.branchId) add('g.branch_id = ?', ctx.branchId);
  if (opts.status) add('l.status = ?', opts.status);
  if (opts.guardId) add('l.guard_id = ?', opts.guardId);
  if (opts.from) add('l.end_day >= ?::date', opts.from);
  if (opts.to) add('l.start_day <= ?::date', opts.to);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM leave_requests l JOIN guards g ON g.id = l.guard_id ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`${SELECT} ${clause} ORDER BY (l.status = 'pending') DESC, l.start_day DESC, l.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(view), total, page: opts.page, pageSize: opts.pageSize };
}

export const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });

export async function decideLeave(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof decisionSchema>) {
  need(ctx, 'leave_approve');
  const r = (await client.query('SELECT l.*, g.branch_id FROM leave_requests l JOIN guards g ON g.id = l.guard_id WHERE l.id = $1 FOR UPDATE OF l', [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That leave request was not found.');
  if (r.status !== 'pending') throw new ConflictError(`That request is already ${r.status}.`);
  const start = r.start_day instanceof Date ? localDayOf(r.start_day) : String(r.start_day);
  const end = r.end_day instanceof Date ? localDayOf(r.end_day) : String(r.end_day);
  if (input.decision === 'approve') await checkEntitlement(client, r.guard_id, r.kind, start, end, id);
  else if (!input.note) throw new BadRequestError('Say why the request is refused.');
  const status = input.decision === 'approve' ? 'approved' : 'rejected';
  await client.query('UPDATE leave_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1', [id, status, ctx.userId, input.note ?? null]);
  await audit(client, ctx, `leave.${status}`, 'guard', r.guard_id, { kind: r.kind, startDay: start, endDay: end });
  // Approving unpaid leave after a month has been closed cannot change that month: say which months need a payroll adjustment.
  const closedMonthsAffected: string[] = [];
  if (status === 'approved' && r.kind === 'unpaid') {
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const m = monthOf(d);
      if (!closedMonthsAffected.includes(m) && (await client.query(`SELECT 1 FROM pay_periods WHERE month = $1 AND status = 'closed'`, [m])).rows.length > 0) closedMonthsAffected.push(m);
    }
  }
  return { ...(await getLeave(client, ctx, id)), closedMonthsAffected };
}

export async function cancelLeave(client: PoolClient, ctx: Ctx, id: string) {
  need(ctx, 'leave_write');
  const r = (await client.query('SELECT l.status, l.guard_id, l.start_day, g.branch_id FROM leave_requests l JOIN guards g ON g.id = l.guard_id WHERE l.id = $1 FOR UPDATE OF l', [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That leave request was not found.');
  if (r.status === 'cancelled' || r.status === 'rejected') throw new ConflictError(`That request is already ${r.status}.`);
  if (r.status === 'approved') need(ctx, 'leave_approve');
  await client.query(`UPDATE leave_requests SET status = 'cancelled' WHERE id = $1`, [id]);
  await audit(client, ctx, 'leave.cancel', 'guard', r.guard_id, {});
  return getLeave(client, ctx, id);
}

export async function leaveBalance(client: PoolClient, ctx: Ctx, guardId: string, year: number) {
  await guardInScope(client, ctx, guardId);
  const s = await getSettings(client);
  const annual = await usedDays(client, guardId, 'annual', year);
  const sick = await usedDays(client, guardId, 'sick', year);
  const unpaid = await usedDays(client, guardId, 'unpaid', year);
  return {
    guardId, year,
    annual: { entitlement: s.annualLeaveDays, used: annual, remaining: Math.max(0, s.annualLeaveDays - annual) },
    sick: { entitlement: s.sickLeaveDays, used: sick, remaining: s.sickLeaveDays === null ? null : Math.max(0, s.sickLeaveDays - sick) },
    unpaid: { used: unpaid },
    note: 'Entitlements are the firm\'s own settings, not a statement of what the law requires. Used counts requested and approved days.'
  };
}

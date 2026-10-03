/**
 * Payroll for a calendar month. A run computes every guard's payslip from verified attendance, the firm's settings and confirmed
 * deduction tables, and can be repeated while the period is open. Closing is permanent (triggers refuse any later change); a mistake found
 * afterwards is an append-only adjustment paid in a later open month. The compliance report is the same arithmetic without writing.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, getSettings, need } from '../common/context';
import { localDayOf, monthBounds, monthOf, TZ } from '../common/time';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { can } from '../domain/roles';
import { computePayslip, GuardPay, Payslip, WorkedShift } from './compute';
import { loadTableStates, listHolidays, listTables } from './rates';
import { workedMinutes } from '../ops/attendance';
import { TableState } from './deductions';

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

export function assertMonth(month: string): void {
  if (!monthRe.test(month)) throw new BadRequestError('use a month like 2026-10');
}

const currentMonth = () => monthOf(localDayOf(new Date()));

export interface Computed {
  guardId: string;
  guardNo: string;
  guardName: string;
  nationalId: string | null;
  branch: string;
  payslip: Payslip;
}

async function guardsFor(client: PoolClient, ctx: Ctx, month: string): Promise<Array<GuardPay & { guardNo: string; name: string; branch: string }>> {
  const { first, last } = monthBounds(month);
  const params: unknown[] = [first, last];
  let branch = '';
  if (ctx.branchId) {
    params.push(ctx.branchId);
    branch = ' AND g.branch_id = $3';
  }
  const rows = (
    await client.query(
      `SELECT g.id, g.guard_no, g.full_name, b.name AS branch, g.monthly_basic_cents, g.allowance_cents, g.rest_weekday, to_char(g.hired_on, 'YYYY-MM-DD') AS hired_on, to_char(g.exited_on, 'YYYY-MM-DD') AS exited_on,
              g.national_id, g.nssf_no, g.sha_no, g.kra_pin, g.psra_reg_no, to_char(g.psra_expiry, 'YYYY-MM-DD') AS psra_expiry
         FROM guards g JOIN branches b ON b.id = g.branch_id WHERE g.hired_on <= $2::date AND (g.exited_on IS NULL OR g.exited_on >= $1::date)${branch} ORDER BY g.guard_no`,
      params
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id, guardNo: r.guard_no, name: r.full_name, branch: r.branch, monthlyBasicCents: Number(r.monthly_basic_cents), allowanceCents: Number(r.allowance_cents), restWeekday: r.rest_weekday, hiredOn: r.hired_on, exitedOn: r.exited_on,
    nationalId: r.national_id, nssfNo: r.nssf_no, shaNo: r.sha_no, kraPin: r.kra_pin, psraRegNo: r.psra_reg_no, psraExpiry: r.psra_expiry
  }));
}

/** Verified shifts per guard in the month: a check-in and a check-out, with the minutes actually worked. */
async function workedByGuard(client: PoolClient, month: string): Promise<{ byGuard: Map<string, WorkedShift[]>; unresolved: number }> {
  const { first, nextFirst } = monthBounds(month);
  const rows = (
    await client.query(
      `SELECT s.id, s.guard_id, s.start_at, s.end_at, s.scheduled_minutes, s.overtime_approved_minutes,
         COALESCE((SELECT e.effective_at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_in' ORDER BY e.id DESC LIMIT 1), (SELECT e.at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in')) AS in_at,
         COALESCE((SELECT e.effective_at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_out' ORDER BY e.id DESC LIMIT 1), (SELECT e.at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'out')) AS out_at
         FROM shifts s WHERE s.status = 'scheduled' AND s.guard_id IS NOT NULL AND s.start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < ($2::date::timestamp AT TIME ZONE '${TZ}')`,
      [first, nextFirst]
    )
  ).rows;
  const byGuard = new Map<string, WorkedShift[]>();
  let unresolved = 0;
  const now = Date.now();
  for (const r of rows) {
    if (r.in_at && !r.out_at && new Date(r.end_at).getTime() < now) unresolved += 1;
    if (!r.in_at || !r.out_at) continue;
    const minutes = workedMinutes({ startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes, overtimeApprovedMinutes: r.overtime_approved_minutes }, { inAt: r.in_at, outAt: r.out_at, inOverridden: false, outOverridden: false });
    const list = byGuard.get(r.guard_id) ?? [];
    list.push({ day: localDayOf(r.start_at), workedMinutes: minutes, scheduledMinutes: r.scheduled_minutes, overtimeApprovedMinutes: r.overtime_approved_minutes });
    byGuard.set(r.guard_id, list);
  }
  return { byGuard, unresolved };
}

async function adjustmentsByGuard(client: PoolClient, month: string): Promise<Map<string, number>> {
  const rows = (await client.query('SELECT guard_id, sum(amount_cents)::bigint AS total FROM payroll_adjustments WHERE effective_month = $1 GROUP BY guard_id', [month])).rows;
  return new Map(rows.map((r) => [r.guard_id, Number(r.total)]));
}

/** The arithmetic of a month, no writes. */
export async function computeMonth(client: PoolClient, ctx: Ctx, month: string, tables?: TableState[]): Promise<{ rows: Computed[]; unresolvedShifts: number; tables: TableState[] }> {
  assertMonth(month);
  const settings = await getSettings(client);
  const states = tables ?? (await loadTableStates(client));
  const holidays = new Set((await listHolidays(client)).map((h) => h.day));
  const [guards, worked, adjustments] = await Promise.all([guardsFor(client, ctx, month), workedByGuard(client, month), adjustmentsByGuard(client, month)]);
  const rows = guards.map((g) => ({
    guardId: g.id, guardNo: g.guardNo, guardName: g.name, nationalId: g.nationalId, branch: g.branch,
    payslip: computePayslip({ guard: g, month, settings, holidays, shifts: worked.byGuard.get(g.id) ?? [], adjustmentsCents: adjustments.get(g.id) ?? 0, tables: states, today: localDayOf(new Date()) })
  }));
  return { rows, unresolvedShifts: worked.unresolved, tables: states };
}

export function summarise(rows: readonly Computed[]) {
  const sum = (f: (p: Payslip) => number) => rows.reduce((s, r) => s + f(r.payslip), 0);
  return {
    guards: rows.length,
    grossCents: sum((p) => p.grossCents),
    netCents: sum((p) => p.netCents),
    employerCostCents: sum((p) => p.employerCostCents),
    deductionsCents: sum((p) => p.employeeDeductionsCents),
    belowMinimum: rows.filter((r) => r.payslip.belowMinimum).length,
    blocking: rows.filter((r) => r.payslip.flags.some((f) => f.severity === 'block')).length,
    warnings: rows.filter((r) => r.payslip.flags.some((f) => f.severity === 'warn')).length
  };
}

export function tablesReady(tables: readonly TableState[]): { ready: boolean; missing: string[] } {
  const missing = tables.filter((t) => t.status === 'unconfirmed').map((t) => t.kind);
  return { ready: missing.length === 0 && tables.length === 4, missing };
}

// ---- periods -------------------------------------------------------------------------------------------

const periodView = (r: Record<string, any>) => ({ id: r.id, month: r.month, status: r.status, openedAt: r.opened_at, closedAt: r.closed_at, closedBy: r.closed_by_name ?? null, payslips: r.payslips !== undefined ? Number(r.payslips) : undefined, grossCents: r.gross !== undefined ? Number(r.gross) : undefined, netCents: r.net !== undefined ? Number(r.net) : undefined });

export async function listPeriods(client: PoolClient) {
  const rows = (
    await client.query(
      `SELECT p.*, u.display_name AS closed_by_name, (SELECT count(*) FROM payslips s WHERE s.period_id = p.id) AS payslips,
              (SELECT COALESCE(sum(gross_cents), 0) FROM payslips s WHERE s.period_id = p.id) AS gross, (SELECT COALESCE(sum(net_cents), 0) FROM payslips s WHERE s.period_id = p.id) AS net
         FROM pay_periods p LEFT JOIN users u ON u.id = p.closed_by ORDER BY p.month DESC LIMIT 60`
    )
  ).rows;
  return rows.map(periodView);
}

async function periodFor(client: PoolClient, orgId: string, month: string, create: boolean) {
  let row = (await client.query('SELECT * FROM pay_periods WHERE month = $1', [month])).rows[0];
  if (!row && create) {
    if (month > currentMonth()) throw new BadRequestError('That month has not started yet.');
    row = (await client.query('INSERT INTO pay_periods (org_id, month) VALUES ($1, $2) ON CONFLICT (org_id, month) DO UPDATE SET month = EXCLUDED.month RETURNING *', [orgId, month])).rows[0];
  }
  return row as Record<string, any> | undefined;
}

async function writePayslips(client: PoolClient, ctx: Ctx, periodId: string, rows: readonly Computed[]) {
  // Upsert by (period, guard) so a payslip keeps its id across runs: a printed or bookmarked link must survive closing the month.
  // A guard no longer in the month (their hire date moved, say) loses the draft payslip.
  await client.query('DELETE FROM payslips WHERE period_id = $1 AND NOT (guard_id = ANY($2::uuid[]))', [periodId, rows.map((r) => r.guardId)]);
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    guard_id: r.guardId, guard_no: r.guardNo, guard_name: r.guardName, national_id: r.nationalId, days_in_month: r.payslip.daysInMonth, days_employed: r.payslip.daysEmployed, basic_cents: r.payslip.basicCents,
    allowance_cents: r.payslip.allowanceCents, premium_cents: r.payslip.premiumCents, overtime_cents: r.payslip.overtimeCents, adjustments_cents: r.payslip.adjustmentsCents, gross_cents: r.payslip.grossCents,
    deductions: r.payslip.deductions, employee_deductions_cents: r.payslip.employeeDeductionsCents, net_cents: r.payslip.netCents, employer_cost_cents: r.payslip.employerCostCents,
    min_required_cents: r.payslip.minRequiredCents, below_minimum: r.payslip.belowMinimum, flags: r.payslip.flags, breakdown: r.payslip.breakdown
  }));
  await client.query(
    `INSERT INTO payslips (org_id, period_id, guard_id, guard_no, guard_name, national_id, days_in_month, days_employed, basic_cents, allowance_cents, premium_cents, overtime_cents, adjustments_cents, gross_cents,
        deductions, employee_deductions_cents, net_cents, employer_cost_cents, min_required_cents, below_minimum, flags, breakdown)
     SELECT $1, $2, x.guard_id, x.guard_no, x.guard_name, x.national_id, x.days_in_month, x.days_employed, x.basic_cents, x.allowance_cents, x.premium_cents, x.overtime_cents, x.adjustments_cents, x.gross_cents,
        x.deductions, x.employee_deductions_cents, x.net_cents, x.employer_cost_cents, x.min_required_cents, x.below_minimum, x.flags, x.breakdown
       FROM jsonb_to_recordset($3::jsonb) AS x(guard_id uuid, guard_no text, guard_name text, national_id text, days_in_month int, days_employed int, basic_cents bigint, allowance_cents bigint, premium_cents bigint,
        overtime_cents bigint, adjustments_cents bigint, gross_cents bigint, deductions jsonb, employee_deductions_cents bigint, net_cents bigint, employer_cost_cents bigint, min_required_cents bigint,
        below_minimum boolean, flags jsonb, breakdown jsonb)
     ON CONFLICT (period_id, guard_id) DO UPDATE SET guard_no = EXCLUDED.guard_no, guard_name = EXCLUDED.guard_name, national_id = EXCLUDED.national_id, days_in_month = EXCLUDED.days_in_month,
        days_employed = EXCLUDED.days_employed, basic_cents = EXCLUDED.basic_cents, allowance_cents = EXCLUDED.allowance_cents, premium_cents = EXCLUDED.premium_cents, overtime_cents = EXCLUDED.overtime_cents,
        adjustments_cents = EXCLUDED.adjustments_cents, gross_cents = EXCLUDED.gross_cents, deductions = EXCLUDED.deductions, employee_deductions_cents = EXCLUDED.employee_deductions_cents,
        net_cents = EXCLUDED.net_cents, employer_cost_cents = EXCLUDED.employer_cost_cents, min_required_cents = EXCLUDED.min_required_cents, below_minimum = EXCLUDED.below_minimum,
        flags = EXCLUDED.flags, breakdown = EXCLUDED.breakdown`,
    [ctx.orgId, periodId, JSON.stringify(payload)]
  );
}

export async function runPayroll(client: PoolClient, ctx: Ctx, month: string) {
  need(ctx, 'payroll_run');
  assertMonth(month);
  const period = await periodFor(client, ctx.orgId, month, true);
  if (period!.status === 'closed') throw new ConflictError(`${month} is closed. Pay a correction as an adjustment in an open month.`);
  const computed = await computeMonth(client, ctx, month);
  await writePayslips(client, ctx, period!.id, computed.rows);
  const summary = summarise(computed.rows);
  await audit(client, ctx, 'payroll.run', 'pay_period', period!.id, { month, guards: summary.guards, grossCents: summary.grossCents });
  return { period: periodView(period!), summary, unresolvedShifts: computed.unresolvedShifts, tables: tablesReady(computed.tables) };
}

export const closeSchema = z.object({ acknowledge: z.string().trim().min(10).max(1000).optional() });

/**
 * Re-runs the month inside the same transaction (so what is closed is what is current), then locks it for ever. Refuses unless every deduction
 * table is confirmed or marked not applicable, and unless the owner or payroll acknowledges, in writing, any blocking flag (a guard below the
 * minimum, a negative net) or any shift left without a check-out.
 */
export async function closePeriod(client: PoolClient, ctx: Ctx, month: string, input: z.infer<typeof closeSchema>) {
  need(ctx, 'payroll_close');
  assertMonth(month);
  const period = await periodFor(client, ctx.orgId, month, true);
  if (period!.status === 'closed') throw new ConflictError(`${month} is already closed.`);
  if (month >= currentMonth() && !input.acknowledge) {
    // closing a month that is not over yet is almost always a mistake
    const last = monthBounds(month).last;
    if (localDayOf(new Date()) < last) throw new ConflictError(`${month} is not over yet. Close it after its last day.`);
  }
  const computed = await computeMonth(client, ctx, month);
  const ready = tablesReady(computed.tables);
  if (!ready.ready) throw new ConflictError(`Confirm these deduction tables first (or mark them not applicable): ${ready.missing.join(', ')}.`);
  const summary = summarise(computed.rows);
  if ((summary.blocking > 0 || computed.unresolvedShifts > 0) && !input.acknowledge) {
    throw new ConflictError(`${summary.blocking} guard(s) have a blocking flag and ${computed.unresolvedShifts} shift(s) have no check-out. Fix them, or close with a written acknowledgement.`);
  }
  await writePayslips(client, ctx, period!.id, computed.rows);
  const settings = await getSettings(client);
  const holidays = await listHolidays(client);
  const tables = await listTables(client);
  await client.query(`UPDATE pay_periods SET status = 'closed', closed_at = now(), closed_by = $2, snapshot = $3::jsonb WHERE id = $1`, [period!.id, ctx.userId, JSON.stringify({ settings, tables, holidays, summary, unresolvedShifts: computed.unresolvedShifts, acknowledged: input.acknowledge ?? null })]);
  await audit(client, ctx, 'payroll.close', 'pay_period', period!.id, { month, ...summary, acknowledged: input.acknowledge ?? null });
  const row = (await client.query('SELECT p.*, u.display_name AS closed_by_name FROM pay_periods p LEFT JOIN users u ON u.id = p.closed_by WHERE p.id = $1', [period!.id])).rows[0];
  return { period: periodView(row), summary };
}

export async function getPeriod(client: PoolClient, month: string) {
  assertMonth(month);
  const row = (await client.query('SELECT p.*, u.display_name AS closed_by_name FROM pay_periods p LEFT JOIN users u ON u.id = p.closed_by WHERE p.month = $1', [month])).rows[0];
  if (!row) return null;
  return { ...periodView(row), snapshot: row.snapshot };
}

const payslipView = (r: Record<string, any>) => ({
  id: r.id, periodId: r.period_id, guardId: r.guard_id, guardNo: r.guard_no, guardName: r.guard_name, nationalId: r.national_id, daysInMonth: r.days_in_month, daysEmployed: r.days_employed,
  basicCents: Number(r.basic_cents), allowanceCents: Number(r.allowance_cents), premiumCents: Number(r.premium_cents), overtimeCents: Number(r.overtime_cents), adjustmentsCents: Number(r.adjustments_cents),
  grossCents: Number(r.gross_cents), deductions: r.deductions, employeeDeductionsCents: Number(r.employee_deductions_cents), netCents: Number(r.net_cents), employerCostCents: Number(r.employer_cost_cents),
  minRequiredCents: Number(r.min_required_cents), belowMinimum: r.below_minimum, flags: r.flags, breakdown: r.breakdown
});

export async function listPayslips(client: PoolClient, ctx: Ctx, month: string, opts: { q?: string; flagged?: boolean; page: number; pageSize: number }) {
  need(ctx, 'salary_view');
  assertMonth(month);
  const period = await periodFor(client, ctx.orgId, month, false);
  if (!period) return { period: null, items: [], total: 0, page: opts.page, pageSize: opts.pageSize };
  const params: unknown[] = [period.id];
  const where = ['period_id = $1'];
  if (opts.q) { params.push(`%${opts.q.replace(/[%_\\]/g, '\\$&')}%`); where.push(`(guard_name ILIKE $${params.length} OR guard_no ILIKE $${params.length})`); }
  if (opts.flagged) where.push(`jsonb_array_length(flags) > 0`);
  const total = Number((await client.query(`SELECT count(*) AS n FROM payslips WHERE ${where.join(' AND ')}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT * FROM payslips WHERE ${where.join(' AND ')} ORDER BY guard_no LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { period: periodView(period), items: rows.map(payslipView), total, page: opts.page, pageSize: opts.pageSize };
}

export async function getPayslip(client: PoolClient, ctx: Ctx, id: string) {
  need(ctx, 'salary_view');
  const r = (await client.query(`SELECT s.*, p.month, p.status AS period_status FROM payslips s JOIN pay_periods p ON p.id = s.period_id WHERE s.id = $1`, [id])).rows[0];
  if (!r) throw new NotFoundError('That payslip was not found.');
  return { ...payslipView(r), month: r.month as string, periodStatus: r.period_status as string };
}

/**
 * The compliance report. For an open month it is computed fresh; for a closed month it reads what was closed. Either way it lists who is
 * below the configured minimum, which identifiers are missing, and whether the deduction tables are confirmed.
 */
export async function complianceReport(client: PoolClient, ctx: Ctx, month: string) {
  need(ctx, 'reports');
  if (!can(ctx.role, 'salary_view')) throw new BadRequestError('Wages are visible to the owner, payroll and the auditor.');
  assertMonth(month);
  const settings = await getSettings(client);
  const period = await periodFor(client, ctx.orgId, month, false);
  let rows: Array<{ guardId: string; guardNo: string; guardName: string; payslip: Pick<Payslip, 'belowMinimum' | 'flags' | 'basicCents' | 'minRequiredCents' | 'daysEmployed' | 'grossCents'> }>;
  let unresolved = 0;
  let tables: TableState[] = await loadTableStates(client);
  if (period && period.status === 'closed') {
    const stored = (await client.query('SELECT guard_id, guard_no, guard_name, below_minimum, flags, basic_cents, min_required_cents, days_employed, gross_cents FROM payslips WHERE period_id = $1 ORDER BY guard_no', [period.id])).rows;
    rows = stored.map((r) => ({ guardId: r.guard_id, guardNo: r.guard_no, guardName: r.guard_name, payslip: { belowMinimum: r.below_minimum, flags: r.flags, basicCents: Number(r.basic_cents), minRequiredCents: Number(r.min_required_cents), daysEmployed: r.days_employed, grossCents: Number(r.gross_cents) } }));
    tables = (period.snapshot?.tables ?? []).map((t: Record<string, any>) => ({ kind: t.kind, status: t.status, source: t.source, config: t.config }));
  } else {
    const computed = await computeMonth(client, ctx, month);
    rows = computed.rows;
    unresolved = computed.unresolvedShifts;
  }
  const below = rows.filter((r) => r.payslip.belowMinimum).map((r) => ({ guardId: r.guardId, guardNo: r.guardNo, guardName: r.guardName, basicCents: r.payslip.basicCents, requiredCents: r.payslip.minRequiredCents, shortfallCents: r.payslip.minRequiredCents - r.payslip.basicCents, daysEmployed: r.payslip.daysEmployed }));
  const counts: Record<string, number> = {};
  for (const r of rows) for (const f of r.payslip.flags) counts[f.code] = (counts[f.code] ?? 0) + 1;
  const org = (await client.query('SELECT psra_licence_no FROM organisations LIMIT 1')).rows[0];
  return {
    month,
    closed: period?.status === 'closed',
    minimumWageCents: settings.minWageCents,
    allowancesCountTowardMin: settings.allowancesCountTowardMin,
    guards: rows.length,
    belowMinimum: below,
    flagCounts: counts,
    unresolvedShifts: unresolved,
    deductionTables: tables.map((t) => ({ kind: t.kind, status: t.status, source: t.source })),
    firmPsraLicenceRecorded: !!org?.psra_licence_no,
    notice: 'The minimum wage figure is whatever your firm configured. Sojaa has not checked it against the current Regulation of Wages order. This report is evidence from your own records, not a legal opinion.'
  };
}

// ---- adjustments ------------------------------------------------------------------------------------------

export const adjustmentSchema = z.object({
  guardId: z.string().uuid(),
  effectiveMonth: z.string().regex(monthRe),
  amountCents: z.number().int().refine((n) => n !== 0, 'cannot be zero').refine((n) => Math.abs(n) <= 100_000_000_000),
  kind: z.enum(['correction', 'arrears', 'bonus', 'deduction', 'reversal']),
  reason: z.string().trim().min(5).max(500),
  relatedMonth: z.string().regex(monthRe).optional()
});

export async function addAdjustment(client: PoolClient, ctx: Ctx, input: z.infer<typeof adjustmentSchema>) {
  need(ctx, 'payroll_run');
  const guard = (await client.query('SELECT 1 FROM guards WHERE id = $1', [input.guardId])).rows[0];
  if (!guard) throw new NotFoundError('That guard was not found.');
  const target = await periodFor(client, ctx.orgId, input.effectiveMonth, false);
  if (target && target.status === 'closed') throw new ConflictError(`${input.effectiveMonth} is closed. Pay the adjustment in an open month.`);
  let relatedId: string | null = null;
  if (input.relatedMonth) {
    const rel = await periodFor(client, ctx.orgId, input.relatedMonth, false);
    if (!rel) throw new NotFoundError('There is no pay period for the month this corrects.');
    relatedId = rel.id;
  }
  const row = (await client.query('INSERT INTO payroll_adjustments (org_id, guard_id, effective_month, amount_cents, kind, reason, related_period_id, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id', [ctx.orgId, input.guardId, input.effectiveMonth, input.amountCents, input.kind, input.reason, relatedId, ctx.userId])).rows[0];
  await audit(client, ctx, 'payroll.adjust', 'guard', input.guardId, { ...input });
  return row.id as string;
}

export async function listAdjustments(client: PoolClient, ctx: Ctx, opts: { month?: string; guardId?: string; page: number; pageSize: number }) {
  need(ctx, 'salary_view');
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.month) { params.push(opts.month); where.push(`a.effective_month = $${params.length}`); }
  if (opts.guardId) { params.push(opts.guardId); where.push(`a.guard_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM payroll_adjustments a ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT a.id, a.guard_id, g.full_name AS guard, g.guard_no, a.effective_month, a.amount_cents, a.kind, a.reason, rp.month AS related_month, u.display_name AS by, a.created_at
     FROM payroll_adjustments a JOIN guards g ON g.id = a.guard_id LEFT JOIN pay_periods rp ON rp.id = a.related_period_id LEFT JOIN users u ON u.id = a.created_by ${clause} ORDER BY a.created_at DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map((r) => ({ id: r.id, guardId: r.guard_id, guard: r.guard, guardNo: r.guard_no, effectiveMonth: r.effective_month, amountCents: Number(r.amount_cents), kind: r.kind, reason: r.reason, relatedMonth: r.related_month, by: r.by, createdAt: r.created_at })), total, page: opts.page, pageSize: opts.pageSize };
}

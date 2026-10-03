/**
 * Guards: the people the firm employs. PSRA registration, NSSF, SHA and KRA numbers are what the firm types in; Sojaa cannot verify any
 * of them and says so wherever they are shown. Pay figures are visible only to roles that may see wages, and only the owner and payroll
 * may change them, with every change on the audit trail.
 */
import { PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { audit, Ctx, need, pickBranch } from '../common/context';
import { nextCounter, pad } from '../common/counters';
import { can } from '../domain/roles';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { generatePin, normalisePhone } from '../admin/phone';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD');
const text = (max: number) => z.string().trim().max(max);

export const guardSchema = z.object({
  fullName: text(160).min(2),
  branchId: z.string().uuid().optional(),
  phone: text(20).optional().nullable(),
  nationalId: text(20).optional().nullable(),
  psraRegNo: text(60).optional().nullable(),
  psraExpiry: day.optional().nullable(),
  nssfNo: text(40).optional().nullable(),
  shaNo: text(40).optional().nullable(),
  kraPin: text(20).optional().nullable(),
  restWeekday: z.number().int().min(0).max(6).optional().nullable(),
  hiredOn: day.optional()
});

export const guardPatchSchema = guardSchema.omit({ branchId: true, hiredOn: true }).partial().extend({ branchId: z.string().uuid().optional(), hiredOn: day.optional() });

export const paySchema = z.object({
  monthlyBasicCents: z.number().int().min(0).max(100_000_000_000),
  allowanceCents: z.number().int().min(0).max(100_000_000_000).default(0)
});

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function phoneOf(raw: string): string {
  try {
    return normalisePhone(raw);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'That is not a Kenyan mobile number.');
  }
}

export interface GuardView {
  id: string;
  guardNo: string;
  fullName: string;
  branchId: string;
  branch: string | null;
  phone: string | null;
  nationalId: string | null;
  psraRegNo: string | null;
  psraExpiry: string | null;
  nssfNo: string | null;
  shaNo: string | null;
  kraPin: string | null;
  restWeekday: number | null;
  hiredOn: string;
  exitedOn: string | null;
  status: string;
  hasPin: boolean;
  isSample: boolean;
  monthlyBasicCents?: number;
  allowanceCents?: number;
}

const COLUMNS = `g.id, g.guard_no, g.full_name, g.branch_id, b.name AS branch, g.phone, g.national_id, g.psra_reg_no, to_char(g.psra_expiry, 'YYYY-MM-DD') AS psra_expiry,
  g.nssf_no, g.sha_no, g.kra_pin, g.rest_weekday, to_char(g.hired_on, 'YYYY-MM-DD') AS hired_on, to_char(g.exited_on, 'YYYY-MM-DD') AS exited_on,
  g.status, g.pin_hash IS NOT NULL AS has_pin, g.is_demo, g.monthly_basic_cents, g.allowance_cents`;

function toView(r: Record<string, any>, ctx: Ctx): GuardView {
  const view: GuardView = {
    id: r.id, guardNo: r.guard_no, fullName: r.full_name, branchId: r.branch_id, branch: r.branch, phone: r.phone, nationalId: r.national_id,
    psraRegNo: r.psra_reg_no, psraExpiry: r.psra_expiry, nssfNo: r.nssf_no, shaNo: r.sha_no, kraPin: r.kra_pin, restWeekday: r.rest_weekday,
    hiredOn: r.hired_on, exitedOn: r.exited_on, status: r.status, hasPin: r.has_pin, isSample: r.is_demo
  };
  if (can(ctx.role, 'salary_view')) {
    view.monthlyBasicCents = Number(r.monthly_basic_cents);
    view.allowanceCents = Number(r.allowance_cents);
  }
  return view;
}

export async function createGuard(client: PoolClient, ctx: Ctx, input: z.infer<typeof guardSchema>): Promise<GuardView> {
  need(ctx, 'guards_write');
  const branch = await pickBranch(client, ctx, input.branchId);
  const phone = blank(input.phone) ? phoneOf(input.phone!) : null;
  const n = await nextCounter(client, ctx.orgId, 'guard');
  const today = (await client.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`, [branch.timezone])).rows[0].d as string;
  const row = (
    await client.query(
      `INSERT INTO guards (org_id, branch_id, guard_no, full_name, phone, national_id, psra_reg_no, psra_expiry, nssf_no, sha_no, kra_pin, rest_weekday, hired_on)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
      [ctx.orgId, branch.id, `G${pad(n)}`, input.fullName, phone, blank(input.nationalId), blank(input.psraRegNo), input.psraExpiry ?? null, blank(input.nssfNo), blank(input.shaNo), blank(input.kraPin), input.restWeekday ?? null, input.hiredOn ?? today]
    )
  ).rows[0];
  await audit(client, ctx, 'guard.create', 'guard', row.id, { name: input.fullName }, branch.id);
  return getGuard(client, ctx, row.id);
}

export async function getGuard(client: PoolClient, ctx: Ctx, id: string): Promise<GuardView> {
  const r = (await client.query(`SELECT ${COLUMNS} FROM guards g JOIN branches b ON b.id = g.branch_id WHERE g.id = $1`, [id])).rows[0];
  if (!r) throw new NotFoundError('That guard was not found.');
  if (ctx.branchId && r.branch_id !== ctx.branchId) throw new NotFoundError('That guard was not found.');
  return toView(r, ctx);
}

export async function listGuards(client: PoolClient, ctx: Ctx, opts: { q?: string; status?: string; branchId?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (ctx.branchId) add('g.branch_id = ?', ctx.branchId);
  else if (opts.branchId) add('g.branch_id = ?', opts.branchId);
  if (opts.status === 'active' || opts.status === 'exited') add('g.status = ?', opts.status);
  if (opts.q) add(`(g.full_name ILIKE ? OR g.guard_no ILIKE ? OR g.national_id ILIKE ? OR g.phone ILIKE ?)`.replace(/\?/g, `$${params.length + 1}`), `%${opts.q.replace(/[%_\\]/g, '\\$&')}%`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM guards g ${clause}`, params)).rows[0].n);
  const rows = (
    await client.query(`SELECT ${COLUMNS} FROM guards g JOIN branches b ON b.id = g.branch_id ${clause} ORDER BY g.status, g.full_name, g.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)
  ).rows;
  return { items: rows.map((r) => toView(r, ctx)), total, page: opts.page, pageSize: opts.pageSize };
}

export async function updateGuard(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof guardPatchSchema>): Promise<GuardView> {
  need(ctx, 'guards_write');
  const current = await getGuard(client, ctx, id);
  if (input.branchId && input.branchId !== current.branchId) {
    if (ctx.branchId) throw new ForbiddenError('You cannot move a guard between branches.');
    await pickBranch(client, ctx, input.branchId);
  }
  const has = (k: keyof typeof input) => input[k] !== undefined;
  const phone = has('phone') ? (blank(input.phone) ? phoneOf(input.phone!) : null) : undefined;
  await client.query(
    `UPDATE guards SET
       full_name = COALESCE($2, full_name), branch_id = COALESCE($3, branch_id),
       phone = CASE WHEN $4::boolean THEN $5 ELSE phone END, national_id = CASE WHEN $6::boolean THEN $7 ELSE national_id END,
       psra_reg_no = CASE WHEN $8::boolean THEN $9 ELSE psra_reg_no END, psra_expiry = CASE WHEN $10::boolean THEN $11::date ELSE psra_expiry END,
       nssf_no = CASE WHEN $12::boolean THEN $13 ELSE nssf_no END, sha_no = CASE WHEN $14::boolean THEN $15 ELSE sha_no END,
       kra_pin = CASE WHEN $16::boolean THEN $17 ELSE kra_pin END, rest_weekday = CASE WHEN $18::boolean THEN $19::smallint ELSE rest_weekday END,
       hired_on = COALESCE($20::date, hired_on)
     WHERE id = $1`,
    [id, input.fullName ?? null, input.branchId ?? null, has('phone'), phone ?? null, has('nationalId'), blank(input.nationalId), has('psraRegNo'), blank(input.psraRegNo), has('psraExpiry'), input.psraExpiry ?? null,
     has('nssfNo'), blank(input.nssfNo), has('shaNo'), blank(input.shaNo), has('kraPin'), blank(input.kraPin), has('restWeekday'), input.restWeekday ?? null, input.hiredOn ?? null]
  );
  await audit(client, ctx, 'guard.update', 'guard', id, { fields: Object.keys(input) }, current.branchId);
  return getGuard(client, ctx, id);
}

/** Wages: owner and payroll only. The old and new figures are written to the audit trail. */
export async function setPay(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof paySchema>): Promise<GuardView> {
  need(ctx, 'rates_write');
  const before = (await client.query('SELECT monthly_basic_cents, allowance_cents, branch_id FROM guards WHERE id = $1', [id])).rows[0];
  if (!before) throw new NotFoundError('That guard was not found.');
  await client.query('UPDATE guards SET monthly_basic_cents = $2, allowance_cents = $3 WHERE id = $1', [id, input.monthlyBasicCents, input.allowanceCents]);
  await audit(client, ctx, 'guard.pay_change', 'guard', id, { fromBasic: Number(before.monthly_basic_cents), toBasic: input.monthlyBasicCents, fromAllowance: Number(before.allowance_cents), toAllowance: input.allowanceCents }, before.branch_id);
  return getGuard(client, ctx, id);
}

/** A guard's own check-in PIN. Shown once, stored as a hash. A phone number is required: that is how the guard signs in. */
export async function resetGuardPin(client: PoolClient, ctx: Ctx, id: string): Promise<{ pin: string; phone: string }> {
  need(ctx, 'guards_write');
  const g = await getGuard(client, ctx, id);
  if (!g.phone) throw new BadRequestError('Add the guard\'s phone number first: they sign in to check in with their phone number and this PIN.');
  if (g.status !== 'active') throw new ConflictError('That guard has left.');
  const pin = generatePin();
  await client.query('UPDATE guards SET pin_hash = $2 WHERE id = $1', [id, await bcrypt.hash(pin, 10)]);
  await audit(client, ctx, 'guard.pin_reset', 'guard', id, {}, g.branchId);
  return { pin, phone: g.phone };
}

/** The guard leaves: the exit date is recorded, future shifts are opened up for someone else, past records stay. */
export async function exitGuard(client: PoolClient, ctx: Ctx, id: string, exitedOn: string): Promise<{ guard: GuardView; shiftsOpened: number }> {
  need(ctx, 'guards_write');
  const g = await getGuard(client, ctx, id);
  if (g.status === 'exited') throw new ConflictError('That guard has already left.');
  if (exitedOn < g.hiredOn) throw new BadRequestError('The exit date is before the hire date.');
  await client.query(`UPDATE guards SET status = 'exited', exited_on = $2, pin_hash = NULL WHERE id = $1`, [id, exitedOn]);
  const opened = await client.query(`UPDATE shifts SET guard_id = NULL WHERE guard_id = $1 AND status = 'scheduled' AND start_at > now() RETURNING id`, [id]);
  await audit(client, ctx, 'guard.exit', 'guard', id, { exitedOn, shiftsOpened: opened.rowCount }, g.branchId);
  return { guard: await getGuard(client, ctx, id), shiftsOpened: opened.rowCount ?? 0 };
}

export async function reinstateGuard(client: PoolClient, ctx: Ctx, id: string): Promise<GuardView> {
  need(ctx, 'guards_write');
  const g = await getGuard(client, ctx, id);
  if (g.status !== 'exited') throw new ConflictError('That guard is already active.');
  await client.query(`UPDATE guards SET status = 'active', exited_on = NULL WHERE id = $1`, [id]);
  await audit(client, ctx, 'guard.reinstate', 'guard', id, {}, g.branchId);
  return getGuard(client, ctx, id);
}

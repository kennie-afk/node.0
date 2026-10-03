/**
 * Rosters: shifts for a post on a day, who is assigned, publishing, swaps and approved overtime. The database refuses an overlapping
 * assignment outright; the service adds readable messages and the optional limits a firm has switched on.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, getSettings, need } from '../common/context';
import { addDays, isDay, localDayOf, monthOf, TZ } from '../common/time';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { rosterConflicts, Slot, templateMinutes } from './roster';

export const templateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
});

export async function listTemplates(client: PoolClient) {
  const rows = (await client.query(`SELECT id, name, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, active FROM shift_templates ORDER BY active DESC, start_time, name`)).rows;
  return rows.map((r) => ({ id: r.id, name: r.name, startTime: r.start_time, endTime: r.end_time, active: r.active, minutes: templateMinutes(r.start_time, r.end_time) }));
}

export async function createTemplate(client: PoolClient, ctx: Ctx, input: z.infer<typeof templateSchema>) {
  need(ctx, 'roster_write');
  if (input.startTime === input.endTime) throw new BadRequestError('A shift cannot start and end at the same time.');
  const row = (await client.query('INSERT INTO shift_templates (org_id, name, start_time, end_time) VALUES ($1, $2, $3, $4) RETURNING id', [ctx.orgId, input.name, input.startTime, input.endTime])).rows[0];
  await audit(client, ctx, 'template.create', 'shift_template', row.id, { ...input });
  return (await listTemplates(client)).find((t) => t.id === row.id)!;
}

export async function setTemplateActive(client: PoolClient, ctx: Ctx, id: string, active: boolean) {
  need(ctx, 'roster_write');
  const r = await client.query('UPDATE shift_templates SET active = $2 WHERE id = $1', [id, active]);
  if (r.rowCount === 0) throw new NotFoundError('That template was not found.');
  await audit(client, ctx, active ? 'template.enable' : 'template.disable', 'shift_template', id);
  return (await listTemplates(client)).find((t) => t.id === id)!;
}

export const shiftSchema = z.object({
  siteId: z.string().uuid(),
  postId: z.string().uuid(),
  guardId: z.string().uuid().optional().nullable(),
  date: z.string().refine(isDay, 'use YYYY-MM-DD'),
  templateId: z.string().uuid().optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()
});

export const bulkShiftSchema = z.object({
  siteId: z.string().uuid(),
  postId: z.string().uuid(),
  templateId: z.string().uuid(),
  from: z.string().refine(isDay),
  to: z.string().refine(isDay),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  guardId: z.string().uuid().optional().nullable()
});

const SHIFT_COLS = `s.id, s.branch_id, s.site_id, si.name AS site, c.name AS client, s.post_id, p.name AS post, s.guard_id, g.full_name AS guard, g.guard_no, s.start_at, s.end_at,
  s.scheduled_minutes, s.status, s.published_at, s.overtime_approved_minutes, s.overtime_note`;
const SHIFT_FROM = `FROM shifts s JOIN sites si ON si.id = s.site_id JOIN clients c ON c.id = si.client_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id`;

export function shiftView(r: Record<string, any>) {
  return {
    id: r.id, branchId: r.branch_id, siteId: r.site_id, site: r.site, client: r.client, postId: r.post_id, post: r.post, guardId: r.guard_id, guard: r.guard, guardNo: r.guard_no,
    startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes, status: r.status, published: !!r.published_at, overtimeApprovedMinutes: r.overtime_approved_minutes, overtimeNote: r.overtime_note,
    day: localDayOf(r.start_at)
  };
}

async function loadShiftRow(client: PoolClient, ctx: Ctx, id: string, lock = false) {
  const r = (await client.query(`SELECT s.*, si.branch_id AS site_branch FROM shifts s JOIN sites si ON si.id = s.site_id WHERE s.id = $1 ${lock ? 'FOR UPDATE OF s' : ''}`, [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That shift was not found.');
  return r;
}

export async function getShift(client: PoolClient, ctx: Ctx, id: string) {
  const r = (await client.query(`SELECT ${SHIFT_COLS} ${SHIFT_FROM} WHERE s.id = $1`, [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That shift was not found.');
  return shiftView(r);
}

/** The guard's other scheduled shifts around the candidate (a week either side is enough for the weekly-hours rule). */
async function othersFor(client: PoolClient, guardId: string, around: Date, excludeShiftId: string | null): Promise<Slot[]> {
  const rows = (
    await client.query(
      `SELECT start_at, end_at FROM shifts WHERE guard_id = $1 AND status = 'scheduled' AND ($3::uuid IS NULL OR id <> $3) AND start_at > $2::timestamptz - interval '8 days' AND start_at < $2::timestamptz + interval '8 days'`,
      [guardId, around, excludeShiftId]
    )
  ).rows;
  return rows.map((r) => ({ start: r.start_at, end: r.end_at }));
}

async function assertGuardMayWork(client: PoolClient, guardId: string, startAt: Date): Promise<void> {
  const g = (await client.query(`SELECT status, to_char(hired_on, 'YYYY-MM-DD') AS hired_on, to_char(exited_on, 'YYYY-MM-DD') AS exited_on FROM guards WHERE id = $1`, [guardId])).rows[0];
  if (!g) throw new NotFoundError('That guard was not found.');
  const day = localDayOf(startAt);
  if (g.status !== 'active' && !(g.exited_on && day <= g.exited_on)) throw new ConflictError('That guard has left.');
  if (g.hired_on > day) throw new ConflictError(`That guard starts on ${g.hired_on}.`);
}

/**
 * Everything that gives a guard a shift goes through here, one at a time per guard: the advisory lock turns a race between two requests
 * into an orderly second request that sees the first and says so, instead of two transactions deadlocking inside the exclusion constraint.
 * The constraint stays as the backstop.
 */
async function checkRoster(client: PoolClient, guardId: string, slot: Slot, excludeShiftId: string | null) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`guard-roster:${guardId}`]);
  const settings = await getSettings(client);
  const conflicts = rosterConflicts(slot, await othersFor(client, guardId, slot.start, excludeShiftId), { maxHoursPerWeek: settings.maxHoursPerWeek, minRestHours: settings.minRestHours }, TZ);
  if (conflicts.length > 0) throw new ConflictError(conflicts.map((c) => c.message).join(' '));
}

async function startEnd(client: PoolClient, input: { date: string; templateId?: string; startTime?: string; endTime?: string }) {
  let start = input.startTime;
  let end = input.endTime;
  if (input.templateId) {
    const t = (await client.query(`SELECT to_char(start_time, 'HH24:MI') AS s, to_char(end_time, 'HH24:MI') AS e FROM shift_templates WHERE id = $1`, [input.templateId])).rows[0];
    if (!t) throw new NotFoundError('That shift template was not found.');
    start = t.s;
    end = t.e;
  }
  if (!start || !end) throw new BadRequestError('Give a shift template, or a start and end time.');
  if (start === end) throw new BadRequestError('A shift cannot start and end at the same time.');
  const minutes = templateMinutes(start, end);
  if (minutes < 30) throw new BadRequestError('A shift is at least 30 minutes long.');
  const startAt = (await client.query(`SELECT (($1::date + $2::time) AT TIME ZONE $3) AS t`, [input.date, start, TZ])).rows[0].t as Date;
  return { startAt, endAt: new Date(startAt.getTime() + minutes * 60_000), minutes };
}

async function insertShift(client: PoolClient, ctx: Ctx, input: { siteId: string; postId: string; guardId?: string | null; date: string; templateId?: string; startTime?: string; endTime?: string }) {
  const site = (await client.query('SELECT branch_id, active FROM sites WHERE id = $1', [input.siteId])).rows[0];
  if (!site || (ctx.branchId && site.branch_id !== ctx.branchId)) throw new NotFoundError('That site was not found.');
  if (!site.active) throw new ConflictError('That site is inactive.');
  const post = (await client.query('SELECT active FROM posts WHERE id = $1 AND site_id = $2', [input.postId, input.siteId])).rows[0];
  if (!post) throw new NotFoundError('That post was not found at this site.');
  if (!post.active) throw new ConflictError('That post is inactive.');
  const { startAt, endAt, minutes } = await startEnd(client, input);
  if (input.guardId) {
    await assertGuardMayWork(client, input.guardId, startAt);
    await checkRoster(client, input.guardId, { start: startAt, end: endAt }, null);
  }
  const row = (
    await client.query(
      `INSERT INTO shifts (org_id, branch_id, site_id, post_id, guard_id, start_at, end_at, scheduled_minutes, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ctx.orgId, site.branch_id, input.siteId, input.postId, input.guardId ?? null, startAt, endAt, minutes, ctx.userId]
    )
  ).rows[0];
  return row.id as string;
}

export async function createShift(client: PoolClient, ctx: Ctx, input: z.infer<typeof shiftSchema>) {
  need(ctx, 'roster_write');
  const id = await insertShift(client, ctx, input);
  await audit(client, ctx, 'shift.create', 'shift', id, { siteId: input.siteId, date: input.date, guardId: input.guardId ?? null });
  return getShift(client, ctx, id);
}

/** A run of the same shift over a date range. Days that clash are skipped and reported, not half-applied. */
export async function createShifts(client: PoolClient, ctx: Ctx, input: z.infer<typeof bulkShiftSchema>) {
  need(ctx, 'roster_write');
  if (input.to < input.from) throw new BadRequestError('The end date is before the start date.');
  const span = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000 + 1;
  if (span > 62) throw new BadRequestError('Create at most 62 days at a time.');
  const created: string[] = [];
  const skipped: Array<{ date: string; reason: string }> = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (input.weekdays && !input.weekdays.includes(weekday)) continue;
    await client.query('SAVEPOINT one_shift');
    try {
      created.push(await insertShift(client, ctx, { siteId: input.siteId, postId: input.postId, guardId: input.guardId, date: day, templateId: input.templateId }));
      await client.query('RELEASE SAVEPOINT one_shift');
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT one_shift');
      if (error instanceof ConflictError || (error as { code?: string }).code === '23P01') skipped.push({ date: day, reason: error instanceof ConflictError ? error.message : 'Clashes with another shift for that guard.' });
      else throw error;
    }
  }
  await audit(client, ctx, 'shift.create_many', 'shift', null, { siteId: input.siteId, from: input.from, to: input.to, created: created.length, skipped: skipped.length });
  return { created: created.length, skipped };
}

export async function listShifts(client: PoolClient, ctx: Ctx, opts: { from: string; to: string; siteId?: string; guardId?: string; branchId?: string; open?: boolean; page: number; pageSize: number }) {
  const where = [`s.start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}')`, `s.start_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')`, `s.status = 'scheduled'`];
  const params: unknown[] = [opts.from, opts.to];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.branchId) add('s.branch_id = ?', ctx.branchId);
  else if (opts.branchId) add('s.branch_id = ?', opts.branchId);
  if (opts.siteId) add('s.site_id = ?', opts.siteId);
  if (opts.guardId) add('s.guard_id = ?', opts.guardId);
  if (opts.open) where.push('s.guard_id IS NULL');
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = Number((await client.query(`SELECT count(*) AS n FROM shifts s ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT ${SHIFT_COLS} ${SHIFT_FROM} ${clause} ORDER BY s.start_at, si.name, p.name, s.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(shiftView), total, page: opts.page, pageSize: opts.pageSize };
}

async function hasAttendance(client: PoolClient, shiftId: string): Promise<boolean> {
  return (await client.query('SELECT 1 FROM attendance_events WHERE shift_id = $1 LIMIT 1', [shiftId])).rows.length > 0;
}

export async function assignGuard(client: PoolClient, ctx: Ctx, shiftId: string, guardId: string | null) {
  need(ctx, 'roster_write');
  const shift = await loadShiftRow(client, ctx, shiftId, true);
  if (shift.status !== 'scheduled') throw new ConflictError('That shift is cancelled.');
  if (await hasAttendance(client, shiftId)) throw new ConflictError('Someone has already checked in on that shift; it can no longer be reassigned.');
  if (guardId) {
    await assertGuardMayWork(client, guardId, shift.start_at);
    await checkRoster(client, guardId, { start: shift.start_at, end: shift.end_at }, shiftId);
  }
  await client.query('UPDATE shifts SET guard_id = $2 WHERE id = $1', [shiftId, guardId]);
  await audit(client, ctx, guardId ? 'shift.assign' : 'shift.unassign', 'shift', shiftId, { from: shift.guard_id, to: guardId }, shift.branch_id);
  return getShift(client, ctx, shiftId);
}

export async function cancelShift(client: PoolClient, ctx: Ctx, shiftId: string, reason: string) {
  need(ctx, 'roster_write');
  const shift = await loadShiftRow(client, ctx, shiftId, true);
  if (shift.status === 'cancelled') throw new ConflictError('That shift is already cancelled.');
  if (await hasAttendance(client, shiftId)) throw new ConflictError('That shift has attendance recorded; it cannot be cancelled.');
  if (reason.trim().length < 3) throw new BadRequestError('Say why the shift is cancelled.');
  const billed = await client.query('SELECT 1 FROM client_invoice_shifts WHERE shift_id = $1', [shiftId]);
  if (billed.rows.length > 0) throw new ConflictError('That shift has been invoiced.');
  await client.query(`UPDATE shifts SET status = 'cancelled' WHERE id = $1`, [shiftId]);
  await audit(client, ctx, 'shift.cancel', 'shift', shiftId, { reason }, shift.branch_id);
  return getShift(client, ctx, shiftId);
}

/** Marks the assigned shifts in a date range as published. Returns how many; shifts already published are left alone. */
export async function publishRoster(client: PoolClient, ctx: Ctx, input: { from: string; to: string; branchId?: string }) {
  need(ctx, 'roster_write');
  const params: unknown[] = [input.from, input.to];
  let branch = '';
  const b = ctx.branchId ?? input.branchId;
  if (b) {
    params.push(b);
    branch = ' AND branch_id = $3';
  }
  const r = await client.query(
    `UPDATE shifts SET published_at = now() WHERE status = 'scheduled' AND guard_id IS NOT NULL AND published_at IS NULL AND start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND start_at < (($2::date + 1)::timestamp AT TIME ZONE '${TZ}')${branch}`,
    params
  );
  await audit(client, ctx, 'roster.publish', 'shift', null, { from: input.from, to: input.to, published: r.rowCount });
  return { published: r.rowCount ?? 0 };
}

// ---- swaps ---------------------------------------------------------------------------------------

export async function requestSwap(client: PoolClient, ctx: Ctx, shiftId: string, toGuardId: string, reason?: string) {
  need(ctx, 'roster_write');
  const shift = await loadShiftRow(client, ctx, shiftId, true);
  if (shift.status !== 'scheduled' || !shift.guard_id) throw new ConflictError('Only an assigned, scheduled shift can be swapped.');
  if (shift.guard_id === toGuardId) throw new BadRequestError('That guard already has the shift.');
  if (new Date(shift.start_at).getTime() < Date.now()) throw new ConflictError('That shift has already started.');
  await assertGuardMayWork(client, toGuardId, shift.start_at);
  const row = (
    await client.query(`INSERT INTO swap_requests (org_id, shift_id, from_guard_id, to_guard_id, requested_by, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [ctx.orgId, shiftId, shift.guard_id, toGuardId, ctx.userId, reason?.trim() || null])
  ).rows[0];
  await audit(client, ctx, 'swap.request', 'swap', row.id, { shiftId, toGuardId }, shift.branch_id);
  return getSwap(client, ctx, row.id);
}

const SWAP_SQL = `SELECT w.id, w.shift_id, w.status, w.reason, w.decision_note, w.created_at, w.decided_at, w.requested_by, w.decided_by, ru.display_name AS requested_by_name, du.display_name AS decided_by_name,
  fg.full_name AS from_guard, tg.full_name AS to_guard, w.from_guard_id, w.to_guard_id, s.start_at, s.end_at, si.name AS site, p.name AS post, s.branch_id
  FROM swap_requests w JOIN shifts s ON s.id = w.shift_id JOIN sites si ON si.id = s.site_id JOIN posts p ON p.id = s.post_id
  JOIN guards fg ON fg.id = w.from_guard_id JOIN guards tg ON tg.id = w.to_guard_id LEFT JOIN users ru ON ru.id = w.requested_by LEFT JOIN users du ON du.id = w.decided_by`;

const swapView = (r: Record<string, any>) => ({ id: r.id, shiftId: r.shift_id, status: r.status, reason: r.reason, decisionNote: r.decision_note, createdAt: r.created_at, decidedAt: r.decided_at, requestedBy: r.requested_by_name, decidedBy: r.decided_by_name, fromGuard: r.from_guard, toGuard: r.to_guard, startAt: r.start_at, endAt: r.end_at, site: r.site, post: r.post });

export async function getSwap(client: PoolClient, ctx: Ctx, id: string) {
  const r = (await client.query(`${SWAP_SQL} WHERE w.id = $1`, [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That swap request was not found.');
  return swapView(r);
}

export async function listSwaps(client: PoolClient, ctx: Ctx, opts: { status?: string; page: number; pageSize: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (ctx.branchId) { params.push(ctx.branchId); where.push(`s.branch_id = $${params.length}`); }
  if (opts.status) { params.push(opts.status); where.push(`w.status = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM swap_requests w JOIN shifts s ON s.id = w.shift_id ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`${SWAP_SQL} ${clause} ORDER BY (w.status = 'pending') DESC, w.created_at DESC LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(swapView), total, page: opts.page, pageSize: opts.pageSize };
}

export async function decideSwap(client: PoolClient, ctx: Ctx, id: string, decision: 'approve' | 'reject' | 'cancel', note?: string) {
  if (decision === 'cancel') need(ctx, 'roster_write');
  else need(ctx, 'swap_approve');
  const req = (await client.query('SELECT * FROM swap_requests WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!req) throw new NotFoundError('That swap request was not found.');
  const shift = await loadShiftRow(client, ctx, req.shift_id, true);
  if (req.status !== 'pending') throw new ConflictError('That request has already been decided.');
  if (decision === 'approve') {
    if (req.requested_by === ctx.userId && ctx.role !== 'owner') throw new ForbiddenError('Someone else must approve a swap you asked for.');
    if (shift.guard_id !== req.from_guard_id) throw new ConflictError('The shift has been reassigned since this was asked.');
    if (await hasAttendance(client, shift.id)) throw new ConflictError('The shift already has attendance recorded.');
    await assertGuardMayWork(client, req.to_guard_id, shift.start_at);
    await checkRoster(client, req.to_guard_id, { start: shift.start_at, end: shift.end_at }, shift.id);
    await client.query('UPDATE shifts SET guard_id = $2 WHERE id = $1', [shift.id, req.to_guard_id]);
  }
  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled';
  await client.query('UPDATE swap_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1', [id, status, ctx.userId, note?.trim() || null]);
  await audit(client, ctx, `swap.${decision}`, 'swap', id, { shiftId: shift.id }, shift.branch_id);
  return getSwap(client, ctx, id);
}

// ---- overtime ------------------------------------------------------------------------------------

/** Only an owner or ops manager approves overtime, only on a shift with a recorded check-out, and never into a closed pay period. */
export async function approveOvertime(client: PoolClient, ctx: Ctx, shiftId: string, minutes: number, note?: string) {
  need(ctx, 'overtime_approve');
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 720) throw new BadRequestError('Overtime is 0 to 720 minutes.');
  const shift = await loadShiftRow(client, ctx, shiftId, true);
  if (minutes > 0) {
    const out = await client.query(`SELECT 1 FROM attendance_events WHERE shift_id = $1 AND kind IN ('out', 'override_out') LIMIT 1`, [shiftId]);
    if (out.rows.length === 0) throw new ConflictError('Overtime can only be approved after the guard has checked out.');
  }
  const closed = await client.query(`SELECT 1 FROM pay_periods WHERE month = $1 AND status = 'closed'`, [monthOf(localDayOf(shift.start_at))]);
  if (closed.rows.length > 0) throw new ConflictError('That month is closed. Pay it as a payroll adjustment in an open month.');
  await client.query('UPDATE shifts SET overtime_approved_minutes = $2, overtime_note = $3 WHERE id = $1', [shiftId, minutes, note?.trim() || null]);
  await audit(client, ctx, 'shift.overtime', 'shift', shiftId, { from: shift.overtime_approved_minutes, to: minutes, note: note ?? null }, shift.branch_id);
  return getShift(client, ctx, shiftId);
}

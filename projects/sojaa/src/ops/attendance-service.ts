/**
 * Recording attendance. Every event is stamped with the SERVER clock when it arrives; a phone's own clock is never read. A check-in
 * outside the geofence is recorded and flagged, never refused. A second check-in for a shift is refused by a unique index, so two
 * simultaneous taps cannot both succeed.
 */
import { PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { audit, Ctx, getSettings, need, OrgSettings } from '../common/context';
import { localDayOf, monthOf, TZ } from '../common/time';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { withOrg, withoutTenant } from '../persistence/pool';
import { normalisePhone } from '../admin/phone';
import { checkWindow, classifyShift, effectiveAttendance, EventRow, Rules, ShiftState } from './attendance';
import { geofenceResult, validFix } from './geo';
import { invalidateOrg } from '../common/ttl-cache';

export const fixSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(100_000).optional() }).optional().nullable();

const rulesOf = (s: OrgSettings): Rules => ({ checkinEarlyMinutes: s.checkinEarlyMinutes, lateGraceMinutes: s.lateGraceMinutes, missedAfterMinutes: s.missedAfterMinutes });

interface Actor {
  method: 'supervisor' | 'guard_pin';
  userId: string | null;
  /** when set, this is a guard checking in alone and may only touch their own shift */
  guardId: string | null;
  branchId: string | null;
}

async function eventsOf(client: PoolClient, shiftId: string): Promise<EventRow[]> {
  const rows = (await client.query('SELECT id, kind, at, effective_at FROM attendance_events WHERE shift_id = $1 ORDER BY id', [shiftId])).rows;
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, at: r.at, effectiveAt: r.effective_at }));
}

async function record(client: PoolClient, orgId: string, actor: Actor, shiftId: string, kind: 'in' | 'out', fix: z.infer<typeof fixSchema>) {
  const shift = (
    await client.query(
      // FOR UPDATE: simultaneous taps on one shift queue up here, so the second sees the first and answers with a clear message. The unique
      // indexes on attendance_events remain the backstop if anything ever bypasses this path.
      `SELECT s.id, s.branch_id, s.guard_id, s.start_at, s.end_at, s.scheduled_minutes, s.status, si.lat, si.lng, si.geofence_m, si.name AS site FROM shifts s JOIN sites si ON si.id = s.site_id WHERE s.id = $1 FOR UPDATE OF s`,
      [shiftId]
    )
  ).rows[0];
  if (!shift) throw new NotFoundError('That shift was not found.');
  if (actor.branchId && shift.branch_id !== actor.branchId) throw new NotFoundError('That shift was not found.');
  if (shift.status !== 'scheduled') throw new ConflictError('That shift was cancelled.');
  if (!shift.guard_id) throw new ConflictError('Nobody is assigned to that shift.');
  if (actor.guardId && actor.guardId !== shift.guard_id) throw new ForbiddenError('That is not your shift.');

  const settings = await getSettings(client);
  const att = effectiveAttendance(await eventsOf(client, shiftId));
  const refusal = checkWindow({ startAt: shift.start_at, endAt: shift.end_at, scheduledMinutes: shift.scheduled_minutes }, kind, att, new Date(), rulesOf(settings));
  if (refusal) throw new ConflictError(refusal);

  const usable = fix && validFix(fix) ? fix : null;
  const geo = geofenceResult({ lat: shift.lat, lng: shift.lng, radiusM: shift.geofence_m ?? settings.defaultGeofenceM }, usable);
  try {
    const row = (
      await client.query(
        `INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, method, recorded_by, lat, lng, accuracy_m, distance_m, geofence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, at`,
        [orgId, shiftId, shift.guard_id, kind, actor.method, actor.userId, usable?.lat ?? null, usable?.lng ?? null, usable?.accuracyM != null ? Math.round(usable.accuracyM) : null, geo.distanceM, geo.geofence]
      )
    ).rows[0];
    return { id: Number(row.id), shiftId, kind, at: row.at as Date, geofence: geo.geofence, distanceM: geo.distanceM, site: shift.site as string, guardId: shift.guard_id as string };
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictError(kind === 'in' ? 'This shift already has a check-in.' : 'This shift already has a check-out.');
    throw error;
  }
}

export async function recordForGuard(client: PoolClient, ctx: Ctx, shiftId: string, kind: 'in' | 'out', fix: z.infer<typeof fixSchema>) {
  need(ctx, 'attendance_record');
  const result = await record(client, ctx.orgId, { method: 'supervisor', userId: ctx.userId, guardId: null, branchId: ctx.branchId }, shiftId, kind, fix);
  await audit(client, ctx, `attendance.${kind}`, 'shift', shiftId, { geofence: result.geofence }, null);
  return result;
}

/**
 * The guard checks in alone with their phone number and PIN, from their own phone. The shift is found for them: the one that is open for
 * check-in (or, for check-out, the one they are on). Both lookups are cheap indexed reads. Throttling is the API layer's job.
 */
export async function guardCheck(input: { phone: string; pin: string; kind: 'in' | 'out'; fix?: z.infer<typeof fixSchema> }) {
  let phone: string;
  try {
    phone = normalisePhone(input.phone);
  } catch {
    throw new UnauthorizedError('That phone number or PIN is not right.');
  }
  const candidates = await withoutTenant(async (c) => (await c.query('SELECT id, org_id, pin_hash FROM resolve_guard($1)', [phone])).rows);
  let found: { id: string; org_id: string } | null = null;
  for (const c of candidates) {
    if (await bcrypt.compare(input.pin, c.pin_hash)) { found = c; break; }
  }
  // the same message whichever part was wrong
  if (!found) throw new UnauthorizedError('That phone number or PIN is not right.');
  const guardId = found.id;
  const orgOfGuard = found.org_id;
  return withOrg(orgOfGuard, async (client) => {
    const settings = await getSettings(client);
    const early = settings.checkinEarlyMinutes;
    const open = (
      await client.query(
        input.kind === 'in'
          ? `SELECT s.id FROM shifts s WHERE s.guard_id = $1 AND s.status = 'scheduled' AND now() >= s.start_at - ($2 || ' minutes')::interval AND now() <= s.end_at
              AND NOT EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in') ORDER BY s.start_at LIMIT 1`
          : `SELECT s.id FROM shifts s WHERE s.guard_id = $1 AND s.status = 'scheduled' AND EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in')
              AND NOT EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'out') ORDER BY s.start_at DESC LIMIT 1`,
        input.kind === 'in' ? [guardId, String(early)] : [guardId]
      )
    ).rows[0];
    if (!open) throw new ConflictError(input.kind === 'in' ? 'You have no shift open for check-in right now.' : 'You are not checked in on any shift.');
    return record(client, found!.org_id, { method: 'guard_pin', userId: null, guardId, branchId: null }, open.id, input.kind, input.fix);
  }).finally(() => invalidateOrg(orgOfGuard)); // a guard's own tap is a write with no signed-in person: clear the dashboard cache here
}

export const overrideSchema = z.object({
  kind: z.enum(['in', 'out']),
  effectiveAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(5).max(500)
});

/**
 * A supervisor's correction: the time they state and a reason, as a new event. The original stays on record. Allowed even in a closed pay
 * period (it is a fact about what happened); the response says so, and any pay difference is a payroll adjustment.
 */
export async function overrideAttendance(client: PoolClient, ctx: Ctx, shiftId: string, input: z.infer<typeof overrideSchema>) {
  need(ctx, 'attendance_override');
  const shift = (await client.query('SELECT id, branch_id, guard_id, start_at, end_at, status FROM shifts WHERE id = $1 FOR UPDATE', [shiftId])).rows[0];
  if (!shift || (ctx.branchId && shift.branch_id !== ctx.branchId)) throw new NotFoundError('That shift was not found.');
  if (!shift.guard_id) throw new ConflictError('Nobody is assigned to that shift.');
  if (shift.status !== 'scheduled') throw new ConflictError('That shift was cancelled.');
  const when = new Date(input.effectiveAt);
  const hour = 3_600_000;
  if (when.getTime() > Date.now() + 5 * 60_000) throw new BadRequestError('The corrected time is in the future.');
  if (when.getTime() < new Date(shift.start_at).getTime() - 12 * hour || when.getTime() > new Date(shift.end_at).getTime() + 12 * hour) throw new BadRequestError('The corrected time is more than 12 hours outside the shift.');
  const att = effectiveAttendance(await eventsOf(client, shiftId));
  const nextIn = input.kind === 'in' ? when : att.inAt;
  const nextOut = input.kind === 'out' ? when : att.outAt;
  if (input.kind === 'out' && !att.inAt) throw new ConflictError('There is no check-in to put a check-out after. Correct the check-in first.');
  if (nextIn && nextOut && nextOut.getTime() <= nextIn.getTime()) throw new BadRequestError('The check-out must be after the check-in.');
  const row = (
    await client.query(
      `INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, method, recorded_by, effective_at, reason, geofence) VALUES ($1, $2, $3, $4, 'override', $5, $6, $7, 'unknown') RETURNING id`,
      [ctx.orgId, shiftId, shift.guard_id, input.kind === 'in' ? 'override_in' : 'override_out', ctx.userId, when, input.reason]
    )
  ).rows[0];
  await audit(client, ctx, `attendance.override_${input.kind}`, 'shift', shiftId, { effectiveAt: input.effectiveAt, reason: input.reason }, shift.branch_id);
  const closed = (await client.query(`SELECT 1 FROM pay_periods WHERE month = $1 AND status = 'closed'`, [monthOf(localDayOf(shift.start_at))])).rows.length > 0;
  return { id: Number(row.id), periodClosed: closed, note: closed ? 'That month is already closed. The correction is recorded; any pay difference must be paid as a payroll adjustment.' : null };
}

// ---- the board -------------------------------------------------------------------------------------------

export const ATTENDANCE_SQL = `
  COALESCE((SELECT e.effective_at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_in' ORDER BY e.id DESC LIMIT 1), (SELECT e.at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in')) AS in_at,
  COALESCE((SELECT e.effective_at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_out' ORDER BY e.id DESC LIMIT 1), (SELECT e.at FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'out')) AS out_at,
  EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_in') AS in_overridden,
  EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'override_out') AS out_overridden,
  (SELECT e.geofence FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in') AS in_geofence,
  (SELECT e.method FROM attendance_events e WHERE e.shift_id = s.id AND e.kind = 'in') AS in_method`;

export interface BoardRow {
  shiftId: string;
  siteId: string;
  site: string;
  client: string;
  post: string;
  guardId: string | null;
  guard: string | null;
  guardNo: string | null;
  startAt: Date;
  endAt: Date;
  state: ShiftState | 'open';
  late: boolean;
  lateMinutes: number;
  inAt: Date | null;
  outAt: Date | null;
  inOverridden: boolean;
  outOverridden: boolean;
  geofence: string | null;
  method: string | null;
}

export function boardRow(r: Record<string, any>, rules: Rules, now: Date): BoardRow {
  const att = { inAt: r.in_at as Date | null, outAt: r.out_at as Date | null, inOverridden: r.in_overridden, outOverridden: r.out_overridden };
  const c = r.guard_id
    ? classifyShift({ startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes, cancelled: r.status === 'cancelled' }, att, now, rules)
    : { state: 'open' as const, late: false, lateMinutes: 0 };
  return {
    shiftId: r.id, siteId: r.site_id, site: r.site, client: r.client, post: r.post, guardId: r.guard_id, guard: r.guard, guardNo: r.guard_no, startAt: r.start_at, endAt: r.end_at,
    state: c.state, late: c.late, lateMinutes: c.lateMinutes, inAt: att.inAt, outAt: att.outAt, inOverridden: att.inOverridden, outOverridden: att.outOverridden, geofence: r.in_geofence, method: r.in_method
  };
}

/**
 * The same classification as classifyShift (attendance.ts), written in SQL so the board can count and page in the database instead of
 * loading a whole day of shifts into the process. tests/board-sql.test.ts holds the two to the same answers on a seeded day. The rule values
 * and "now" are bind parameters; boardRow above is the JavaScript reference that test compares against.
 */
function boardBase(where: string[], nowParam: string, graceParam: string, missedParam: string): string {
  return `SELECT x.*,
      CASE
        WHEN x.status = 'cancelled' THEN 'cancelled'
        WHEN x.guard_id IS NULL THEN 'open'
        WHEN x.in_at IS NOT NULL AND x.out_at IS NOT NULL THEN 'completed'
        WHEN x.in_at IS NOT NULL THEN CASE WHEN ${nowParam}::timestamptz > x.end_at + (${missedParam}::int * interval '1 minute') THEN 'no_checkout' ELSE 'on_site' END
        WHEN ${nowParam}::timestamptz < x.start_at THEN 'upcoming'
        WHEN ${nowParam}::timestamptz >= x.start_at + (${missedParam}::int * interval '1 minute') THEN 'missed'
        ELSE 'awaiting' END AS state,
      (x.guard_id IS NOT NULL AND x.in_at IS NOT NULL AND floor(extract(epoch FROM (x.in_at - x.start_at)) / 60) > ${graceParam}::int) AS is_late,
      CASE WHEN x.guard_id IS NOT NULL AND x.in_at IS NOT NULL AND floor(extract(epoch FROM (x.in_at - x.start_at)) / 60) > ${graceParam}::int
           THEN floor(extract(epoch FROM (x.in_at - x.start_at)) / 60)::int ELSE 0 END AS late_minutes
    FROM (
      SELECT s.id, s.site_id, si.name AS site, c.name AS client, p.name AS post, s.guard_id, g.full_name AS guard, g.guard_no, s.start_at, s.end_at, s.scheduled_minutes, s.status, ${ATTENDANCE_SQL}
        FROM shifts s JOIN sites si ON si.id = s.site_id JOIN clients c ON c.id = si.client_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id
       WHERE ${where.join(' AND ')}
    ) x`;
}

const BOARD_RANK = `CASE b.state WHEN 'missed' THEN 0 WHEN 'no_checkout' THEN 1 WHEN 'open' THEN 2 WHEN 'awaiting' THEN 3 WHEN 'on_site' THEN 4 WHEN 'upcoming' THEN 5 WHEN 'completed' THEN 6 ELSE 7 END`;

function boardWhere(ctx: Ctx, opts: { day: string; siteId?: string; branchId?: string }): { where: string[]; params: unknown[] } {
  const params: unknown[] = [opts.day];
  // A day's board is the shifts that STARTED that day. For today it also carries shifts that started before midnight and are still running
  // or ended after it: a night shift must not vanish from the board at 00:01, which is when it matters most.
  const startedToday = `(s.start_at >= ($1::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < (($1::date + 1)::timestamp AT TIME ZONE '${TZ}'))`;
  const carriedOver = opts.day === localDayOf(new Date()) ? ` OR (s.start_at < ($1::date::timestamp AT TIME ZONE '${TZ}') AND s.end_at > ($1::date::timestamp AT TIME ZONE '${TZ}'))` : '';
  const where = [`s.status = 'scheduled'`, `(${startedToday}${carriedOver})`];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.branchId) add('s.branch_id = ?', ctx.branchId);
  else if (opts.branchId) add('s.branch_id = ?', opts.branchId);
  if (opts.siteId) add('s.site_id = ?', opts.siteId);
  return { where, params };
}

/** Counts for a day's board without loading any rows: one grouped query. */
export async function boardCounts(client: PoolClient, ctx: Ctx, opts: { day: string; siteId?: string; branchId?: string }, now: Date = new Date()): Promise<Record<string, number>> {
  const rules = rulesOf(await getSettings(client));
  const { where, params } = boardWhere(ctx, opts);
  params.push(now, rules.lateGraceMinutes, rules.missedAfterMinutes);
  const n = params.length;
  const rows = (await client.query(
    `SELECT b.state, count(*)::int AS n, count(*) FILTER (WHERE b.is_late)::int AS late, count(*) FILTER (WHERE b.in_geofence = 'outside')::int AS outside
       FROM (${boardBase(where, `$${n - 2}`, `$${n - 1}`, `$${n}`)}) b GROUP BY b.state`, params)).rows;
  const counts: Record<string, number> = { total: 0, upcoming: 0, awaiting: 0, missed: 0, on_site: 0, no_checkout: 0, completed: 0, open: 0, late: 0, outsideGeofence: 0 };
  for (const r of rows) {
    counts[r.state] = (counts[r.state] ?? 0) + r.n;
    counts.total! += r.n;
    counts.late! += r.late;
    counts.outsideGeofence! += r.outside;
  }
  return counts;
}

/**
 * Today's attendance, or any day's. Counts cover the whole day; the rows are one page of it, worst first (missed, then late, then the rest),
 * so a supervisor sees what needs a phone call before what is fine. Filtering, ordering and paging all happen in SQL.
 */
export async function board(client: PoolClient, ctx: Ctx, opts: { day: string; siteId?: string; branchId?: string; state?: string; page: number; pageSize: number }, now: Date = new Date()) {
  const rules = rulesOf(await getSettings(client));
  const counts = await boardCounts(client, ctx, opts, now);
  const { where, params } = boardWhere(ctx, opts);
  params.push(now, rules.lateGraceMinutes, rules.missedAfterMinutes);
  const n = params.length;
  let filter = '';
  if (opts.state === 'late') filter = 'WHERE b.is_late';
  else if (opts.state) { params.push(opts.state); filter = `WHERE b.state = $${params.length}`; }
  const total = opts.state ? (opts.state === 'late' ? counts.late! : counts[opts.state] ?? 0) : counts.total!;
  const rows = (await client.query(
    `SELECT b.* FROM (${boardBase(where, `$${n - 2}`, `$${n - 1}`, `$${n}`)}) b ${filter}
      ORDER BY ${BOARD_RANK}, b.is_late DESC, b.start_at, b.site, b.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  const items: BoardRow[] = rows.map((r) => ({
    shiftId: r.id, siteId: r.site_id, site: r.site, client: r.client, post: r.post, guardId: r.guard_id, guard: r.guard, guardNo: r.guard_no, startAt: r.start_at, endAt: r.end_at,
    state: r.state, late: r.is_late, lateMinutes: r.late_minutes, inAt: r.in_at, outAt: r.out_at, inOverridden: r.in_overridden, outOverridden: r.out_overridden, geofence: r.in_geofence, method: r.in_method
  }));
  return { day: opts.day, counts, items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function shiftHistory(client: PoolClient, ctx: Ctx, shiftId: string) {
  const s = (await client.query('SELECT branch_id FROM shifts WHERE id = $1', [shiftId])).rows[0];
  if (!s || (ctx.branchId && s.branch_id !== ctx.branchId)) throw new NotFoundError('That shift was not found.');
  const rows = (
    await client.query(
      `SELECT e.id, e.kind, e.at, e.effective_at, e.method, e.geofence, e.distance_m, e.accuracy_m, e.reason, u.display_name AS by_name FROM attendance_events e LEFT JOIN users u ON u.id = e.recorded_by WHERE e.shift_id = $1 ORDER BY e.id`,
      [shiftId]
    )
  ).rows;
  return rows.map((r) => ({ id: Number(r.id), kind: r.kind, at: r.at, effectiveAt: r.effective_at, method: r.method, geofence: r.geofence, distanceM: r.distance_m, accuracyM: r.accuracy_m, reason: r.reason, by: r.by_name }));
}

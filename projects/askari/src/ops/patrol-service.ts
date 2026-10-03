/** QR checkpoint scans and the rounds they add up to. Scans are facts: they are never edited or deleted. */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { Ctx, need } from '../common/context';
import bcrypt from 'bcrypt';
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../domain/errors';
import { withOrg, withoutTenant } from '../persistence/pool';
import { normalisePhone } from '../admin/phone';
import { evaluatePatrol } from './patrol';
import { geofenceResult, validFix } from './geo';
import { getSettings } from '../common/context';
import { fixSchema } from './attendance-service';
import { localDayOf } from '../common/time';

export const scanSchema = z.object({ token: z.string().trim().min(8).max(100), shiftId: z.string().uuid(), fix: fixSchema });

export async function scan(client: PoolClient, ctx: Ctx, input: z.infer<typeof scanSchema>) {
  need(ctx, 'patrol_scan');
  return recordScan(client, ctx.orgId, { method: 'supervisor', userId: ctx.userId, branchId: ctx.branchId, guardId: null }, input.token, input.shiftId, input.fix);
}

export async function recordScan(client: PoolClient, orgId: string, actor: { method: 'supervisor' | 'guard_pin'; userId: string | null; branchId: string | null; guardId: string | null }, token: string, shiftId: string, fix: z.infer<typeof fixSchema>) {
  const cp = (await client.query('SELECT k.id, k.name, k.site_id, k.active, s.lat, s.lng, s.geofence_m FROM checkpoints k JOIN sites s ON s.id = k.site_id WHERE k.token = $1', [token])).rows[0];
  // an unknown token and a retired one get the same answer
  if (!cp || !cp.active) throw new NotFoundError('That QR code is not recognised. It may have been replaced.');
  const shift = (await client.query('SELECT id, branch_id, site_id, guard_id, status FROM shifts WHERE id = $1', [shiftId])).rows[0];
  if (!shift || (actor.branchId && shift.branch_id !== actor.branchId)) throw new NotFoundError('That shift was not found.');
  if (actor.guardId && shift.guard_id !== actor.guardId) throw new ConflictError('That is not your shift.');
  if (shift.site_id !== cp.site_id) throw new ConflictError('That checkpoint belongs to a different site from this shift.');
  if (shift.status !== 'scheduled') throw new ConflictError('That shift was cancelled.');
  const on = (await client.query(`SELECT 1 FROM attendance_events WHERE shift_id = $1 AND kind IN ('in', 'override_in') LIMIT 1`, [shiftId])).rows.length > 0;
  if (!on) throw new ConflictError('Check in on the shift before patrolling.');
  const done = (await client.query(`SELECT 1 FROM attendance_events WHERE shift_id = $1 AND kind IN ('out', 'override_out') LIMIT 1`, [shiftId])).rows.length > 0;
  if (done) throw new ConflictError('That shift has ended.');
  const settings = await getSettings(client);
  const usable = fix && validFix(fix) ? fix : null;
  const geo = geofenceResult({ lat: cp.lat, lng: cp.lng, radiusM: cp.geofence_m ?? settings.defaultGeofenceM }, usable);
  const row = (
    await client.query(
      `INSERT INTO patrol_scans (org_id, site_id, shift_id, guard_id, checkpoint_id, method, recorded_by, lat, lng, geofence) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, scanned_at`,
      [orgId, cp.site_id, shiftId, shift.guard_id, cp.id, actor.method, actor.userId, usable?.lat ?? null, usable?.lng ?? null, geo.geofence]
    )
  ).rows[0];
  return { id: Number(row.id), checkpoint: cp.name as string, at: row.scanned_at as Date, geofence: geo.geofence };
}

export async function shiftPatrol(client: PoolClient, ctx: Ctx, shiftId: string) {
  const shift = (await client.query('SELECT s.id, s.branch_id, s.site_id, si.checkpoints_ordered, si.rounds_per_shift FROM shifts s JOIN sites si ON si.id = s.site_id WHERE s.id = $1', [shiftId])).rows[0];
  if (!shift || (ctx.branchId && shift.branch_id !== ctx.branchId)) throw new NotFoundError('That shift was not found.');
  const cps = (await client.query('SELECT id, name, seq FROM checkpoints WHERE site_id = $1 AND active ORDER BY seq', [shift.site_id])).rows;
  const scans = (await client.query('SELECT checkpoint_id, scanned_at, geofence FROM patrol_scans WHERE shift_id = $1 ORDER BY scanned_at, id', [shiftId])).rows;
  const evaluation = evaluatePatrol(cps, scans.map((s) => ({ checkpointId: s.checkpoint_id, at: s.scanned_at })), shift.checkpoints_ordered, shift.rounds_per_shift);
  return { ...evaluation, checkpoints: cps.length, scans: scans.length, outsideGeofence: scans.filter((s) => s.geofence === 'outside').length };
}

/** Per site for a day: how many shifts met the rounds the site requires. Only sites that require rounds are listed. */
export async function patrolDay(client: PoolClient, ctx: Ctx, day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new BadRequestError('use YYYY-MM-DD');
  const params: unknown[] = [day];
  let branch = '';
  if (ctx.branchId) {
    params.push(ctx.branchId);
    branch = ' AND s.branch_id = $2';
  }
  // like the attendance board: today also carries the shifts that started before midnight and have not finished their day
  const carried = day === localDayOf(new Date()) ? ` OR (s.start_at < ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi') AND s.end_at > ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi'))` : '';
  const shifts = (
    await client.query(
      `SELECT s.id, s.site_id, si.name AS site, g.full_name AS guard, p.name AS post, si.rounds_per_shift, si.checkpoints_ordered
         FROM shifts s JOIN sites si ON si.id = s.site_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id
        WHERE s.status = 'scheduled' AND si.rounds_per_shift > 0 AND s.guard_id IS NOT NULL
          AND ((s.start_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi') AND s.start_at < (($1::date + 1)::timestamp AT TIME ZONE 'Africa/Nairobi'))${carried})${branch}
        ORDER BY si.name, s.start_at`,
      params
    )
  ).rows;
  const out = [];
  for (const s of shifts) {
    const p = await shiftPatrol(client, ctx, s.id);
    out.push({ shiftId: s.id, site: s.site, post: s.post, guard: s.guard, roundsRequired: p.roundsRequired, completeRounds: p.completeRounds, shortfall: p.shortfall, outsideGeofence: p.outsideGeofence });
  }
  return out;
}

/** A guard scans a checkpoint alone, with their phone number and PIN: the shift is the one they are currently on at that checkpoint's site. */
export async function guardScan(input: { phone: string; pin: string; token: string; fix?: z.infer<typeof fixSchema> }) {
  let phone: string;
  try {
    phone = normalisePhone(input.phone);
  } catch {
    throw new UnauthorizedError('That phone number or PIN is not right.');
  }
  const candidates = await withoutTenant(async (c) => (await c.query('SELECT id, org_id, pin_hash FROM resolve_guard($1)', [phone])).rows);
  let found: { id: string; org_id: string } | null = null;
  for (const c of candidates) if (await bcrypt.compare(input.pin, c.pin_hash)) { found = c; break; }
  if (!found) throw new UnauthorizedError('That phone number or PIN is not right.');
  const guard = found;
  return withOrg(guard.org_id, async (client) => {
    const cp = (await client.query('SELECT site_id FROM checkpoints WHERE token = $1 AND active', [input.token])).rows[0];
    if (!cp) throw new NotFoundError('That QR code is not recognised. It may have been replaced.');
    const shift = (
      await client.query(
        `SELECT s.id FROM shifts s WHERE s.guard_id = $1 AND s.site_id = $2 AND s.status = 'scheduled'
            AND EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind IN ('in', 'override_in'))
            AND NOT EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind IN ('out', 'override_out')) ORDER BY s.start_at DESC LIMIT 1`,
        [guard.id, cp.site_id]
      )
    ).rows[0];
    if (!shift) throw new ConflictError('You are not checked in on a shift at this site.');
    return recordScan(client, guard.org_id, { method: 'guard_pin', userId: null, branchId: null, guardId: guard.id }, input.token, shift.id, input.fix);
  });
}

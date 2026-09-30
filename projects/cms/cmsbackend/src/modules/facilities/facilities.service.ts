import { randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { BadRequestError, ConflictError, ForbiddenError } from '../../utils/errors';
import { camel, getRow, idCursor, idNext, insertRow, select, selectOne, updateRow } from '../ops-kit';
import { Role } from '../../auth/permissions';

const bools = ['is_active', 'requires_approval'];
const LIVE = ['PENDING', 'APPROVED'];
const MAX_HOURS = 24 * 14;

export async function listResources(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT * FROM facility_resources WHERE church_id = ? ORDER BY name`, [churchId])).map((r) => camel(r, { bools }));
}
export async function createResource(t: Transaction, churchId: number, i: { name: string; kind?: string; capacity?: number | null; requiresApproval?: boolean; description?: string | null }) {
  const id = await insertRow(t, 'facility_resources', churchId, { name: i.name, kind: i.kind ?? 'ROOM', capacity: i.capacity ?? null, requires_approval: i.requiresApproval ?? false, description: i.description ?? null, is_active: true });
  return camel(await getRow(t, 'facility_resources', churchId, id, 'resource'), { bools });
}
export async function updateResource(t: Transaction, churchId: number, id: number, p: { name?: string; capacity?: number | null; requiresApproval?: boolean; description?: string | null; isActive?: boolean }) {
  await getRow(t, 'facility_resources', churchId, id, 'resource');
  await updateRow(t, 'facility_resources', churchId, id, { name: p.name, capacity: p.capacity, requires_approval: p.requiresApproval, description: p.description, is_active: p.isActive });
  return camel(await getRow(t, 'facility_resources', churchId, id, 'resource'), { bools });
}

export interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;
  count: number;
}

export function occurrences(start: Date, end: Date, rule?: Recurrence): Array<{ start: Date; end: Date }> {
  if (!rule) return [{ start, end }];
  const every = rule.interval ?? 1;
  const length = end.getTime() - start.getTime();
  const out: Array<{ start: Date; end: Date }> = [];
  for (let n = 0; n < rule.count; n += 1) {
    const s = new Date(start);
    if (rule.freq === 'DAILY') s.setUTCDate(s.getUTCDate() + n * every);
    else if (rule.freq === 'WEEKLY') s.setUTCDate(s.getUTCDate() + n * every * 7);
    else {
      const day = start.getUTCDate();
      s.setUTCDate(1);
      s.setUTCMonth(start.getUTCMonth() + n * every);
      const lastDay = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)).getUTCDate();
      s.setUTCDate(Math.min(day, lastDay));
    }
    out.push({ start: s, end: new Date(s.getTime() + length) });
  }
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].start < out[i - 1].end) throw new BadRequestError('the recurrence repeats more often than the booking is long');
  }
  return out;
}

async function overlapping(t: Transaction, churchId: number, resourceId: number, start: Date, end: Date, ignoreId?: number) {
  return select<any>(
    t,
    `SELECT id, title, starts_at, ends_at FROM facility_bookings WHERE church_id = ? AND resource_id = ? AND status IN ('PENDING','APPROVED') AND starts_at < ? AND ends_at > ? ${ignoreId ? 'AND id <> ?' : ''} ORDER BY starts_at LIMIT 5`,
    [churchId, resourceId, end, start, ...(ignoreId ? [ignoreId] : [])]
  );
}

function isExclusionViolation(error: any): boolean {
  return error?.parent?.code === '23P01' || error?.original?.code === '23P01' || error?.name === 'SequelizeExclusionConstraintError';
}

export async function createBooking(
  t: Transaction,
  churchId: number,
  userId: number,
  role: Role,
  i: { resourceId: number; title: string; startsAt: Date; endsAt: Date; notes?: string | null; recurrence?: Recurrence }
) {
  const resource = await getRow(t, 'facility_resources', churchId, i.resourceId, 'resource');
  if (!(resource.is_active === true || resource.is_active === 1)) throw new ConflictError(`${resource.name} is not available for booking`);
  if (i.endsAt <= i.startsAt) throw new BadRequestError('the booking must end after it starts');
  if ((i.endsAt.getTime() - i.startsAt.getTime()) / 3_600_000 > MAX_HOURS) throw new BadRequestError('a single booking may not exceed 14 days');
  const slots = occurrences(i.startsAt, i.endsAt, i.recurrence);

  const clashes: string[] = [];
  for (const slot of slots) {
    const hit = await overlapping(t, churchId, i.resourceId, slot.start, slot.end);
    if (hit.length > 0) clashes.push(`${slot.start.toISOString().slice(0, 16)}Z clashes with "${hit[0].title}"`);
  }
  if (clashes.length > 0) throw new ConflictError(`${resource.name} is already booked: ${clashes.slice(0, 5).join('; ')}${clashes.length > 5 ? ` (+${clashes.length - 5} more)` : ''}`);

  const needsApproval = (resource.requires_approval === true || resource.requires_approval === 1) && role !== 'ADMIN';
  const status = needsApproval ? 'PENDING' : 'APPROVED';
  const seriesId = slots.length > 1 ? randomUUID() : null;
  const ids: number[] = [];
  try {
    for (const slot of slots) {
      ids.push(await insertRow(t, 'facility_bookings', churchId, { resource_id: i.resourceId, title: i.title, starts_at: slot.start, ends_at: slot.end, booked_by_user_id: userId, status, series_id: seriesId, notes: i.notes ?? null, decided_by: needsApproval ? null : userId, decided_at: needsApproval ? null : new Date() }));
    }
  } catch (error) {
    // Two requests can both pass the check above; the database constraint is the real arbiter.
    if (isExclusionViolation(error)) throw new ConflictError(`${resource.name} was just booked by someone else for that time`);
    throw error;
  }
  const rows = await select<any>(t, `SELECT * FROM facility_bookings WHERE church_id = ? AND id IN (${ids.map(() => '?').join(',')}) ORDER BY starts_at`, [churchId, ...ids]);
  return { seriesId, count: rows.length, status, bookings: rows.map((r) => camel(r)) };
}

export async function listBookings(t: Transaction, churchId: number, f: { resourceId?: number; status?: string; from?: Date; to?: Date; mine?: number; limit: number; cursor?: string }) {
  const where = ['b.church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.resourceId) { where.push('b.resource_id = ?'); params.push(f.resourceId); }
  if (f.status) { where.push('b.status = ?'); params.push(f.status); }
  if (f.from) { where.push('b.ends_at >= ?'); params.push(f.from); }
  if (f.to) { where.push('b.starts_at <= ?'); params.push(f.to); }
  if (f.mine) { where.push('b.booked_by_user_id = ?'); params.push(f.mine); }
  const after = idCursor(f.cursor);
  if (after) { where.push('b.id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT b.*, r.name AS resource_name FROM facility_bookings b JOIN facility_resources r ON r.church_id = b.church_id AND r.id = b.resource_id WHERE ${where.join(' AND ')} ORDER BY b.id DESC LIMIT ?`, [...params, f.limit + 1]);
  return idNext(rows.map((r) => camel(r)), f.limit);
}

export async function availability(t: Transaction, churchId: number, resourceId: number, from: Date, to: Date) {
  await getRow(t, 'facility_resources', churchId, resourceId, 'resource');
  const rows = await select<any>(t, `SELECT id, title, status, starts_at, ends_at FROM facility_bookings WHERE church_id = ? AND resource_id = ? AND status IN ('PENDING','APPROVED') AND ends_at > ? AND starts_at < ? ORDER BY starts_at`, [churchId, resourceId, from, to]);
  return { resourceId, busy: rows.map((r) => camel(r)) };
}

export async function decide(t: Transaction, churchId: number, userId: number, id: number, approve: boolean) {
  const row = await getRow(t, 'facility_bookings', churchId, id, 'booking');
  if (row.status !== 'PENDING') throw new ConflictError(`booking is already ${String(row.status).toLowerCase()}`);
  await updateRow(t, 'facility_bookings', churchId, id, { status: approve ? 'APPROVED' : 'REJECTED', decided_by: userId, decided_at: new Date() });
  return camel(await getRow(t, 'facility_bookings', churchId, id, 'booking'));
}

/** Cancelling releases the slot (cancelled rows fall outside the exclusion constraint). */
export async function cancel(t: Transaction, churchId: number, userId: number, role: Role, id: number, scope: 'ONE' | 'SERIES') {
  const row = await getRow(t, 'facility_bookings', churchId, id, 'booking');
  if (Number(row.booked_by_user_id) !== userId && role !== 'ADMIN') throw new ForbiddenError('only the person who booked, or an administrator, can cancel');
  if (row.status === 'CANCELLED') throw new ConflictError('booking is already cancelled');
  const now = new Date();
  if (scope === 'SERIES' && row.series_id) {
    const n = await select(t, `UPDATE facility_bookings SET status = 'CANCELLED', updated_at = ? WHERE church_id = ? AND series_id = ? AND status IN ('PENDING','APPROVED') AND starts_at >= ? RETURNING id`, [now, churchId, row.series_id, row.starts_at]);
    return { cancelled: n.length };
  }
  await updateRow(t, 'facility_bookings', churchId, id, { status: 'CANCELLED' });
  return { cancelled: 1 };
}

export async function getBooking(t: Transaction, churchId: number, id: number) {
  return camel(await getRow(t, 'facility_bookings', churchId, id, 'booking'));
}

void selectOne;
void LIVE;

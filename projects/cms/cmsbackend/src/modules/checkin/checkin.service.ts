import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { Transaction } from 'sequelize';
import { env } from '../../config/env';
import { currentTenantOrNull } from '../../common/tenant-context';
import { ApiError, BadRequestError, ConflictError, ForbiddenError } from '../../utils/errors';
import { assertMember, assertRef, camel, deleteRow, getRow, idCursor, idNext, insertRow, select, selectOne, toCsv, updateRow } from '../ops-kit';
import { recordAudit } from '../finance/audit.service';

const MAX_CODE_ATTEMPTS = 5;
const bools = ['is_active', 'photo_consent', 'is_authorized_pickup'];

function ageMonths(dob: string, now = new Date()): number {
  const d = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  return (now.getUTCFullYear() - d.getUTCFullYear()) * 12 + (now.getUTCMonth() - d.getUTCMonth()) - (now.getUTCDate() < d.getUTCDate() ? 1 : 0);
}

const codeHash = (churchId: number, childId: number, code: string) => createHmac('sha256', env.JWT_SECRET).update(`pickup|${churchId}|${childId}|${code}`).digest('hex');

// ---- rooms ----------------------------------------------------------------------------

export async function listRooms(t: Transaction, churchId: number) {
  const rows = await select<any>(t, `SELECT r.*, (SELECT COUNT(*) FROM checkin_sessions s WHERE s.church_id = r.church_id AND s.room_id = r.id AND s.status = 'IN') AS present FROM checkin_rooms r WHERE r.church_id = ? ORDER BY r.min_age_months`, [churchId]);
  return rows.map((r) => camel(r, { bools: ['is_active'] }));
}
export async function createRoom(t: Transaction, churchId: number, i: { name: string; minAgeMonths: number; maxAgeMonths: number; capacity: number }) {
  if (i.maxAgeMonths < i.minAgeMonths) throw new BadRequestError('maxAgeMonths is below minAgeMonths');
  const id = await insertRow(t, 'checkin_rooms', churchId, { name: i.name, min_age_months: i.minAgeMonths, max_age_months: i.maxAgeMonths, capacity: i.capacity, is_active: true });
  return camel(await getRow(t, 'checkin_rooms', churchId, id, 'room'), { bools: ['is_active'] });
}
export async function updateRoom(t: Transaction, churchId: number, id: number, p: { name?: string; capacity?: number; isActive?: boolean; minAgeMonths?: number; maxAgeMonths?: number }) {
  const row = await getRow(t, 'checkin_rooms', churchId, id, 'room');
  const min = p.minAgeMonths ?? row.min_age_months;
  const max = p.maxAgeMonths ?? row.max_age_months;
  if (max < min) throw new BadRequestError('maxAgeMonths is below minAgeMonths');
  await updateRow(t, 'checkin_rooms', churchId, id, { name: p.name, capacity: p.capacity, is_active: p.isActive, min_age_months: p.minAgeMonths, max_age_months: p.maxAgeMonths });
  return camel(await getRow(t, 'checkin_rooms', churchId, id, 'room'), { bools: ['is_active'] });
}

// ---- children & guardians -------------------------------------------------------------

export async function createChild(t: Transaction, churchId: number, i: { memberId?: number | null; firstName: string; lastName: string; dateOfBirth: string; allergies?: string | null; medicalNotes?: string | null; photoConsent?: boolean; guardians?: Array<{ name: string; phone?: string | null; relationship?: string; memberId?: number | null; isAuthorizedPickup?: boolean }> }) {
  await assertMember(t, churchId, i.memberId);
  if (new Date(i.dateOfBirth) > new Date()) throw new BadRequestError('date of birth is in the future');
  const id = await insertRow(t, 'checkin_children', churchId, { member_id: i.memberId ?? null, first_name: i.firstName, last_name: i.lastName, date_of_birth: i.dateOfBirth, allergies: i.allergies ?? null, medical_notes: i.medicalNotes ?? null, photo_consent: i.photoConsent ?? false, is_active: true });
  for (const g of i.guardians ?? []) await addGuardian(t, churchId, id, g);
  return getChild(t, churchId, id);
}
export async function getChild(t: Transaction, churchId: number, id: number) {
  const row = await getRow(t, 'checkin_children', churchId, id, 'child');
  const guardians = await select<any>(t, `SELECT * FROM checkin_guardians WHERE church_id = ? AND child_id = ? ORDER BY id`, [churchId, id]);
  return { ...camel(row, { bools, days: ['date_of_birth'] }), ageMonths: ageMonths(String(row.date_of_birth instanceof Date ? row.date_of_birth.toISOString() : row.date_of_birth)), guardians: guardians.map((g) => camel(g, { bools })) };
}
export async function listChildren(t: Transaction, churchId: number, f: { q?: string; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.q) { where.push('(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ?)'); const like = `%${f.q.toLowerCase().replace(/[%_]/g, '')}%`; params.push(like, like); }
  const after = idCursor(f.cursor);
  if (after) { where.push('id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT * FROM checkin_children WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, f.limit + 1]);
  return idNext(rows.map((r) => camel(r, { bools, days: ['date_of_birth'] })), f.limit);
}
export async function updateChild(t: Transaction, churchId: number, id: number, p: { firstName?: string; lastName?: string; allergies?: string | null; medicalNotes?: string | null; photoConsent?: boolean; isActive?: boolean }) {
  await getRow(t, 'checkin_children', churchId, id, 'child');
  await updateRow(t, 'checkin_children', churchId, id, { first_name: p.firstName, last_name: p.lastName, allergies: p.allergies, medical_notes: p.medicalNotes, photo_consent: p.photoConsent, is_active: p.isActive });
  return getChild(t, churchId, id);
}
export async function addGuardian(t: Transaction, churchId: number, childId: number, g: { name: string; phone?: string | null; relationship?: string; memberId?: number | null; isAuthorizedPickup?: boolean }) {
  await getRow(t, 'checkin_children', churchId, childId, 'child');
  await assertMember(t, churchId, g.memberId);
  const id = await insertRow(t, 'checkin_guardians', churchId, { child_id: childId, member_id: g.memberId ?? null, name: g.name, phone: g.phone ?? null, relationship: g.relationship ?? 'Parent', is_authorized_pickup: g.isAuthorizedPickup ?? true });
  return camel(await getRow(t, 'checkin_guardians', churchId, id, 'guardian'), { bools });
}
export async function updateGuardian(t: Transaction, churchId: number, id: number, p: { name?: string; phone?: string | null; relationship?: string; isAuthorizedPickup?: boolean }) {
  await getRow(t, 'checkin_guardians', churchId, id, 'guardian');
  await updateRow(t, 'checkin_guardians', churchId, id, { name: p.name, phone: p.phone, relationship: p.relationship, is_authorized_pickup: p.isAuthorizedPickup });
  return camel(await getRow(t, 'checkin_guardians', churchId, id, 'guardian'), { bools });
}
export async function removeGuardian(t: Transaction, churchId: number, id: number) {
  await getRow(t, 'checkin_guardians', churchId, id, 'guardian');
  await deleteRow(t, 'checkin_guardians', churchId, id);
}

// ---- security trail -------------------------------------------------------------------

type EventType = 'CHECK_IN' | 'CHECK_OUT' | 'DENIED' | 'FLAGGED' | 'OVERRIDE';
async function logEvent(t: Transaction, churchId: number, e: { sessionId: number | null; childId: number; type: EventType; detail?: string }) {
  await insertRow(t, 'checkin_events', churchId, { session_id: e.sessionId, child_id: e.childId, type: e.type, actor_user_id: currentTenantOrNull()?.userId ?? null, detail: e.detail?.slice(0, 400) ?? null, created_at: new Date() }, false);
}

export async function listSecurityEvents(t: Transaction, churchId: number, f: { childId?: number; type?: string; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.childId) { where.push('child_id = ?'); params.push(f.childId); }
  if (f.type) { where.push('type = ?'); params.push(f.type); }
  const after = idCursor(f.cursor);
  if (after) { where.push('id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT * FROM checkin_events WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, f.limit + 1]);
  return idNext(rows.map((r) => camel(r)), f.limit);
}

// ---- sessions -------------------------------------------------------------------------

function sessionDto(row: any) {
  return camel(row, { omit: ['pickup_code_hash'] });
}

export async function checkIn(t: Transaction, churchId: number, userId: number, i: { childId: number; roomId: number; eventId?: number | null; guardianId?: number | null }) {
  const child = await getRow(t, 'checkin_children', churchId, i.childId, 'child');
  if (!(child.is_active === true || child.is_active === 1)) throw new ConflictError('that child is not active');
  const room = await getRow(t, 'checkin_rooms', churchId, i.roomId, 'room');
  if (!(room.is_active === true || room.is_active === 1)) throw new ConflictError('that room is closed');
  await assertRef(t, 'events', churchId, i.eventId, 'eventId');
  if (i.guardianId) {
    const g = await getRow(t, 'checkin_guardians', churchId, i.guardianId, 'guardian');
    if (Number(g.child_id) !== i.childId) throw new BadRequestError('that guardian belongs to another child');
  }
  const age = ageMonths(String(child.date_of_birth instanceof Date ? child.date_of_birth.toISOString() : child.date_of_birth));
  if (age < room.min_age_months || age > room.max_age_months) throw new ConflictError(`${child.first_name} is ${age} months old; ${room.name} takes ${room.min_age_months}-${room.max_age_months} months`);
  if (await selectOne(t, `SELECT id FROM checkin_sessions WHERE church_id = ? AND child_id = ? AND status = 'IN'`, [churchId, i.childId])) throw new ConflictError('that child is already checked in');
  const present = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM checkin_sessions WHERE church_id = ? AND room_id = ? AND status = 'IN'`, [churchId, i.roomId]);
  if (Number(present?.n) >= room.capacity) throw new ConflictError(`${room.name} is full (${room.capacity})`);

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const tag = randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  const id = await insertRow(t, 'checkin_sessions', churchId, { event_id: i.eventId ?? null, room_id: i.roomId, child_id: i.childId, checked_in_by: userId, checked_in_by_guardian_id: i.guardianId ?? null, pickup_code_hash: codeHash(churchId, i.childId, code), security_tag: tag, status: 'IN', checked_in_at: new Date() });
  await logEvent(t, churchId, { sessionId: id, childId: i.childId, type: 'CHECK_IN', detail: `room ${room.name}` });
  const session = sessionDto(await getRow(t, 'checkin_sessions', churchId, id, 'session'));
  // The code is shown once, here. Only its HMAC is stored, so staff cannot look it up later.
  return { ...session, pickupCode: code, child: { id: child.id, firstName: child.first_name, lastName: child.last_name, allergies: child.allergies, medicalNotes: child.medical_notes } };
}

export interface CheckOutInput {
  code?: string;
  guardianId: number;
  overrideReason?: string | null;
}

export async function checkOut(t: Transaction, churchId: number, userId: number, isAdmin: boolean, sessionId: number, i: CheckOutInput) {
  const session = await getRow(t, 'checkin_sessions', churchId, sessionId, 'session');
  if (session.status !== 'IN') throw new ConflictError('that child is already checked out');
  const childId = Number(session.child_id);
  // Denials are written to the audit trail even though the request fails: commit despite the 4xx.
  const refuse = async (message: string, status = 403, flagged = false): Promise<never> => {
    await logEvent(t, churchId, { sessionId, childId, type: 'DENIED', detail: message });
    if (flagged) await logEvent(t, churchId, { sessionId, childId, type: 'FLAGGED', detail: message });
    const tenantTx = currentTenantOrNull()?.tenantTx;
    if (tenantTx) tenantTx.forceCommit = true;
    throw new ApiError(message, status);
  };

  const failed = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM checkin_events WHERE church_id = ? AND session_id = ? AND type = 'DENIED'`, [churchId, sessionId]);
  const locked = Number(failed?.n) >= MAX_CODE_ATTEMPTS;
  const override = Boolean(i.overrideReason);
  if (override && !isAdmin) return refuse('only an administrator can override a pickup check', 403);

  if (locked && !override) return refuse('this pickup is locked after repeated wrong codes; an administrator must verify the guardian in person', 423);

  const expected = Buffer.from(String(session.pickup_code_hash), 'hex');
  const given = Buffer.from(codeHash(churchId, childId, i.code ?? ''), 'hex');
  const codeOk = expected.length === given.length && timingSafeEqual(expected, given);
  if (!codeOk && !override) return refuse('the pickup code does not match', 403);

  const guardian = await selectOne<any>(t, `SELECT * FROM checkin_guardians WHERE church_id = ? AND id = ?`, [churchId, i.guardianId]);
  const belongs = guardian && Number(guardian.child_id) === childId;
  const authorized = belongs && (guardian.is_authorized_pickup === true || guardian.is_authorized_pickup === 1);
  if (!authorized && !override) {
    return refuse(belongs ? `${guardian.name} is not authorised to collect this child` : 'that person is not a registered guardian of this child', 403, true);
  }

  let flagged = false;
  if (session.checked_in_by_guardian_id && authorized && Number(session.checked_in_by_guardian_id) !== i.guardianId) {
    // Legitimate but unusual: someone other than the person who dropped the child off.
    flagged = true;
    await logEvent(t, churchId, { sessionId, childId, type: 'FLAGGED', detail: `collected by ${guardian.name}, not the guardian who checked in` });
  }
  if (override) await logEvent(t, churchId, { sessionId, childId, type: 'OVERRIDE', detail: i.overrideReason! });

  await updateRow(t, 'checkin_sessions', churchId, sessionId, { status: 'OUT', checked_out_at: new Date(), checked_out_by: userId, picked_up_by_guardian_id: authorized ? i.guardianId : null, override_reason: override ? i.overrideReason : null });
  await logEvent(t, churchId, { sessionId, childId, type: 'CHECK_OUT', detail: `collected by ${guardian?.name ?? 'override'}` });
  if (override) await recordAudit(t, churchId, { action: 'checkin.override', entityType: 'checkin_session', entityId: sessionId, actorId: userId, data: { childId: String(childId) } });
  return { ...sessionDto(await getRow(t, 'checkin_sessions', churchId, sessionId, 'session')), flagged };
}

export async function listSessions(t: Transaction, churchId: number, f: { status?: string; roomId?: number; childId?: number; from?: Date; to?: Date; limit: number; cursor?: string }) {
  const where = ['s.church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.status) { where.push('s.status = ?'); params.push(f.status); }
  if (f.roomId) { where.push('s.room_id = ?'); params.push(f.roomId); }
  if (f.childId) { where.push('s.child_id = ?'); params.push(f.childId); }
  if (f.from) { where.push('s.checked_in_at >= ?'); params.push(f.from); }
  if (f.to) { where.push('s.checked_in_at <= ?'); params.push(f.to); }
  const after = idCursor(f.cursor);
  if (after) { where.push('s.id < ?'); params.push(after); }
  const rows = await select<any>(t, `SELECT s.*, c.first_name, c.last_name, c.allergies, c.medical_notes, r.name AS room_name FROM checkin_sessions s JOIN checkin_children c ON c.church_id = s.church_id AND c.id = s.child_id JOIN checkin_rooms r ON r.church_id = s.church_id AND r.id = s.room_id WHERE ${where.join(' AND ')} ORDER BY s.id DESC LIMIT ?`, [...params, f.limit + 1]);
  return idNext(rows.map(sessionDto), f.limit);
}

export async function attendanceCsv(t: Transaction, churchId: number, from: Date, to: Date): Promise<string> {
  const rows = await select<any>(
    t,
    `SELECT s.checked_in_at, s.checked_out_at, s.security_tag, s.override_reason, c.first_name, c.last_name, r.name AS room_name, g.name AS guardian_name,
            (SELECT COUNT(*) FROM checkin_events e WHERE e.church_id = s.church_id AND e.session_id = s.id AND e.type = 'FLAGGED') AS flags
       FROM checkin_sessions s JOIN checkin_children c ON c.church_id = s.church_id AND c.id = s.child_id JOIN checkin_rooms r ON r.church_id = s.church_id AND r.id = s.room_id
       LEFT JOIN checkin_guardians g ON g.church_id = s.church_id AND g.id = s.picked_up_by_guardian_id
      WHERE s.church_id = ? AND s.checked_in_at >= ? AND s.checked_in_at <= ? ORDER BY s.checked_in_at LIMIT 100000`,
    [churchId, from, to]
  );
  return toCsv(['child', 'room', 'checked_in_at', 'checked_out_at', 'collected_by', 'security_tag', 'flags', 'override_reason'], rows.map((r) => [`${r.first_name} ${r.last_name}`, r.room_name, r.checked_in_at, r.checked_out_at, r.guardian_name, r.security_tag, r.flags, r.override_reason]));
}


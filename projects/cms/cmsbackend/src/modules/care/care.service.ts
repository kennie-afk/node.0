import { Transaction } from 'sequelize';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { assertMember, camel, getRow, idCursor, idNext, insertRow, select, updateRow, deleteRow } from '../ops-kit';
import { recordAudit } from '../finance/audit.service';
import type { Role } from '../../auth/permissions';

export interface Viewer {
  churchId: number;
  userId: number;
  role: Role;
}

const NOTE_BOOLS = ['is_confidential', 'follow_up_done'];
const isTrue = (v: unknown) => v === true || v === 1;

/** A confidential note is readable only by the person who wrote it and by an administrator. */
function canReadBody(v: Viewer, row: any): boolean {
  return !isTrue(row.is_confidential) || Number(row.author_user_id) === v.userId || v.role === 'ADMIN';
}

function noteDto(row: any, v: Viewer) {
  const dto = camel(row, { bools: NOTE_BOOLS, days: ['occurred_on', 'follow_up_on'] });
  if (!canReadBody(v, row)) return { ...dto, body: null, redacted: true };
  return { ...dto, redacted: false };
}

/** Every time a confidential body is actually shown to someone, that fact is written to the audit chain. */
async function auditReveals(t: Transaction, v: Viewer, rows: any[]) {
  const shown = rows.filter((r) => isTrue(r.is_confidential) && canReadBody(v, r));
  if (shown.length === 0) return;
  await recordAudit(t, v.churchId, { action: 'care.confidential.read', entityType: 'care_note', entityId: shown.length === 1 ? Number(shown[0].id) : null, actorId: v.userId, data: { noteIds: shown.map((r) => Number(r.id)).slice(0, 50), memberIds: [...new Set(shown.map((r) => Number(r.member_id)))].slice(0, 50) } });
}

export async function createNote(t: Transaction, v: Viewer, i: { memberId: number; kind?: string; body: string; isConfidential?: boolean; occurredOn?: string; followUpOn?: string | null }) {
  await assertMember(t, v.churchId, i.memberId);
  const id = await insertRow(t, 'care_notes', v.churchId, { member_id: i.memberId, author_user_id: v.userId, kind: i.kind ?? 'PASTORAL', body: i.body, is_confidential: i.isConfidential ?? false, occurred_on: i.occurredOn ?? new Date().toISOString().slice(0, 10), follow_up_on: i.followUpOn ?? null, follow_up_done: false });
  return noteDto(await getRow(t, 'care_notes', v.churchId, id, 'note'), v);
}

export async function getNote(t: Transaction, v: Viewer, id: number) {
  const row = await getRow(t, 'care_notes', v.churchId, id, 'note');
  await auditReveals(t, v, [row]);
  return noteDto(row, v);
}

export async function listNotes(t: Transaction, v: Viewer, f: { memberId: number; limit: number; cursor?: string }) {
  await getRow(t, 'members', v.churchId, f.memberId, 'member');
  const after = idCursor(f.cursor);
  const rows = await select<any>(t, `SELECT * FROM care_notes WHERE church_id = ? AND member_id = ? ${after ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, [v.churchId, f.memberId, ...(after ? [after] : []), f.limit + 1]);
  const page = idNext(rows, f.limit);
  await auditReveals(t, v, page.data);
  return { ...page, data: page.data.map((r) => noteDto(r, v)) };
}

export async function updateNote(t: Transaction, v: Viewer, id: number, p: { body?: string; kind?: string; isConfidential?: boolean; followUpOn?: string | null; followUpDone?: boolean }) {
  const row = await getRow(t, 'care_notes', v.churchId, id, 'note');
  if (isTrue(row.is_confidential) && !canReadBody(v, row)) throw new ForbiddenError('this note is confidential to its author');
  // Only the author (or an admin) may change what a note says or whether it is confidential.
  if ((p.body !== undefined || p.isConfidential !== undefined) && Number(row.author_user_id) !== v.userId && v.role !== 'ADMIN') throw new ForbiddenError('only the author can edit a note');
  await updateRow(t, 'care_notes', v.churchId, id, { body: p.body, kind: p.kind, is_confidential: p.isConfidential, follow_up_on: p.followUpOn, follow_up_done: p.followUpDone });
  return noteDto(await getRow(t, 'care_notes', v.churchId, id, 'note'), v);
}

export async function deleteNote(t: Transaction, v: Viewer, id: number) {
  const row = await getRow(t, 'care_notes', v.churchId, id, 'note');
  if (Number(row.author_user_id) !== v.userId && v.role !== 'ADMIN') throw new ForbiddenError('only the author or an administrator can delete a note');
  await deleteRow(t, 'care_notes', v.churchId, id);
  await recordAudit(t, v.churchId, { action: 'care.note.delete', entityType: 'care_note', entityId: id, actorId: v.userId, data: { confidential: isTrue(row.is_confidential) } });
}

// ---- prayer requests ------------------------------------------------------------------

const PR = { bools: ['is_private'] };
export async function createPrayerRequest(t: Transaction, churchId: number, userId: number | null, i: { memberId?: number | null; requesterName?: string | null; body: string; isPrivate?: boolean }) {
  await assertMember(t, churchId, i.memberId);
  const id = await insertRow(t, 'prayer_requests', churchId, { member_id: i.memberId ?? null, requester_name: i.requesterName ?? null, body: i.body, is_private: i.isPrivate ?? false, status: 'OPEN', submitted_by_user_id: userId });
  return camel(await getRow(t, 'prayer_requests', churchId, id, 'prayer request'), PR);
}
export async function listPrayerRequests(t: Transaction, churchId: number, f: { status?: string; limit: number; cursor?: string }) {
  const after = idCursor(f.cursor);
  const rows = await select<any>(t, `SELECT * FROM prayer_requests WHERE church_id = ? ${f.status ? 'AND status = ?' : ''} ${after ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, [churchId, ...(f.status ? [f.status] : []), ...(after ? [after] : []), f.limit + 1]);
  return idNext(rows.map((r) => camel(r, PR)), f.limit);
}
export async function updatePrayerRequest(t: Transaction, churchId: number, id: number, p: { status?: string; answeredNote?: string | null }) {
  await getRow(t, 'prayer_requests', churchId, id, 'prayer request');
  await updateRow(t, 'prayer_requests', churchId, id, { status: p.status, answered_note: p.answeredNote });
  return camel(await getRow(t, 'prayer_requests', churchId, id, 'prayer request'), PR);
}

// ---- visitations ----------------------------------------------------------------------

const VIS = { bools: ['follow_up_done'], days: ['visit_date', 'follow_up_on'] };
export async function logVisitation(t: Transaction, v: Viewer, i: { memberId: number; visitDate?: string; kind?: string; summary: string; followUpOn?: string | null }) {
  await assertMember(t, v.churchId, i.memberId);
  const id = await insertRow(t, 'visitations', v.churchId, { member_id: i.memberId, visitor_user_id: v.userId, visit_date: i.visitDate ?? new Date().toISOString().slice(0, 10), kind: i.kind ?? 'HOME', summary: i.summary, follow_up_on: i.followUpOn ?? null, follow_up_done: false });
  return camel(await getRow(t, 'visitations', v.churchId, id, 'visitation'), VIS);
}
export async function listVisitations(t: Transaction, churchId: number, f: { memberId: number; limit: number; cursor?: string }) {
  const after = idCursor(f.cursor);
  const rows = await select<any>(t, `SELECT * FROM visitations WHERE church_id = ? AND member_id = ? ${after ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`, [churchId, f.memberId, ...(after ? [after] : []), f.limit + 1]);
  return idNext(rows.map((r) => camel(r, VIS)), f.limit);
}
export async function completeVisitationFollowUp(t: Transaction, churchId: number, id: number) {
  const row = await getRow(t, 'visitations', churchId, id, 'visitation');
  if (!row) throw new NotFoundError('visitation not found');
  await updateRow(t, 'visitations', churchId, id, { follow_up_done: true });
  return camel(await getRow(t, 'visitations', churchId, id, 'visitation'), VIS);
}

/** What is due for follow-up in the next `within` days (including overdue). Confidential notes are listed without their text. */
export async function followUps(t: Transaction, v: Viewer, within: number) {
  const until = new Date();
  until.setUTCDate(until.getUTCDate() + within);
  const day = until.toISOString().slice(0, 10);
  const notes = await select<any>(t, `SELECT n.*, m.first_name, m.last_name FROM care_notes n JOIN members m ON m.church_id = n.church_id AND m.id = n.member_id WHERE n.church_id = ? AND n.follow_up_done = ? AND n.follow_up_on IS NOT NULL AND n.follow_up_on <= ? ORDER BY n.follow_up_on LIMIT 300`, [v.churchId, false, day]);
  const visits = await select<any>(t, `SELECT n.*, m.first_name, m.last_name FROM visitations n JOIN members m ON m.church_id = n.church_id AND m.id = n.member_id WHERE n.church_id = ? AND n.follow_up_done = ? AND n.follow_up_on IS NOT NULL AND n.follow_up_on <= ? ORDER BY n.follow_up_on LIMIT 300`, [v.churchId, false, day]);
  return {
    notes: notes.map((r) => ({ id: Number(r.id), memberId: Number(r.member_id), member: `${r.first_name} ${r.last_name}`, kind: r.kind, followUpOn: camel(r, { days: ['follow_up_on'] }).followUpOn, confidential: isTrue(r.is_confidential) })),
    visitations: visits.map((r) => ({ id: Number(r.id), memberId: Number(r.member_id), member: `${r.first_name} ${r.last_name}`, kind: r.kind, followUpOn: camel(r, VIS).followUpOn }))
  };
}

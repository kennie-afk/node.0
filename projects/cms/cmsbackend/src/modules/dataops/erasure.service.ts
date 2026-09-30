/**
 * Erasure under the Kenya Data Protection Act (right to erasure), balanced against the duty to
 * keep financial records. A member who appears on ledger lines or giving records is anonymised:
 * every identifier is scrubbed but the money stays, attributed to "Erased Member #id". A member
 * with no financial footprint is deleted outright, and if some dependent record still blocks the
 * delete the member is anonymised instead. Nothing here ever edits the ledger.
 */
import { Transaction } from 'sequelize';
import db from '@models';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { camel, getRow, insertRow, select, selectOne, tableExists, updateRow } from '../ops-kit';
import { recordAudit } from '../finance/audit.service';
import { recordConsent } from './consent.service';

export async function financialFootprint(t: Transaction, churchId: number, memberId: number): Promise<string | null> {
  if (await tableExists(t, 'journal_lines')) {
    const line = await selectOne(t, `SELECT 1 AS x FROM journal_lines WHERE church_id = ? AND member_id = ? LIMIT 1`, [churchId, memberId]);
    if (line) return 'the member appears on ledger lines, which must be retained';
  }
  if (await tableExists(t, 'contribution')) {
    const gift = await selectOne(t, `SELECT 1 AS x FROM contribution WHERE church_id = ? AND member_id = ? LIMIT 1`, [churchId, memberId]);
    if (gift) return 'the member has giving records, which must be retained';
  }
  return null;
}

export async function requestErasure(t: Transaction, churchId: number, userId: number, memberId: number, reason: string) {
  await getRow(t, 'members', churchId, memberId, 'member');
  const open = await selectOne(t, `SELECT id FROM erasure_requests WHERE church_id = ? AND member_id = ? AND status = 'PENDING'`, [churchId, memberId]);
  if (open) throw new ConflictError('an erasure request for this member is already pending');
  const id = await insertRow(t, 'erasure_requests', churchId, { member_id: memberId, requested_by: userId, reason, status: 'PENDING' });
  await recordAudit(t, churchId, { action: 'erasure.requested', entityType: 'member', entityId: memberId, actorId: userId, data: { requestId: id } });
  return getErasure(t, churchId, id);
}

export async function getErasure(t: Transaction, churchId: number, id: number) {
  return camel(await getRow(t, 'erasure_requests', churchId, id, 'erasure request'));
}

export async function listErasures(t: Transaction, churchId: number) {
  return (await select<any>(t, `SELECT * FROM erasure_requests WHERE church_id = ? ORDER BY id DESC LIMIT 200`, [churchId])).map((r) => camel(r));
}

async function anonymise(t: Transaction, churchId: number, memberId: number): Promise<void> {
  await updateRow(t, 'members', churchId, memberId, {
    first_name: 'Erased', last_name: `Member ${memberId}`, middle_name: null, email: null, phone_number: null, address: null, city: null,
    county: null, postal_code: null, date_of_birth: null, profile_picture_url: null, notes: null, status: 'Inactive'
  });
  await select(t, `UPDATE users SET member_id = NULL WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
  if (await tableExists(t, 'care_notes')) {
    await select(t, `DELETE FROM care_notes WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
    await select(t, `DELETE FROM visitations WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
    await select(t, `UPDATE prayer_requests SET member_id = NULL, requester_name = NULL, body = '[erased]' WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
  }
  if (await tableExists(t, 'outbox_messages')) {
    await select(t, `UPDATE outbox_messages SET to_address = '[erased]', body = '[erased]', subject = NULL WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
  }
  if (await tableExists(t, 'checkin_children')) {
    await select(t, `UPDATE checkin_children SET member_id = NULL WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
    await select(t, `UPDATE checkin_guardians SET member_id = NULL, name = 'Erased guardian', phone = NULL WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
  }
  await select(t, `DELETE FROM ministry_members WHERE church_id = ? AND member_id = ? RETURNING 1 AS x`, [churchId, memberId]);
  await select(t, `DELETE FROM small_group_members WHERE church_id = ? AND member_id = ? RETURNING 1 AS x`, [churchId, memberId]);
  await recordConsent(t, churchId, { memberId, purpose: 'DATA_PROCESSING', channel: 'ANY', granted: false, source: 'ERASURE', notes: 'erasure executed' });
}

async function tryDelete(t: Transaction, churchId: number, memberId: number): Promise<boolean> {
  try {
    // A savepoint: if a dependent row blocks the delete, only this attempt is rolled back.
    await db.sequelize.transaction(async (sp: Transaction) => {
      for (const table of ['small_group_members', 'ministry_members', 'attendance']) {
        if (await tableExists(sp, table)) await select(sp, `DELETE FROM ${table} WHERE church_id = ? AND member_id = ? RETURNING 1 AS x`, [churchId, memberId]);
      }
      await select(sp, `UPDATE users SET member_id = NULL WHERE church_id = ? AND member_id = ? RETURNING id`, [churchId, memberId]);
      await select(sp, `DELETE FROM members WHERE church_id = ? AND id = ? RETURNING id`, [churchId, memberId]);
    });
    return true;
  } catch {
    return false;
  }
}

export async function executeErasure(t: Transaction, churchId: number, userId: number, requestId: number) {
  const request = await getRow(t, 'erasure_requests', churchId, requestId, 'erasure request');
  if (request.status !== 'PENDING') throw new ConflictError(`request ${requestId} is already ${String(request.status).toLowerCase()}`);
  const memberId = Number(request.member_id);
  const hold = await financialFootprint(t, churchId, memberId);
  let outcome: 'ANONYMISED' | 'DELETED' = 'ANONYMISED';
  if (hold) {
    await anonymise(t, churchId, memberId);
  } else if (await tryDelete(t, churchId, memberId)) {
    outcome = 'DELETED';
  } else {
    await anonymise(t, churchId, memberId);
  }
  await updateRow(t, 'erasure_requests', churchId, requestId, { status: 'COMPLETED', outcome, legal_hold_reason: hold, decided_by: userId, decided_at: new Date() });
  await recordAudit(t, churchId, { action: 'erasure.executed', entityType: 'member', entityId: memberId, actorId: userId, data: { requestId, outcome, legalHold: Boolean(hold) } });
  return getErasure(t, churchId, requestId);
}

export async function refuseErasure(t: Transaction, churchId: number, userId: number, requestId: number, reason: string) {
  const request = await getRow(t, 'erasure_requests', churchId, requestId, 'erasure request');
  if (request.status !== 'PENDING') throw new ConflictError(`request ${requestId} is already ${String(request.status).toLowerCase()}`);
  if (!reason.trim()) throw new BadRequestError('a refusal needs a reason');
  await updateRow(t, 'erasure_requests', churchId, requestId, { status: 'REFUSED', outcome: 'REFUSED', legal_hold_reason: reason, decided_by: userId, decided_at: new Date() });
  await recordAudit(t, churchId, { action: 'erasure.refused', entityType: 'member', entityId: Number(request.member_id), actorId: userId, data: { requestId } });
  return getErasure(t, churchId, requestId);
}

/** Everything held about one member: the data-subject access bundle. */
export async function dataSubjectExport(t: Transaction, churchId: number, userId: number, memberId: number) {
  const member = await getRow(t, 'members', churchId, memberId, 'member');
  const bundle: Record<string, unknown> = { generatedAt: new Date().toISOString(), member: camel(member) };
  const grab = async (key: string, table: string, sql: string, params: unknown[]) => {
    if (await tableExists(t, table)) bundle[key] = (await select<any>(t, sql, params)).map((r) => camel(r, { omit: ['church_id'] }));
  };
  if (member.family_id) bundle.family = camel((await selectOne<any>(t, `SELECT * FROM families WHERE church_id = ? AND id = ?`, [churchId, member.family_id])) ?? {});
  await grab('ministries', 'ministry_members', `SELECT mm.*, m.name AS ministry_name FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id AND m.church_id = mm.church_id WHERE mm.church_id = ? AND mm.member_id = ?`, [churchId, memberId]);
  await grab('smallGroups', 'small_group_members', `SELECT * FROM small_group_members WHERE church_id = ? AND member_id = ?`, [churchId, memberId]);
  await grab('attendance', 'attendance', `SELECT * FROM attendance WHERE church_id = ? AND member_id = ? ORDER BY id DESC LIMIT 5000`, [churchId, memberId]);
  await grab('giving', 'contribution', `SELECT * FROM contribution WHERE church_id = ? AND member_id = ? ORDER BY id DESC LIMIT 5000`, [churchId, memberId]);
  await grab('ledgerLines', 'journal_lines', `SELECT entry_id, entry_date, account_id, fund_id, debit_minor, credit_minor, memo FROM journal_lines WHERE church_id = ? AND member_id = ? ORDER BY entry_date DESC LIMIT 5000`, [churchId, memberId]);
  await grab('consents', 'consent_records', `SELECT * FROM consent_records WHERE church_id = ? AND member_id = ? ORDER BY id`, [churchId, memberId]);
  await grab('messages', 'outbox_messages', `SELECT channel, to_address, subject, status, created_at FROM outbox_messages WHERE church_id = ? AND member_id = ? ORDER BY id DESC LIMIT 2000`, [churchId, memberId]);
  await grab('volunteerAssignments', 'roster_assignments', `SELECT * FROM roster_assignments WHERE church_id = ? AND member_id = ?`, [churchId, memberId]);
  await grab('prayerRequests', 'prayer_requests', `SELECT id, body, status, created_at FROM prayer_requests WHERE church_id = ? AND member_id = ? AND is_private = ?`, [churchId, memberId, false]);
  if (await tableExists(t, 'care_notes')) {
    const notes = await select<any>(t, `SELECT id, kind, body, is_confidential, occurred_on FROM care_notes WHERE church_id = ? AND member_id = ?`, [churchId, memberId]);
    // Confidential pastoral notes are withheld from the bundle and only counted; release is a
    // pastoral decision made outside this export.
    bundle.careNotes = notes.filter((n) => !(n.is_confidential === true || n.is_confidential === 1)).map((n) => camel(n, { bools: ['is_confidential'] }));
    bundle.careNotesWithheld = notes.length - (bundle.careNotes as unknown[]).length;
  }
  await recordAudit(t, churchId, { action: 'dsar.export', entityType: 'member', entityId: memberId, actorId: userId, data: {} });
  return bundle;
}

export async function assertMemberExists(t: Transaction, churchId: number, memberId: number) {
  if (!(await selectOne(t, `SELECT id FROM members WHERE church_id = ? AND id = ?`, [churchId, memberId]))) throw new NotFoundError(`member ${memberId} was not found`);
}

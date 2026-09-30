import { Transaction } from 'sequelize';
import { toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';

export type VendorKind = 'VENDOR' | 'STAFF' | 'MEMBER';
const bool = (v: unknown) => v === true || v === 1;

export interface VendorInput {
  kind?: VendorKind;
  name: string;
  kraPin?: string | null;
  phone?: string | null;
  email?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  mpesaNumber?: string | null;
  memberId?: number | null;
  notes?: string | null;
}

export function mapVendor(r: any) {
  return {
    id: toInt(r.id), kind: r.kind as VendorKind, name: r.name as string, kraPin: r.kra_pin, phone: r.phone, email: r.email, bankName: r.bank_name,
    bankAccount: r.bank_account, mpesaNumber: r.mpesa_number, memberId: r.member_id === null ? null : toInt(r.member_id), notes: r.notes, isActive: bool(r.is_active)
  };
}

export async function getVendor(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM vendors WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`vendor ${id} was not found`);
  return mapVendor(row);
}

async function checkMember(t: Transaction, churchId: number, kind: VendorKind, memberId: number | null | undefined) {
  if (memberId) {
    if (kind !== 'MEMBER' && kind !== 'STAFF') throw new BadRequestError('only a member or staff payee can be linked to a member record');
    if (!(await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :memberId`, { churchId, memberId }))) {
      throw new BadRequestError(`member ${memberId} does not exist in this church`);
    }
  }
}

export async function createVendor(t: Transaction, churchId: number, actorId: number, input: VendorInput) {
  const kind = input.kind ?? 'VENDOR';
  await checkMember(t, churchId, kind, input.memberId);
  if (await selectOne(t, `SELECT id FROM vendors WHERE church_id = :churchId AND name = :name`, { churchId, name: input.name })) {
    throw new ConflictError(`a payee called "${input.name}" already exists`);
  }
  await exec(
    t,
    `INSERT INTO vendors (church_id, kind, name, kra_pin, phone, email, bank_name, bank_account, mpesa_number, member_id, notes)
     VALUES (:churchId, :kind, :name, :kraPin, :phone, :email, :bankName, :bankAccount, :mpesaNumber, :memberId, :notes)`,
    { churchId, kind, name: input.name, kraPin: input.kraPin ?? null, phone: input.phone ?? null, email: input.email ?? null, bankName: input.bankName ?? null, bankAccount: input.bankAccount ?? null, mpesaNumber: input.mpesaNumber ?? null, memberId: input.memberId ?? null, notes: input.notes ?? null }
  );
  const row = await selectOne<any>(t, `SELECT * FROM vendors WHERE church_id = :churchId AND name = :name`, { churchId, name: input.name });
  await recordAudit(t, churchId, { action: 'vendor.create', entityType: 'vendor', entityId: toInt(row!.id), actorId, data: { name: input.name, kind } });
  return mapVendor(row);
}

export async function updateVendor(t: Transaction, churchId: number, actorId: number, id: number, changes: Partial<VendorInput> & { isActive?: boolean }) {
  const current = await getVendor(t, churchId, id);
  const next = { ...current, ...Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)) } as typeof current;
  if (changes.name && changes.name !== current.name && (await selectOne(t, `SELECT id FROM vendors WHERE church_id = :churchId AND name = :name AND id <> :id`, { churchId, name: changes.name, id }))) {
    throw new ConflictError(`a payee called "${changes.name}" already exists`);
  }
  await checkMember(t, churchId, next.kind, next.memberId);
  if (changes.isActive === false && current.isActive) {
    const open = await selectOne(t, `SELECT id FROM bills WHERE church_id = :churchId AND vendor_id = :id AND status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_PAID') LIMIT 1`, { churchId, id });
    if (open) throw new ConflictError('the payee still has open bills');
  }
  await exec(
    t,
    `UPDATE vendors SET kind = :kind, name = :name, kra_pin = :kraPin, phone = :phone, email = :email, bank_name = :bankName, bank_account = :bankAccount,
       mpesa_number = :mpesaNumber, member_id = :memberId, notes = :notes, is_active = :isActive, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { kind: next.kind, name: next.name, kraPin: next.kraPin, phone: next.phone, email: next.email, bankName: next.bankName, bankAccount: next.bankAccount, mpesaNumber: next.mpesaNumber, memberId: next.memberId, notes: next.notes, isActive: next.isActive, now: new Date(), churchId, id }
  );
  await recordAudit(t, churchId, { action: 'vendor.update', entityType: 'vendor', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  return getVendor(t, churchId, id);
}

export async function listVendors(t: Transaction, churchId: number, f: { q?: string; kind?: string; active?: boolean; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.q) { where.push('LOWER(name) LIKE ?'); params.push(`%${f.q.toLowerCase().replace(/[%_]/g, '')}%`); }
  if (f.kind) { where.push('kind = ?'); params.push(f.kind); }
  if (f.active !== undefined) { where.push('is_active = ?'); params.push(f.active); }
  const cursor = decodeCursor<{ n: string; id: number }>(f.cursor);
  if (cursor) { where.push('(name > ? OR (name = ? AND id > ?))'); params.push(cursor.n, cursor.n, cursor.id); }
  const rows = await select<any>(t, `SELECT * FROM vendors WHERE ${where.join(' AND ')} ORDER BY name, id LIMIT ?`, [...params, f.limit + 1]);
  return toKeysetPage(rows.map(mapVendor), f.limit, (v) => ({ n: v.name, id: v.id }));
}

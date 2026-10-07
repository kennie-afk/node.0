/**
 * Members (borrowers, for a lender): registration with KYC fields, search with keyset paging, profile with balances.
 * A member number is the account number a person quotes on M-Pesa, so it is short, unique per organisation, and
 * allocated gap-free from a counter.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { Ctx, audit, pickBranch } from '../common/context';
import { normalisePhone } from '../admin/phone';
import { memberBalance } from '../ledger/service';
import { CODES } from '../ledger/chart';
import { likeContains, numberSeq } from '../common/search';

export const memberSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  idNumber: z.string().trim().min(5).max(20).regex(/^[A-Za-z0-9-]+$/, 'an ID or passport number uses letters, digits and dashes only').optional().nullable(),
  phone: z.string().trim().min(6).max(20).optional().nullable(),
  kraPin: z.string().trim().max(20).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gender: z.enum(['female', 'male', 'other']).optional().nullable(),
  employer: z.string().trim().max(160).optional().nullable(),
  occupation: z.string().trim().max(160).optional().nullable(),
  nextOfKin: z.object({ name: z.string().trim().max(160), phone: z.string().trim().max(20).optional(), relationship: z.string().trim().max(60).optional() }).partial().optional(),
  branchId: z.string().uuid().optional().nullable()
});
export type MemberInput = z.infer<typeof memberSchema>;

export interface MemberRow {
  id: string;
  memberNo: string;
  fullName: string;
  idNumber: string | null;
  phone: string | null;
  status: string;
  joinedOn: string;
  branchId: string | null;
}

function toRow(r: Record<string, any>): MemberRow {
  return { id: r.id, memberNo: r.member_no, fullName: r.full_name, idNumber: r.id_number, phone: r.phone, status: r.status, joinedOn: r.joined_on, branchId: r.branch_id };
}

function phoneOrThrow(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normalisePhone(raw);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'that is not a valid phone number');
  }
}

export async function nextNumber(client: PoolClient, orgId: string, name: 'member' | 'loan', prefix: string): Promise<string> {
  const { rows } = await client.query(
    `INSERT INTO org_counters (org_id, name, value) VALUES ($1, $2, 1) ON CONFLICT (org_id, name) DO UPDATE SET value = org_counters.value + 1 RETURNING value`,
    [orgId, name]
  );
  return `${prefix}${String(rows[0].value).padStart(5, '0')}`;
}

export async function createMember(client: PoolClient, ctx: Ctx, input: MemberInput): Promise<MemberRow> {
  const branch = await pickBranch(client, ctx, input.branchId ?? undefined);
  const phone = phoneOrThrow(input.phone);
  if (input.idNumber) {
    const clash = await client.query('SELECT member_no FROM members WHERE id_number = $1', [input.idNumber]);
    if (clash.rows[0]) throw new ConflictError(`That ID number is already registered as ${clash.rows[0].member_no}.`);
  }
  const memberNo = await nextNumber(client, ctx.orgId, 'member', 'M');
  const row = (await client.query(
    `INSERT INTO members (org_id, branch_id, member_no, full_name, id_number, phone, kra_pin, date_of_birth, gender, employer, occupation, next_of_kin, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [ctx.orgId, branch.id, memberNo, input.fullName, input.idNumber ?? null, phone, input.kraPin ?? null, input.dateOfBirth ?? null, input.gender ?? null, input.employer ?? null, input.occupation ?? null, JSON.stringify(input.nextOfKin ?? {}), ctx.userId]
  )).rows[0];
  await audit(client, ctx, 'member.create', 'member', row.id, { memberNo }, branch.id);
  return toRow(row);
}

export interface MemberPage {
  items: MemberRow[];
  nextCursor: string | null;
}

/** Keyset paging on the member number, so page 500 is as cheap as page 1. */
export async function listMembers(client: PoolClient, opts: { search?: string; status?: string; limit: number; after?: string }): Promise<MemberPage> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.search) {
    params.push(likeContains(opts.search));
    const like = `$${params.length}`;
    params.push(opts.search);
    where.push(`(lower(full_name) LIKE ${like} OR lower(member_no) LIKE ${like} OR id_number = $${params.length} OR phone LIKE ${like})`);
  }
  if (opts.after) {
    // page on the numeric sequence: as text 'M100000' sorts before 'M99999'
    params.push(numberSeq(opts.after));
    where.push(`member_seq > $${params.length}`);
  }
  params.push(opts.limit + 1);
  const rows = (await client.query(`SELECT * FROM members ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY member_seq LIMIT $${params.length}`, params)).rows;
  const more = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit).map(toRow);
  return { items, nextCursor: more ? items[items.length - 1]!.memberNo : null };
}

export async function getMemberRow(client: PoolClient, id: string, lock = false): Promise<Record<string, any>> {
  const row = (await client.query(`SELECT * FROM members WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
  if (!row) throw new NotFoundError('That member was not found.');
  return row;
}

export async function memberProfile(client: PoolClient, id: string) {
  const row = await getMemberRow(client, id);
  // one at a time: a pg client runs one query at a time, and overlapping calls on it are deprecated
  const savings = await memberBalance(client, id, CODES.savings);
  const shares = await memberBalance(client, id, CODES.shares);
  const deposits = await memberBalance(client, id, CODES.deposits);
  const owed = await memberBalance(client, id, CODES.loans);
  const loans = (await client.query(`SELECT id, loan_no, status, principal_cents FROM loans WHERE member_id = $1 ORDER BY created_at DESC`, [id])).rows;
  return {
    ...toRow(row),
    kraPin: row.kra_pin,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    employer: row.employer,
    occupation: row.occupation,
    nextOfKin: row.next_of_kin,
    balances: { savingsCents: savings, sharesCents: shares, depositsCents: deposits, loanPrincipalOutstandingCents: owed },
    loans: loans.map((l) => ({ id: l.id, loanNo: l.loan_no, status: l.status, principalCents: Number(l.principal_cents) }))
  };
}

export const memberPatchSchema = memberSchema.partial().extend({ status: z.enum(['active', 'dormant', 'exited']).optional() });

export async function updateMember(client: PoolClient, ctx: Ctx, id: string, patch: z.infer<typeof memberPatchSchema>): Promise<MemberRow> {
  const current = await getMemberRow(client, id, true);
  if (patch.idNumber && patch.idNumber !== current.id_number) {
    const clash = await client.query('SELECT member_no FROM members WHERE id_number = $1 AND id <> $2', [patch.idNumber, id]);
    if (clash.rows[0]) throw new ConflictError(`That ID number is already registered as ${clash.rows[0].member_no}.`);
  }
  if (patch.status === 'exited') {
    const open = await client.query(`SELECT 1 FROM loans WHERE member_id = $1 AND status IN ('applied', 'appraised', 'approved', 'disbursed') LIMIT 1`, [id]);
    if (open.rows[0]) throw new ConflictError('A member with a loan in progress cannot exit. Clear or write off the loan first.');
  }
  const phone = patch.phone === undefined ? undefined : phoneOrThrow(patch.phone);
  const row = (await client.query(
    `UPDATE members SET full_name = COALESCE($2, full_name), id_number = CASE WHEN $3::boolean THEN $4 ELSE id_number END,
            phone = CASE WHEN $5::boolean THEN $6 ELSE phone END, kra_pin = CASE WHEN $7::boolean THEN $8 ELSE kra_pin END,
            date_of_birth = CASE WHEN $9::boolean THEN $10 ELSE date_of_birth END, gender = CASE WHEN $11::boolean THEN $12 ELSE gender END,
            employer = CASE WHEN $13::boolean THEN $14 ELSE employer END, occupation = CASE WHEN $15::boolean THEN $16 ELSE occupation END,
            next_of_kin = COALESCE($17::jsonb, next_of_kin), status = COALESCE($18, status),
            exited_on = CASE WHEN $18 = 'exited' THEN current_date ELSE exited_on END
      WHERE id = $1 RETURNING *`,
    [
      id, patch.fullName ?? null,
      patch.idNumber !== undefined, patch.idNumber ?? null,
      phone !== undefined, phone ?? null,
      patch.kraPin !== undefined, patch.kraPin ?? null,
      patch.dateOfBirth !== undefined, patch.dateOfBirth ?? null,
      patch.gender !== undefined, patch.gender ?? null,
      patch.employer !== undefined, patch.employer ?? null,
      patch.occupation !== undefined, patch.occupation ?? null,
      patch.nextOfKin ? JSON.stringify(patch.nextOfKin) : null, patch.status ?? null
    ]
  )).rows[0];
  await audit(client, ctx, 'member.update', 'member', id, { fields: Object.keys(patch) });
  return toRow(row);
}

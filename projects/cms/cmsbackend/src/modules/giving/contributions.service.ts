/**
 * Contributions: the giving record and its ledger posting move together. A posted contribution
 * is Dr cash/bank/M-Pesa, Cr the giving type's income account, in one fund, with a gapless
 * receipt number; voiding reverses the ledger entry rather than deleting anything.
 */
import { Transaction } from 'sequelize';
import { exec, forUpdate, select, selectOne } from '../finance/sql';
import { nextCounter } from '../finance/chain';
import { accountIdByKey, defaultFundId, loadSettings } from '../finance/setup.service';
import { postEntry, reverseEntry } from '../finance/ledger.service';
import { resolvePeriod } from '../finance/periods.service';
import { recordAudit } from '../finance/audit.service';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { MAX_MINOR, fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { bool, dateOnly, insertReturningId, minorOf, today } from './shared';
import { resolveType } from './types.service';
import { syncPledgeStatus } from './pledges.service';

export interface RecordInput {
  memberId?: number | null;
  contributorName?: string | null;
  amountMinor: number;
  date: string;
  givingTypeId?: number | null;
  typeName?: string | null;
  fundId?: number | null;
  paymentMethod?: string | null;
  transactionId?: string | null;
  notes?: string | null;
  depositAccountId?: number | null;
  pledgeId?: number | null;
  campaignId?: number | null;
  source?: string;
  isAnonymous?: boolean;
  taxDeductible?: boolean | null;
  batchId?: number | null;
  status?: 'POSTED' | 'PENDING';
  /** Ledger date when it must differ from the gift date (its period has since closed). */
  ledgerDate?: string;
  /** Replaces the default Dr deposit / Cr income posting (used when allocating a suspense receipt). */
  customPost?: (ctx: { contributionId: number; receiptNo: string; fundId: number; incomeAccountId: number; memo: string }) => Promise<number>;
}

const METHOD_ACCOUNT: Array<[RegExp, string]> = [
  [/m-?pesa|mpesa|mobile/i, 'MPESA'],
  [/bank|cheque|check|eft|rtgs|transfer|card/i, 'BANK_MAIN']
];

export async function depositAccountFor(t: Transaction, churchId: number, method: string | null | undefined, explicit?: number | null): Promise<number> {
  if (explicit) {
    const row = await selectOne<any>(t, `SELECT type, is_postable, is_active FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id: explicit });
    if (!row || row.type !== 'ASSET' || !bool(row.is_postable) || !bool(row.is_active)) {
      throw new BadRequestError('depositAccountId must be an active, postable asset account in this church');
    }
    return explicit;
  }
  const key = METHOD_ACCOUNT.find(([pattern]) => method && pattern.test(method))?.[1] ?? 'CASH';
  return accountIdByKey(t, churchId, key);
}

export async function allocateReceiptNo(t: Transaction, churchId: number): Promise<string> {
  const settings = await loadSettings(t, churchId);
  const n = await nextCounter(t, churchId, 'receipt');
  return `${settings.receiptPrefix}-${String(n).padStart(6, '0')}`;
}

export function normaliseDate(value: string): string {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new BadRequestError('date must be a valid date (YYYY-MM-DD or an ISO timestamp)');
  }
  return day;
}

export async function recordContribution(t: Transaction, churchId: number, actorId: number | null, input: RecordInput): Promise<ContributionDto> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > MAX_MINOR) {
    throw new BadRequestError('amount must be greater than zero');
  }
  const date = normaliseDate(input.date);
  const type = await resolveType(t, churchId, { givingTypeId: input.givingTypeId, name: input.typeName });
  const fundId = input.fundId ?? type.defaultFundId ?? (await defaultFundId(t, churchId));
  const fund = await selectOne(t, `SELECT id FROM funds WHERE church_id = :churchId AND id = :fundId`, { churchId, fundId });
  if (!fund) throw new BadRequestError('fundId does not refer to a fund in this church');

  let memberId = input.memberId ?? null;
  let campaignId = input.campaignId ?? null;
  if (input.pledgeId) {
    const pledge = await selectOne<any>(t, `SELECT member_id, campaign_id, status FROM pledges WHERE church_id = :churchId AND id = :id`, { churchId, id: input.pledgeId });
    if (!pledge) throw new BadRequestError('pledgeId does not refer to a pledge in this church');
    if (pledge.status === 'CANCELLED') throw new BadRequestError('that pledge has been cancelled');
    memberId = memberId ?? toInt(pledge.member_id);
    if (toInt(pledge.member_id) !== memberId) throw new BadRequestError('the pledge belongs to a different member');
    campaignId = campaignId ?? (pledge.campaign_id === null ? null : toInt(pledge.campaign_id));
  }
  if (memberId) {
    const member = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: memberId });
    if (!member) throw new BadRequestError('memberId does not refer to a member in this church');
  }
  if (campaignId) {
    const campaign = await selectOne(t, `SELECT id FROM giving_campaigns WHERE church_id = :churchId AND id = :id`, { churchId, id: campaignId });
    if (!campaign) throw new BadRequestError('campaignId does not refer to a campaign in this church');
  }
  const depositAccountId = await depositAccountFor(t, churchId, input.paymentMethod, input.depositAccountId);
  const status = input.status ?? 'POSTED';
  const now = new Date();

  const contributionId = await insertReturningId(
    t,
    `INSERT INTO contribution
       (church_id, member_id, contributor_name, amount, contribution_date, contribution_type, payment_method, transaction_id, notes,
        fund_id, giving_type_id, deposit_account_id, batch_id, pledge_id, campaign_id, source, is_anonymous, tax_deductible, status, recorded_by, created_at, updated_at)
     VALUES (:churchId, :memberId, :name, :amount, :date, :type, :method, :transactionId, :notes,
        :fundId, :typeId, :deposit, :batchId, :pledgeId, :campaignId, :source, :anonymous, :deductible, :status, :actor, :now, :now)`,
    {
      churchId,
      memberId,
      name: input.contributorName ?? null,
      amount: fromMinor(input.amountMinor),
      date,
      type: type.name,
      method: input.paymentMethod ?? null,
      transactionId: input.transactionId ?? null,
      notes: input.notes ?? null,
      fundId,
      typeId: type.id,
      deposit: depositAccountId,
      batchId: input.batchId ?? null,
      pledgeId: input.pledgeId ?? null,
      campaignId,
      source: input.source ?? 'MANUAL',
      anonymous: input.isAnonymous ?? false,
      deductible: input.taxDeductible ?? type.taxDeductible,
      status,
      actor: actorId,
      now
    }
  );

  if (status === 'POSTED') {
    const receiptNo = await allocateReceiptNo(t, churchId);
    const memo = await describe(t, churchId, receiptNo, type.name, memberId, input.contributorName);
    let entryId: number;
    if (input.customPost) {
      entryId = await input.customPost({ contributionId, receiptNo, fundId, incomeAccountId: type.incomeAccountId, memo });
    } else {
      const posted = await postEntry(
        {
          entryDate: input.ledgerDate ?? date,
          memo,
          sourceType: 'CONTRIBUTION',
          sourceId: contributionId,
          actorId,
          lines: [
            { accountId: depositAccountId, fundId, debit: input.amountMinor, memberId },
            { accountId: type.incomeAccountId, fundId, credit: input.amountMinor, memberId }
          ]
        },
        t,
        churchId
      );
      entryId = posted.id;
    }
    await exec(t, `UPDATE contribution SET receipt_no = :receiptNo, journal_entry_id = :entryId WHERE church_id = :churchId AND id = :id`, {
      receiptNo,
      entryId,
      churchId,
      id: contributionId
    });
    if (input.pledgeId) await syncPledgeStatus(t, churchId, input.pledgeId);
  }
  return getContribution(t, churchId, contributionId);
}

async function describe(t: Transaction, churchId: number, receiptNo: string, typeName: string, memberId: number | null, name?: string | null): Promise<string> {
  let who = name ?? '';
  if (memberId) {
    const m = await selectOne<any>(t, `SELECT first_name, last_name FROM members WHERE church_id = :churchId AND id = :memberId`, { churchId, memberId });
    if (m) who = `${m.first_name} ${m.last_name}`;
  }
  return `${receiptNo} ${typeName}${who ? ` - ${who}` : ''}`.slice(0, 500);
}

// ---- reading ------------------------------------------------------------------------------

const SELECT_JOINED = `
  SELECT c.*, m.first_name AS m_first, m.last_name AS m_last, m.email AS m_email, m.phone_number AS m_phone,
         gt.code AS type_code, f.code AS fund_code, f.name AS fund_name
    FROM contribution c
    LEFT JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id
    LEFT JOIN giving_types gt ON gt.church_id = c.church_id AND gt.id = c.giving_type_id
    LEFT JOIN funds f ON f.church_id = c.church_id AND f.id = c.fund_id`;

export interface ContributionDto {
  id: number;
  memberId: number | null;
  member: { id: number; firstName: string; lastName: string; email: string | null; phoneNumber: string | null } | null;
  contributorName: string | null;
  amount: string;
  amountMinor: number;
  date: string;
  contributionType: string;
  givingTypeId: number | null;
  fundId: number | null;
  fundCode: string | null;
  fundName: string | null;
  paymentMethod: string | null;
  transactionId: string | null;
  notes: string | null;
  receiptNo: string | null;
  status: string;
  voidReason: string | null;
  journalEntryId: number | null;
  depositAccountId: number | null;
  batchId: number | null;
  pledgeId: number | null;
  campaignId: number | null;
  source: string;
  isAnonymous: boolean;
  taxDeductible: boolean;
  createdAt: string;
}

function dto(row: any): ContributionDto {
  const minor = minorOf(row.amount);
  const nullableInt = (v: unknown) => (v === null || v === undefined ? null : toInt(v));
  return {
    id: toInt(row.id),
    memberId: nullableInt(row.member_id),
    member: row.member_id === null ? null : { id: toInt(row.member_id), firstName: row.m_first, lastName: row.m_last, email: row.m_email, phoneNumber: row.m_phone },
    contributorName: row.contributor_name,
    amount: fromMinor(minor),
    amountMinor: minor,
    date: dateOnly(row.contribution_date),
    contributionType: row.contribution_type,
    givingTypeId: nullableInt(row.giving_type_id),
    fundId: nullableInt(row.fund_id),
    fundCode: row.fund_code ?? null,
    fundName: row.fund_name ?? null,
    paymentMethod: row.payment_method,
    transactionId: row.transaction_id,
    notes: row.notes,
    receiptNo: row.receipt_no,
    status: row.status,
    voidReason: row.void_reason,
    journalEntryId: nullableInt(row.journal_entry_id),
    depositAccountId: nullableInt(row.deposit_account_id),
    batchId: nullableInt(row.batch_id),
    pledgeId: nullableInt(row.pledge_id),
    campaignId: nullableInt(row.campaign_id),
    source: row.source,
    isAnonymous: bool(row.is_anonymous),
    taxDeductible: bool(row.tax_deductible),
    createdAt: new Date(row.created_at).toISOString()
  };
}

export async function getContribution(t: Transaction, churchId: number, id: number): Promise<ContributionDto> {
  const row = await selectOne<any>(t, `${SELECT_JOINED} WHERE c.church_id = :churchId AND c.id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`Contribution ${id} was not found in this church`);
  return dto(row);
}

export async function findByReceipt(t: Transaction, churchId: number, receiptNo: string): Promise<ContributionDto> {
  const row = await selectOne<any>(t, `${SELECT_JOINED} WHERE c.church_id = :churchId AND c.receipt_no = :receiptNo`, { churchId, receiptNo });
  if (!row) throw new NotFoundError(`receipt ${receiptNo} was not found`);
  return dto(row);
}

export interface ContributionFilter {
  memberId?: number;
  type?: string;
  fundId?: number;
  status?: string;
  batchId?: number;
  pledgeId?: number;
  campaignId?: number;
  source?: string;
  from?: string;
  to?: string;
  q?: string;
}

function whereFor(churchId: number, f: ContributionFilter): { clauses: string[]; params: unknown[] } {
  const clauses = ['c.church_id = ?'];
  const params: unknown[] = [churchId];
  const eq = (column: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  };
  eq('c.member_id', f.memberId);
  eq('c.fund_id', f.fundId);
  eq('c.status', f.status);
  eq('c.batch_id', f.batchId);
  eq('c.pledge_id', f.pledgeId);
  eq('c.campaign_id', f.campaignId);
  eq('c.source', f.source);
  if (f.type) {
    clauses.push('LOWER(c.contribution_type) = ?');
    params.push(f.type.toLowerCase());
  }
  if (f.from) {
    clauses.push('c.contribution_date >= ?');
    params.push(f.from);
  }
  if (f.to) {
    clauses.push('c.contribution_date <= ?');
    params.push(f.to);
  }
  if (f.q) {
    const like = `%${f.q.toLowerCase().replace(/[%_]/g, '')}%`;
    clauses.push(`(LOWER(c.contributor_name) LIKE ? OR LOWER(c.receipt_no) LIKE ? OR LOWER(c.transaction_id) LIKE ? OR LOWER(m.first_name || ' ' || m.last_name) LIKE ?)`);
    params.push(like, like, like, like);
  }
  return { clauses, params };
}

/** Keyset, newest first on (date, id). */
export async function listContributionsKeyset(t: Transaction, churchId: number, filter: ContributionFilter, limit: number, cursor?: string) {
  const { clauses, params } = whereFor(churchId, filter);
  const c = decodeCursor<{ d: string; id: number }>(cursor);
  if (c) {
    clauses.push('(c.contribution_date < ? OR (c.contribution_date = ? AND c.id < ?))');
    params.push(c.d, c.d, c.id);
  }
  const rows = await select<any>(t, `${SELECT_JOINED} WHERE ${clauses.join(' AND ')} ORDER BY c.contribution_date DESC, c.id DESC LIMIT ?`, [...params, limit + 1]);
  return toKeysetPage(rows.map(dto), limit, (r) => ({ d: r.date, id: r.id }));
}

/** Offset paging kept for the existing console; the same filters, plus a total. */
export async function listContributionsPaged(t: Transaction, churchId: number, filter: ContributionFilter, page: number, pageSize: number) {
  const { clauses, params } = whereFor(churchId, filter);
  const where = clauses.join(' AND ');
  const totalRow = await selectOne<any>(
    t,
    `SELECT COUNT(*) AS n FROM contribution c LEFT JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id WHERE ${where}`,
    params
  );
  const rows = await select<any>(t, `${SELECT_JOINED} WHERE ${where} ORDER BY c.contribution_date DESC, c.id ASC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
  const total = toInt(totalRow?.n);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  return { data: rows.map(dto), page, pageSize, total, totalPages, hasNext: page < totalPages, hasPrevious: page > 1 };
}

// ---- change -------------------------------------------------------------------------------

export interface ContributionChanges {
  memberId?: number | null;
  amountMinor?: number;
  date?: string;
  contributionType?: string;
  contributorName?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

/**
 * Once a gift is in the ledger its money facts are frozen; correct a mistake by voiding and
 * re-entering. Descriptive fields may still be edited, and a pending (uncounted) gift is free to change.
 */
export async function updateContribution(t: Transaction, churchId: number, actorId: number, id: number, changes: ContributionChanges): Promise<ContributionDto> {
  const current = await getContribution(t, churchId, id);
  if (current.status === 'VOID') throw new ConflictError('a voided contribution cannot be changed');
  const financial = changes.memberId !== undefined || changes.amountMinor !== undefined || changes.date !== undefined || changes.contributionType !== undefined;
  if (current.status === 'POSTED' && financial && current.journalEntryId) {
    throw new ConflictError('this gift is already in the ledger; void it and record it again to change the member, amount, date or type');
  }
  const set: string[] = [];
  const params: Record<string, unknown> = { churchId, id, now: new Date() };
  const add = (column: string, key: string, value: unknown) => {
    set.push(`${column} = :${key}`);
    params[key] = value;
  };
  if (changes.contributorName !== undefined) add('contributor_name', 'name', changes.contributorName);
  if (changes.paymentMethod !== undefined) add('payment_method', 'method', changes.paymentMethod);
  if (changes.notes !== undefined) add('notes', 'notes', changes.notes);
  if (changes.memberId !== undefined) {
    if (changes.memberId !== null) {
      const m = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :mid`, { churchId, mid: changes.memberId });
      if (!m) throw new BadRequestError('memberId does not refer to a member in this church');
    }
    add('member_id', 'memberId', changes.memberId);
  }
  if (changes.amountMinor !== undefined) add('amount', 'amount', fromMinor(changes.amountMinor));
  if (changes.date !== undefined) add('contribution_date', 'date', normaliseDate(changes.date));
  if (changes.contributionType !== undefined) {
    const type = await resolveType(t, churchId, { name: changes.contributionType });
    add('contribution_type', 'type', type.name);
    add('giving_type_id', 'typeId', type.id);
  }
  if (set.length > 0) {
    await exec(t, `UPDATE contribution SET ${set.join(', ')}, updated_at = :now WHERE church_id = :churchId AND id = :id`, params);
  }
  return getContribution(t, churchId, id);
}

export async function deleteContribution(t: Transaction, churchId: number, id: number): Promise<void> {
  const current = await getContribution(t, churchId, id);
  if (current.status === 'PENDING') {
    await exec(t, `DELETE FROM contribution WHERE church_id = :churchId AND id = :id`, { churchId, id });
    return;
  }
  throw new ConflictError('a recorded gift cannot be deleted; void it instead so the receipt trail stays intact');
}

export async function voidContribution(t: Transaction, churchId: number, actorId: number, id: number, reason: string): Promise<ContributionDto> {
  const row = await selectOne<any>(t, `SELECT * FROM contribution WHERE church_id = :churchId AND id = :id ${forUpdate()}`, { churchId, id });
  if (!row) throw new NotFoundError(`Contribution ${id} was not found in this church`);
  if (row.status === 'VOID') throw new ConflictError('that contribution is already void');
  const amountMinor = minorOf(row.amount);
  const originalDate = dateOnly(row.contribution_date);

  if (row.status === 'POSTED' && row.journal_entry_id) {
    const entry = await selectOne<any>(t, `SELECT source_type, reversed_by_entry_id FROM journal_entries WHERE church_id = :churchId AND id = :id`, { churchId, id: toInt(row.journal_entry_id) });
    const period = await resolvePeriod(t, churchId, originalDate);
    const date = period.status === 'OPEN' ? originalDate : today();
    if (entry?.source_type === 'CONTRIBUTION') {
      await reverseEntry(t, churchId, toInt(row.journal_entry_id), { reason: `void ${row.receipt_no}: ${reason}`, date, actorId, allowSourced: true });
    } else {
      // The entry belongs to a whole batch (or a suspense allocation); reverse only this gift's share.
      const fundId = toInt(row.fund_id);
      const type = await selectOne<any>(t, `SELECT income_account_id FROM giving_types WHERE church_id = :churchId AND id = :id`, { churchId, id: toInt(row.giving_type_id) });
      await postEntry(
        {
          entryDate: date,
          memo: `Void ${row.receipt_no}: ${reason}`.slice(0, 500),
          sourceType: 'CONTRIBUTION_VOID',
          sourceId: id,
          actorId,
          lines: [
            { accountId: toInt(type!.income_account_id), fundId, debit: amountMinor, memberId: row.member_id === null ? null : toInt(row.member_id) },
            { accountId: toInt(row.deposit_account_id), fundId, credit: amountMinor, memberId: row.member_id === null ? null : toInt(row.member_id) }
          ]
        },
        t,
        churchId
      );
    }
  }
  await exec(t, `UPDATE contribution SET status = 'VOID', void_reason = :reason, voided_at = :now, voided_by = :actor, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    reason,
    now: new Date(),
    actor: actorId,
    churchId,
    id
  });
  await recordAudit(t, churchId, { action: 'contribution.void', entityType: 'contribution', entityId: id, actorId, data: { receiptNo: row.receipt_no ?? '', reason, amount: fromMinor(amountMinor) } });
  if (row.pledge_id) await syncPledgeStatus(t, churchId, toInt(row.pledge_id));
  return getContribution(t, churchId, id);
}

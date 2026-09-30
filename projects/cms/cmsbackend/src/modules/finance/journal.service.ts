import { Transaction } from 'sequelize';
import { select, selectOne } from './sql';
import { fromMinor, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { NotFoundError } from '../../utils/errors';
import { dateOnly, iso } from './chain';
import { accountIdByKey } from './setup.service';
import { postEntry, PostedEntry } from './ledger.service';

export interface JournalFilter {
  from?: string;
  to?: string;
  sourceType?: string;
  accountId?: number;
  fundId?: number;
  memberId?: number;
  q?: string;
  limit: number;
  cursor?: string;
}

function mapEntry(row: any) {
  return {
    id: toInt(row.id),
    entryNo: toInt(row.entry_no),
    entryDate: dateOnly(row.entry_date),
    memo: row.memo,
    sourceType: row.source_type,
    sourceId: row.source_id,
    total: fromMinor(row.total_minor),
    totalMinor: toInt(row.total_minor),
    reversesEntryId: row.reverses_entry_id === null ? null : toInt(row.reverses_entry_id),
    reversedByEntryId: row.reversed_by_entry_id === null ? null : toInt(row.reversed_by_entry_id),
    createdBy: row.created_by === null ? null : toInt(row.created_by),
    postedAt: iso(row.posted_at),
    hash: String(row.hash).trim()
  };
}

/** Newest first, by keyset on (entry_date, id). Every filter is applied in the query. */
export async function listJournal(t: Transaction, churchId: number, filter: JournalFilter) {
  const where = ['e.church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.from) {
    where.push('e.entry_date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('e.entry_date <= ?');
    params.push(filter.to);
  }
  if (filter.sourceType) {
    where.push('e.source_type = ?');
    params.push(filter.sourceType);
  }
  if (filter.q) {
    where.push('LOWER(e.memo) LIKE ?');
    params.push(`%${filter.q.toLowerCase().replace(/[%_]/g, '')}%`);
  }
  const lineConditions: string[] = [];
  const lineParams: unknown[] = [];
  if (filter.accountId) {
    lineConditions.push('l.account_id = ?');
    lineParams.push(filter.accountId);
  }
  if (filter.fundId) {
    lineConditions.push('l.fund_id = ?');
    lineParams.push(filter.fundId);
  }
  if (filter.memberId) {
    lineConditions.push('l.member_id = ?');
    lineParams.push(filter.memberId);
  }
  if (lineConditions.length > 0) {
    where.push(`EXISTS (SELECT 1 FROM journal_lines l WHERE l.church_id = e.church_id AND l.entry_id = e.id AND ${lineConditions.join(' AND ')})`);
    params.push(...lineParams);
  }
  const cursor = decodeCursor<{ d: string; id: number }>(filter.cursor);
  if (cursor) {
    where.push('(e.entry_date < ? OR (e.entry_date = ? AND e.id < ?))');
    params.push(cursor.d, cursor.d, cursor.id);
  }
  const rows = await select<any>(
    t,
    `SELECT e.* FROM journal_entries e WHERE ${where.join(' AND ')} ORDER BY e.entry_date DESC, e.id DESC LIMIT ?`,
    [...params, filter.limit + 1]
  );
  return toKeysetPage(rows.map(mapEntry), filter.limit, (entry) => ({ d: entry.entryDate, id: entry.id }));
}

export async function getEntry(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM journal_entries WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`journal entry ${id} was not found`);
  const lines = await select<any>(
    t,
    `SELECT l.*, a.code AS account_code, a.name AS account_name, f.code AS fund_code, f.name AS fund_name
       FROM journal_lines l
       JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id
       JOIN funds f ON f.church_id = l.church_id AND f.id = l.fund_id
      WHERE l.church_id = :churchId AND l.entry_id = :id ORDER BY l.line_no`,
    { churchId, id }
  );
  return {
    ...mapEntry(row),
    lines: lines.map((line) => ({
      lineNo: toInt(line.line_no),
      accountId: toInt(line.account_id),
      accountCode: line.account_code,
      accountName: line.account_name,
      fundId: toInt(line.fund_id),
      fundCode: line.fund_code,
      fundName: line.fund_name,
      debit: fromMinor(line.debit_minor),
      credit: fromMinor(line.credit_minor),
      memberId: line.member_id === null ? null : toInt(line.member_id),
      ministryId: line.ministry_id === null ? null : toInt(line.ministry_id),
      memo: line.memo
    }))
  };
}

/** A running-balance register for one account, oldest first, paged by keyset. */
export async function accountRegister(
  t: Transaction,
  churchId: number,
  accountId: number,
  options: { from?: string; to?: string; fundId?: number; limit: number; cursor?: string }
) {
  const account = await selectOne<any>(t, `SELECT id, code, name, type FROM accounts WHERE church_id = :churchId AND id = :accountId`, { churchId, accountId });
  if (!account) throw new NotFoundError(`account ${accountId} was not found`);
  const where = ['l.church_id = ?', 'l.account_id = ?'];
  const params: unknown[] = [churchId, accountId];
  if (options.fundId) {
    where.push('l.fund_id = ?');
    params.push(options.fundId);
  }
  const range: string[] = [];
  const rangeParams: unknown[] = [];
  if (options.from) {
    range.push('l.entry_date >= ?');
    rangeParams.push(options.from);
  }
  if (options.to) {
    range.push('l.entry_date <= ?');
    rangeParams.push(options.to);
  }
  const cursor = decodeCursor<{ d: string; id: number }>(options.cursor);
  const after: string[] = [];
  const afterParams: unknown[] = [];
  if (cursor) {
    after.push('(l.entry_date > ? OR (l.entry_date = ? AND l.id > ?))');
    afterParams.push(cursor.d, cursor.d, cursor.id);
  }
  const rows = await select<any>(
    t,
    `SELECT l.id, l.entry_id, l.entry_date, l.debit_minor, l.credit_minor, l.fund_id, l.memo AS line_memo, e.entry_no, e.memo
       FROM journal_lines l JOIN journal_entries e ON e.church_id = l.church_id AND e.id = l.entry_id
      WHERE ${[...where, ...range, ...after].join(' AND ')} ORDER BY l.entry_date, l.id LIMIT ?`,
    [...params, ...rangeParams, ...afterParams, options.limit + 1]
  );
  const page = toKeysetPage(rows, options.limit, (row: any) => ({ d: dateOnly(row.entry_date), id: toInt(row.id) }));

  // Balance carried into this page: everything on this account before its first row. The first
  // page starts from the opening balance before `from`.
  let opening = 0;
  const firstRow = page.data[0];
  const before: string[] = [];
  const beforeParams: unknown[] = [];
  if (firstRow) {
    before.push('(l.entry_date < ? OR (l.entry_date = ? AND l.id < ?))');
    beforeParams.push(dateOnly(firstRow.entry_date), dateOnly(firstRow.entry_date), toInt(firstRow.id));
  } else if (options.from) {
    before.push('l.entry_date < ?');
    beforeParams.push(options.from);
  }
  if (before.length > 0) {
    const sums = await selectOne<any>(
      t,
      `SELECT COALESCE(SUM(l.debit_minor), 0) AS d, COALESCE(SUM(l.credit_minor), 0) AS c FROM journal_lines l WHERE ${[...where, ...before].join(' AND ')}`,
      [...params, ...beforeParams]
    );
    opening = toInt(sums?.d) - toInt(sums?.c);
  }
  const debitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';
  let running = opening;
  const data = page.data.map((row: any) => {
    const debit = toInt(row.debit_minor);
    const credit = toInt(row.credit_minor);
    running += debit - credit;
    return {
      lineId: toInt(row.id),
      entryId: toInt(row.entry_id),
      entryNo: toInt(row.entry_no),
      date: dateOnly(row.entry_date),
      memo: row.line_memo || row.memo,
      fundId: toInt(row.fund_id),
      debit: fromMinor(debit),
      credit: fromMinor(credit),
      balance: fromMinor(debitNormal ? running : -running)
    };
  });
  return {
    account: { id: toInt(account.id), code: account.code, name: account.name, type: account.type },
    openingBalance: fromMinor(debitNormal ? opening : -opening),
    data,
    nextCursor: page.nextCursor,
    limit: page.limit
  };
}

export interface TransferInput {
  date: string;
  fromFundId: number;
  toFundId: number;
  amountMinor: number;
  memo: string;
  /** The asset account holding the money; defaults to the main bank account. */
  accountId?: number;
  actorId: number;
  idempotencyKey?: string | null;
}

/**
 * Moves net assets from one fund to another. Cash stays where it is (one account, two fund tags);
 * what changes is which fund it belongs to, recorded against the Interfund Transfers equity
 * account so the transfer is visible on each fund's statement and nets to zero overall.
 */
export async function postTransfer(t: Transaction, churchId: number, input: TransferInput): Promise<PostedEntry> {
  const transfers = await accountIdByKey(t, churchId, 'INTERFUND_TRANSFERS');
  const cash = input.accountId ?? (await accountIdByKey(t, churchId, 'BANK_MAIN'));
  return postEntry(
    {
      entryDate: input.date,
      memo: input.memo,
      sourceType: 'TRANSFER',
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      lines: [
        { accountId: transfers, fundId: input.fromFundId, debit: input.amountMinor, memo: 'Transfer out' },
        { accountId: cash, fundId: input.fromFundId, credit: input.amountMinor },
        { accountId: cash, fundId: input.toFundId, debit: input.amountMinor },
        { accountId: transfers, fundId: input.toFundId, credit: input.amountMinor, memo: 'Transfer in' }
      ]
    },
    t,
    churchId
  );
}

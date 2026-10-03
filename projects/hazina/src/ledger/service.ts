/**
 * The ledger: the only place money moves. Every product feature (a deposit, a disbursement, a repayment, a penalty, a
 * write-off) ends in postEntry, and a manual journal is the same call. The database refuses an unbalanced or
 * incomplete entry and refuses to edit one afterwards (see migration 0003); this module adds the rules a database cannot
 * know: accounts exist and are active, amounts are whole positive cents, and a closed-looking date is a real date.
 */
import { PoolClient } from 'pg';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { AccountType, debitNormal } from './chart';

export interface PostLine {
  accountCode: string;
  debitCents?: number;
  creditCents?: number;
  memberId?: string | null;
  loanId?: string | null;
}

export interface PostInput {
  entryDate: string;
  memo: string;
  sourceType: string;
  sourceId?: string | null;
  postedBy: string | null;
  reverses?: string | null;
  lines: PostLine[];
}

export interface Posted {
  id: string;
  seq: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function postEntry(client: PoolClient, orgId: string, input: PostInput): Promise<Posted> {
  if (!DAY.test(input.entryDate)) throw new BadRequestError('The entry date must be YYYY-MM-DD.');
  if (!input.memo.trim()) throw new BadRequestError('A journal entry needs a memo.');
  if (input.lines.length < 2) throw new BadRequestError('A journal entry needs at least two lines.');

  let debits = 0;
  let credits = 0;
  for (const line of input.lines) {
    const d = line.debitCents ?? 0;
    const c = line.creditCents ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) throw new BadRequestError('Amounts are whole, non-negative cents.');
    if ((d > 0) === (c > 0)) throw new BadRequestError('Each line is either a debit or a credit, not both and not neither.');
    debits += d;
    credits += c;
  }
  if (debits !== credits) throw new BadRequestError(`The entry does not balance: debits ${debits}, credits ${credits}.`);

  const codes = [...new Set(input.lines.map((l) => l.accountCode))];
  const found = await client.query('SELECT id, code, active FROM accounts WHERE code = ANY($1::text[])', [codes]);
  const byCode = new Map<string, { id: string; active: boolean }>(found.rows.map((r) => [r.code as string, { id: r.id as string, active: r.active as boolean }]));
  for (const code of codes) {
    const account = byCode.get(code);
    if (!account) throw new NotFoundError(`There is no account ${code} in this organisation.`);
    if (!account.active) throw new ConflictError(`Account ${code} is switched off.`);
  }

  // The counter row is locked until this transaction ends, so two postings cannot take the same number and a rolled-back
  // posting gives its number back: entry numbers per organisation have no gaps.
  const counter = await client.query(
    `INSERT INTO org_counters (org_id, name, value) VALUES ($1, 'journal', 1)
     ON CONFLICT (org_id, name) DO UPDATE SET value = org_counters.value + 1 RETURNING value`,
    [orgId]
  );
  const seq = Number(counter.rows[0].value);

  const entry = await client.query(
    `INSERT INTO journal_entries (org_id, seq, entry_date, memo, source_type, source_id, line_count, total_cents, posted_by, reverses)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [orgId, seq, input.entryDate, input.memo.trim(), input.sourceType, input.sourceId ?? null, input.lines.length, debits, input.postedBy, input.reverses ?? null]
  );
  const entryId = entry.rows[0].id as string;

  let lineNo = 1;
  for (const line of input.lines) {
    await client.query(
      `INSERT INTO journal_lines (org_id, entry_id, line_no, account_id, member_id, loan_id, debit_cents, credit_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, entryId, lineNo, byCode.get(line.accountCode)!.id, line.memberId ?? null, line.loanId ?? null, line.debitCents ?? 0, line.creditCents ?? 0]
    );
    lineNo += 1;
  }
  return { id: entryId, seq };
}

/** Cancels an entry by posting its mirror image. Only an entry that was not already reversed, and not itself a reversal. */
export async function reverseEntry(client: PoolClient, orgId: string, entryId: string, postedBy: string | null, memo: string, entryDate: string): Promise<Posted> {
  const original = (await client.query('SELECT id, memo, source_type, reverses, seq FROM journal_entries WHERE id = $1', [entryId])).rows[0];
  if (!original) throw new NotFoundError('That journal entry was not found.');
  if (original.reverses) throw new ConflictError('A reversal cannot itself be reversed; post a new entry instead.');
  const lines = (await client.query(
    `SELECT a.code, l.debit_cents, l.credit_cents, l.member_id, l.loan_id FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = $1 ORDER BY l.line_no`,
    [entryId]
  )).rows;
  return postEntry(client, orgId, {
    entryDate,
    memo: `Reversal of entry ${original.seq}: ${memo}`,
    sourceType: 'reversal',
    sourceId: entryId,
    postedBy,
    reverses: entryId,
    lines: lines.map((l) => ({ accountCode: l.code as string, debitCents: Number(l.credit_cents), creditCents: Number(l.debit_cents), memberId: l.member_id, loanId: l.loan_id }))
  });
}

/** Net balance in the account's normal direction (a positive liability balance is money owed). */
export async function accountBalance(client: PoolClient, code: string, asOf?: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT a.type, COALESCE(sum(x.debit_cents), 0)::bigint AS dr, COALESCE(sum(x.credit_cents), 0)::bigint AS cr
       FROM accounts a
       LEFT JOIN (SELECT l.account_id, l.debit_cents, l.credit_cents
                    FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
                   WHERE $2::date IS NULL OR e.entry_date <= $2::date) x ON x.account_id = a.id
      WHERE a.code = $1 GROUP BY a.type`,
    [code, asOf ?? null]
  );
  if (!rows[0]) return 0;
  const dr = Number(rows[0].dr);
  const cr = Number(rows[0].cr);
  return debitNormal(rows[0].type as AccountType) ? dr - cr : cr - dr;
}

/** A member's balance in one account: their savings, their shares, what they owe. */
export async function memberBalance(client: PoolClient, memberId: string, code: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT a.type, COALESCE(sum(l.debit_cents), 0)::bigint AS dr, COALESCE(sum(l.credit_cents), 0)::bigint AS cr
       FROM accounts a JOIN journal_lines l ON l.account_id = a.id AND l.member_id = $2
      WHERE a.code = $1 GROUP BY a.type`,
    [code, memberId]
  );
  if (!rows[0]) return 0;
  const dr = Number(rows[0].dr);
  const cr = Number(rows[0].cr);
  return debitNormal(rows[0].type as AccountType) ? dr - cr : cr - dr;
}

export interface TrialRow {
  code: string;
  name: string;
  type: AccountType;
  debitCents: number;
  creditCents: number;
}

/** Every account's balance as at a date, shown on its normal side. Debits equal credits, always. */
export async function trialBalance(client: PoolClient, asOf: string): Promise<{ rows: TrialRow[]; totalDebitCents: number; totalCreditCents: number }> {
  const { rows } = await client.query(
    `SELECT a.code, a.name, a.type,
            COALESCE(sum(l.debit_cents) FILTER (WHERE e.id IS NOT NULL), 0)::bigint AS dr,
            COALESCE(sum(l.credit_cents) FILTER (WHERE e.id IS NOT NULL), 0)::bigint AS cr
       FROM accounts a
       LEFT JOIN journal_lines l ON l.account_id = a.id
       LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date <= $1::date
      GROUP BY a.code, a.name, a.type ORDER BY a.code`,
    [asOf]
  );
  const out: TrialRow[] = [];
  let totalDr = 0;
  let totalCr = 0;
  for (const r of rows) {
    const net = Number(r.dr) - Number(r.cr);
    if (Number(r.dr) === 0 && Number(r.cr) === 0) continue;
    const row: TrialRow = { code: r.code, name: r.name, type: r.type, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 };
    totalDr += row.debitCents;
    totalCr += row.creditCents;
    out.push(row);
  }
  return { rows: out, totalDebitCents: totalDr, totalCreditCents: totalCr };
}

export interface StatementLine {
  code: string;
  name: string;
  amountCents: number;
}

/** Income less expenses for a period. */
export async function incomeStatement(client: PoolClient, from: string, to: string) {
  const { rows } = await client.query(
    `SELECT a.code, a.name, a.type, COALESCE(sum(l.debit_cents), 0)::bigint AS dr, COALESCE(sum(l.credit_cents), 0)::bigint AS cr
       FROM accounts a
       JOIN journal_lines l ON l.account_id = a.id
       JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date BETWEEN $1::date AND $2::date
      WHERE a.type IN ('income', 'expense') GROUP BY a.code, a.name, a.type ORDER BY a.code`,
    [from, to]
  );
  const income: StatementLine[] = [];
  const expenses: StatementLine[] = [];
  for (const r of rows) {
    const amount = r.type === 'income' ? Number(r.cr) - Number(r.dr) : Number(r.dr) - Number(r.cr);
    (r.type === 'income' ? income : expenses).push({ code: r.code, name: r.name, amountCents: amount });
  }
  const totalIncome = income.reduce((s, l) => s + l.amountCents, 0);
  const totalExpenses = expenses.reduce((s, l) => s + l.amountCents, 0);
  return { from, to, income, expenses, totalIncomeCents: totalIncome, totalExpensesCents: totalExpenses, surplusCents: totalIncome - totalExpenses };
}

/**
 * Assets = liabilities + equity + the surplus not yet moved to accumulated surplus. Income and expense accounts are
 * never closed in the ledger; the balance sheet adds their running net as "surplus to date", so it balances at any date.
 */
export async function balanceSheet(client: PoolClient, asOf: string) {
  const tb = await trialBalance(client, asOf);
  const assets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let incomeNet = 0;
  for (const r of tb.rows) {
    const net = r.debitCents - r.creditCents;
    if (r.type === 'asset') assets.push({ code: r.code, name: r.name, amountCents: net });
    else if (r.type === 'liability') liabilities.push({ code: r.code, name: r.name, amountCents: -net });
    else if (r.type === 'equity') equity.push({ code: r.code, name: r.name, amountCents: -net });
    else incomeNet += -net; // income is credit-normal (negative net), expense debit-normal
  }
  const sum = (lines: StatementLine[]) => lines.reduce((s, l) => s + l.amountCents, 0);
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + incomeNet;
  return {
    asOf,
    assets,
    liabilities,
    equity,
    surplusToDateCents: incomeNet,
    totalAssetsCents: totalAssets,
    totalLiabilitiesCents: totalLiabilities,
    totalEquityCents: totalEquity,
    balanced: totalAssets === totalLiabilities + totalEquity
  };
}

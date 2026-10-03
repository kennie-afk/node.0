/**
 * M-Pesa statement intake: parse an uploaded statement, summarise it in figures a loan officer can check, and flag
 * things that do not add up.
 *
 * HONESTY NOTE. Hazina's authors have not seen a real Safaricom statement file. The CSV parser therefore does not assume a
 * layout: it finds the header row by NAME (receipt, time, details, status, paid in, withdrawn, balance, in any of the
 * spellings below), and when it cannot find the columns it needs it refuses with the headers it did find, instead of
 * guessing. The PDF path needs an external text extractor and is the less certain of the two. Before relying on either,
 * run a few real statements through the console and check the rows against the file.
 *
 * Nothing here is a credit decision. The summary is arithmetic on the transactions: what came in, what went out, how
 * regular it was, and what share of average inflow a configured percentage represents.
 */

export class StatementFormatError extends Error {}

export interface StatementTxn {
  receiptNo: string | null;
  completedAt: Date;
  details: string;
  status: string | null;
  paidInCents: number;
  withdrawnCents: number;
  balanceCents: number | null;
}

// ---- CSV ----------------------------------------------------------------------------------------------------------

/** A small RFC 4180 reader: quoted fields, doubled quotes, commas or semicolons, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '');
  const firstLine = body.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const SYNONYMS = {
  receipt: ['receiptno', 'receipt', 'receiptnumber', 'transactionid', 'transid', 'reference'],
  time: ['completiontime', 'completiondate', 'time', 'date', 'transactiondate', 'datetime', 'transactiontime'],
  details: ['details', 'description', 'narration', 'transactiondetails', 'particulars'],
  status: ['transactionstatus', 'status'],
  paidIn: ['paidin', 'paidinksh', 'moneyin', 'credit', 'creditamount', 'deposit', 'amountin', 'received'],
  withdrawn: ['withdrawn', 'withdrawnksh', 'paidout', 'moneyout', 'debit', 'debitamount', 'withdrawal', 'amountout'],
  balance: ['balance', 'runningbalance', 'balanceksh', 'closingbalance']
} as const;

type Field = keyof typeof SYNONYMS;

function findColumns(header: string[]): Partial<Record<Field, number>> {
  const found: Partial<Record<Field, number>> = {};
  header.forEach((cell, index) => {
    const key = norm(cell);
    for (const field of Object.keys(SYNONYMS) as Field[]) {
      if (found[field] === undefined && (SYNONYMS[field] as readonly string[]).includes(key)) found[field] = index;
    }
  });
  return found;
}

/** Parses a money cell: "1,234.50", "-300.00", "(300.00)", "KES 500", blank. Returns whole cents, always non-negative. */
export function parseMoney(raw: string | undefined): number {
  if (raw === undefined) return 0;
  const text = raw.trim().replace(/^(ksh|kes)\s*/i, '');
  if (text === '' || text === '-') return 0;
  const cleaned = text.replace(/[,\s()]/g, '').replace(/^-/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) throw new StatementFormatError(`"${raw}" is not an amount`);
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/**
 * Statement times are local (East Africa Time, UTC+3). Day comes first in 12/03/2026 style dates, as is usual in Kenya,
 * and that is a choice, written here: an ISO date (2026-03-12) is read year-first and is never ambiguous.
 */
export function parseTime(raw: string): Date {
  const text = raw.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  let y: number, mo: number, d: number, h = 0, mi = 0, s = 0;
  if (match) {
    [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    [h, mi, s] = [Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)];
  } else {
    match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
    if (!match) throw new StatementFormatError(`"${raw}" is not a date and time`);
    [d, mo] = [Number(match[1]), Number(match[2])];
    y = Number(match[3]);
    if (y < 100) y += 2000;
    [h, mi, s] = [Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) throw new StatementFormatError(`"${raw}" is not a real date and time`);
  const at = new Date(Date.UTC(y, mo - 1, d, h - 3, mi, s));
  if (Number.isNaN(at.getTime())) throw new StatementFormatError(`"${raw}" is not a real date and time`);
  return at;
}

export function parseStatementCsv(text: string): StatementTxn[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new StatementFormatError('The file is empty.');

  let headerIndex = -1;
  let columns: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const candidate = findColumns(rows[i]!);
    const usable = candidate.time !== undefined && candidate.details !== undefined && (candidate.paidIn !== undefined || candidate.withdrawn !== undefined);
    if (usable) {
      headerIndex = i;
      columns = candidate;
      break;
    }
  }
  if (headerIndex < 0) {
    const seen = rows.slice(0, 3).map((r) => r.join(' | ')).join(' // ').slice(0, 300);
    throw new StatementFormatError(`Format not recognised: no row names a time, a details and a paid-in or withdrawn column. The first rows were: ${seen}`);
  }

  const out: StatementTxn[] = [];
  const cell = (row: string[], field: Field) => (columns[field] === undefined ? undefined : row[columns[field]!]);
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    const timeCell = cell(row, 'time');
    if (!timeCell || timeCell.trim() === '') continue; // a footer or a note, not a transaction
    const detailsCell = (cell(row, 'details') ?? '').trim();
    let paidIn = 0;
    let withdrawn = 0;
    try {
      paidIn = parseMoney(cell(row, 'paidIn'));
      withdrawn = parseMoney(cell(row, 'withdrawn'));
    } catch (error) {
      throw new StatementFormatError(`Row ${i + 1}: ${error instanceof Error ? error.message : 'bad amount'}`);
    }
    let completedAt: Date;
    try {
      completedAt = parseTime(timeCell);
    } catch (error) {
      if (out.length === 0 && i === headerIndex + 1) throw error;
      // after at least one good row, a row whose time does not parse is a trailer; anything more is an error
      if (i >= rows.length - 3) continue;
      throw new StatementFormatError(`Row ${i + 1}: ${error instanceof Error ? error.message : 'bad time'}`);
    }
    const balanceCell = cell(row, 'balance');
    let balance: number | null = null;
    if (balanceCell !== undefined && balanceCell.trim() !== '') {
      const negative = /^\s*-|^\(/.test(balanceCell);
      balance = parseMoney(balanceCell) * (negative ? -1 : 1);
    }
    out.push({
      receiptNo: (cell(row, 'receipt') ?? '').trim() || null,
      completedAt,
      details: detailsCell,
      status: (cell(row, 'status') ?? '').trim() || null,
      paidInCents: paidIn,
      withdrawnCents: withdrawn,
      balanceCents: balance
    });
  }
  if (out.length === 0) throw new StatementFormatError('The header was found but there are no transaction rows under it.');
  return out;
}

// ---- PDF (needs an external extractor) ----------------------------------------------------------------------------

export interface PdfTextExtractor {
  extract(pdf: Buffer): Promise<string>;
}

/**
 * Turns the text of a statement PDF into rows. This is deliberately conservative: a line counts as a transaction only
 * if it starts with a receipt-like code and a timestamp and ends in amounts. If fewer than half of the lines that look
 * like transactions fit, it refuses rather than return a partial statement.
 */
export function parseStatementPdfText(text: string): StatementTxn[] {
  const out: StatementTxn[] = [];
  let candidates = 0;
  for (const line of text.split(/\r?\n/)) {
    const start = /^\s*([A-Z0-9]{8,12})\s+(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s+(.*)$/.exec(line);
    if (!start) continue;
    candidates += 1;
    const tail = start[3]!.trimEnd();
    const amounts = [...tail.matchAll(/-?[\d,]+\.\d{2}\s*$|-?[\d,]+\.\d{2}(?=\s+-?[\d,]+\.\d{2})/g)];
    const numbers = tail.match(/-?[\d,]+\.\d{2}/g) ?? [];
    if (numbers.length < 2 || amounts.length === 0) continue;
    const balance = numbers[numbers.length - 1]!;
    const movement = numbers[numbers.length - 2]!;
    const detailsEnd = tail.lastIndexOf(movement);
    const details = tail.slice(0, detailsEnd).replace(/\s+(COMPLETED|Completed|FAILED|Failed)\s*$/, '').trim();
    const statusMatch = /(COMPLETED|Completed|FAILED|Failed)/.exec(tail);
    // Without column positions, a single movement figure cannot say in or out, so the sign of the balance change decides.
    out.push({
      receiptNo: start[1]!,
      completedAt: parseTime(start[2]!),
      details,
      status: statusMatch ? statusMatch[1]! : null,
      paidInCents: parseMoney(movement),
      withdrawnCents: 0,
      balanceCents: parseMoney(balance) * (balance.startsWith('-') ? -1 : 1)
    });
  }
  if (out.length === 0 || out.length < candidates / 2) {
    throw new StatementFormatError('Format not recognised: the PDF text did not contain statement rows in a layout Hazina can read. Upload the CSV instead.');
  }
  // Direction from the running balance: ordered by time, the balance rose (money in) or fell (money out).
  const ordered = [...out].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  for (let i = 1; i < ordered.length; i += 1) {
    const before = ordered[i - 1]!.balanceCents;
    const after = ordered[i]!.balanceCents;
    if (before === null || after === null) continue;
    const moved = ordered[i]!.paidInCents;
    if (after < before && Math.abs(before - after - moved) <= 1) {
      ordered[i]!.withdrawnCents = moved;
      ordered[i]!.paidInCents = 0;
    }
  }
  return ordered;
}

// ---- summary -------------------------------------------------------------------------------------------------------

export interface Flag {
  code: string;
  severity: 'info' | 'warn' | 'high';
  message: string;
}

export interface MonthTotals {
  month: string;
  inflowCents: number;
  outflowCents: number;
  count: number;
}

export interface StatementSummary {
  periodStart: string;
  periodEnd: string;
  transactionCount: number;
  completedCount: number;
  months: MonthTotals[];
  monthsCovered: number;
  averageMonthlyInflowCents: number;
  medianMonthlyInflowCents: number;
  lowestMonthlyInflowCents: number;
  averageMonthlyOutflowCents: number;
  inflowVariationPercent: number;
  regularMonthsPercent: number;
  topInflowSources: Array<{ name: string; shareOfInflowPercent: number }>;
  openingBalanceCents: number | null;
  closingBalanceCents: number | null;
  /** the configured share of average monthly inflow: an arithmetic ceiling to compare an instalment with, not a decision */
  indicativeCapacityCents: number;
  capacityShareBp: number;
  note: string;
}

const eat = (d: Date) => new Date(d.getTime() + 3 * 3_600_000);
const dayOf = (d: Date) => eat(d).toISOString().slice(0, 10);
const monthOf = (d: Date) => eat(d).toISOString().slice(0, 7);

function counterparty(details: string): string | null {
  const m = /(?:received from|transfer from|from)\s*[-:]?\s*(?:\d{6,}\s*[-:]?\s*)?(.+)$/i.exec(details);
  const name = (m?.[1] ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return name ? name.slice(0, 40) : null;
}

export function summarise(txns: StatementTxn[], capacityShareBp: number): { summary: StatementSummary; completed: StatementTxn[] } {
  const completed = txns.filter((t) => !t.status || /complete/i.test(t.status));
  if (completed.length === 0) throw new StatementFormatError('No completed transactions in the statement.');
  const ordered = [...completed].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());

  const byMonth = new Map<string, MonthTotals>();
  for (const t of ordered) {
    const key = monthOf(t.completedAt);
    const row = byMonth.get(key) ?? { month: key, inflowCents: 0, outflowCents: 0, count: 0 };
    row.inflowCents += t.paidInCents;
    row.outflowCents += t.withdrawnCents;
    row.count += 1;
    byMonth.set(key, row);
  }
  // every calendar month between the first and last, including quiet ones: a month with no inflow is information
  const first = monthOf(ordered[0]!.completedAt);
  const last = monthOf(ordered[ordered.length - 1]!.completedAt);
  const months: MonthTotals[] = [];
  let [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    months.push(byMonth.get(key) ?? { month: key, inflowCents: 0, outflowCents: 0, count: 0 });
    if (key === last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const inflows = months.map((r) => r.inflowCents);
  const outflows = months.map((r) => r.outflowCents);
  const mean = inflows.reduce((s, v) => s + v, 0) / months.length;
  const sorted = [...inflows].sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2;
  const variance = inflows.reduce((s, v) => s + (v - mean) ** 2, 0) / months.length;
  const variation = mean > 0 ? (Math.sqrt(variance) / mean) * 100 : 0;
  const regular = median > 0 ? (inflows.filter((v) => v >= median * 0.5).length / months.length) * 100 : 0;

  const totalIn = ordered.reduce((s, t) => s + t.paidInCents, 0);
  const sources = new Map<string, number>();
  for (const t of ordered) {
    if (t.paidInCents <= 0) continue;
    const name = counterparty(t.details);
    if (name) sources.set(name, (sources.get(name) ?? 0) + t.paidInCents);
  }
  const top = [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, amount]) => ({ name, shareOfInflowPercent: totalIn > 0 ? Math.round((amount / totalIn) * 1000) / 10 : 0 }));

  const balances = ordered.filter((t) => t.balanceCents !== null);
  const average = Math.round(mean);
  return {
    completed: ordered,
    summary: {
      periodStart: dayOf(ordered[0]!.completedAt),
      periodEnd: dayOf(ordered[ordered.length - 1]!.completedAt),
      transactionCount: txns.length,
      completedCount: completed.length,
      months,
      monthsCovered: months.length,
      averageMonthlyInflowCents: average,
      medianMonthlyInflowCents: Math.round(median),
      lowestMonthlyInflowCents: Math.min(...inflows),
      averageMonthlyOutflowCents: Math.round(outflows.reduce((s, v) => s + v, 0) / months.length),
      inflowVariationPercent: Math.round(variation * 10) / 10,
      regularMonthsPercent: Math.round(regular * 10) / 10,
      topInflowSources: top,
      openingBalanceCents: balances.length ? balances[0]!.balanceCents! - balances[0]!.paidInCents + balances[0]!.withdrawnCents : null,
      closingBalanceCents: balances.length ? balances[balances.length - 1]!.balanceCents : null,
      indicativeCapacityCents: Math.round((average * capacityShareBp) / 10_000),
      capacityShareBp,
      note: 'Figures are arithmetic on the uploaded statement. They are not a credit decision, and "top sources" is read from free-text details so it is approximate.'
    }
  };
}

// ---- consistency flags ----------------------------------------------------------------------------------------------

/**
 * Things in a statement that should make a person look closer. Each is a checkable fact about the file, never an
 * accusation: an edited statement often fails the running-balance check, but so can an incomplete export.
 */
export function consistencyFlags(all: StatementTxn[], summary: StatementSummary, asOf: Date = new Date()): Flag[] {
  const flags: Flag[] = [];

  const receipts = new Map<string, number>();
  for (const t of all) if (t.receiptNo) receipts.set(t.receiptNo, (receipts.get(t.receiptNo) ?? 0) + 1);
  const duplicated = [...receipts.entries()].filter(([, n]) => n > 1).length;
  if (duplicated > 0) flags.push({ code: 'duplicate_receipts', severity: 'high', message: `${duplicated} receipt number(s) appear more than once. A genuine statement lists each once.` });

  // running balance: only checked on rows with a balance, in the order they happened, and only between neighbours whose
  // timestamps differ (rows in the same second cannot be ordered safely)
  const ordered = all.filter((t) => t.balanceCents !== null && (!t.status || /complete/i.test(t.status))).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  let checked = 0;
  let breaks = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    const a = ordered[i - 1]!;
    const b = ordered[i]!;
    if (a.completedAt.getTime() === b.completedAt.getTime()) continue;
    checked += 1;
    const expected = a.balanceCents! + b.paidInCents - b.withdrawnCents;
    if (Math.abs(expected - b.balanceCents!) > 100) breaks += 1;
  }
  if (checked >= 5 && breaks > 0) {
    flags.push({
      code: 'balance_breaks',
      severity: breaks / checked > 0.2 ? 'high' : 'warn',
      message: `The running balance does not follow from the amounts at ${breaks} of ${checked} checked rows. The file may be edited, filtered or incomplete.`
    });
  }

  if (summary.monthsCovered < 3) flags.push({ code: 'short_period', severity: 'warn', message: `The statement covers ${summary.monthsCovered} calendar month(s); most lenders ask for at least three.` });
  const ageDays = Math.floor((asOf.getTime() - new Date(`${summary.periodEnd}T00:00:00Z`).getTime()) / 86_400_000);
  if (ageDays > 45) flags.push({ code: 'stale', severity: 'warn', message: `The latest transaction is ${ageDays} days old, so this does not show the borrower's recent position.` });

  const sortedAll = [...all].sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  let longestGap = 0;
  for (let i = 1; i < sortedAll.length; i += 1) longestGap = Math.max(longestGap, Math.floor((sortedAll[i]!.completedAt.getTime() - sortedAll[i - 1]!.completedAt.getTime()) / 86_400_000));
  if (longestGap > 30) flags.push({ code: 'gap', severity: 'warn', message: `There is a ${longestGap}-day gap with no transactions inside the period.` });

  const failed = all.length - summary.completedCount;
  if (failed > 0 && failed / all.length > 0.2) flags.push({ code: 'many_failed', severity: 'info', message: `${failed} of ${all.length} rows are not completed transactions and were left out of the figures.` });

  if (summary.inflowVariationPercent > 100) flags.push({ code: 'volatile_inflow', severity: 'info', message: `Monthly inflow varies a lot (variation ${summary.inflowVariationPercent}% of its average).` });
  return flags;
}

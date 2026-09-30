import { toMinor } from '../../common/money';

export interface StatementRow {
  date: string;
  description: string;
  reference: string | null;
  /** Signed minor units: money in is positive, money out negative. */
  amountMinor: number;
  balanceMinor: number | null;
}

export interface ParseResult {
  rows: StatementRow[];
  errors: Array<{ row: number; message: string }>;
}

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF, commas inside quotes. */
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
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

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function realDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function parseDate(raw: string): string | null {
  const text = raw.trim();
  let iso: string | null = null;
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  else if ((m = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  else if ((m = text.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -,]*(\d{4})$/))) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) iso = `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }
  return iso && realDate(iso) ? iso : null;
}

/** "1,234.50", "KES 1 234.5", "(99.00)", "-10" -> minor units. Throws on anything else. */
export function parseAmount(raw: string): number {
  let text = raw.trim().replace(/^(kes|ksh|ksh\.|kshs)\s*/i, '').replace(/[\s,]/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  }
  if (text.startsWith('+')) text = text.slice(1);
  const minor = toMinor(text);
  return negative ? -minor : minor;
}

const ALIASES: Record<string, string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'completion time'],
  description: ['description', 'details', 'narrative', 'particulars', 'narration', 'transaction details'],
  reference: ['reference', 'ref', 'ref no', 'reference no', 'transaction id', 'receipt no', 'receipt', 'cheque no'],
  amount: ['amount', 'txn amount', 'transaction amount'],
  debit: ['debit', 'withdrawal', 'withdrawn', 'money out', 'paid out', 'dr'],
  credit: ['credit', 'deposit', 'paid in', 'money in', 'cr'],
  balance: ['balance', 'running balance', 'closing balance']
};

export function parseStatementCsv(text: string): ParseResult {
  const table = splitCsv(text);
  const errors: ParseResult['errors'] = [];
  if (table.length < 2) return { rows: [], errors: [{ row: 1, message: 'the file needs a header row and at least one transaction' }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const at = header.findIndex((h) => names.includes(h));
    if (at >= 0) index[field] = at;
  }
  if (index.date === undefined) errors.push({ row: 1, message: 'no date column found' });
  if (index.amount === undefined && index.debit === undefined && index.credit === undefined) errors.push({ row: 1, message: 'no amount, debit or credit column found' });
  if (errors.length) return { rows: [], errors };

  const rows: StatementRow[] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const get = (field: string) => (index[field] === undefined ? '' : (cells[index[field]] ?? '').trim());
    try {
      const date = parseDate(get('date'));
      if (!date) throw new Error(`"${get('date')}" is not a recognised date`);
      let amountMinor: number;
      if (index.amount !== undefined && get('amount') !== '') amountMinor = parseAmount(get('amount'));
      else {
        const credit = get('credit') ? parseAmount(get('credit')) : 0;
        const debit = get('debit') ? parseAmount(get('debit')) : 0;
        amountMinor = Math.abs(credit) - Math.abs(debit);
      }
      if (amountMinor === 0) throw new Error('the amount is empty or zero');
      rows.push({
        date,
        description: get('description').slice(0, 300),
        reference: get('reference') ? get('reference').slice(0, 80) : null,
        amountMinor,
        balanceMinor: get('balance') ? parseAmount(get('balance')) : null
      });
    } catch (error) {
      errors.push({ row: r + 1, message: (error as Error).message });
    }
  }
  return { rows, errors };
}

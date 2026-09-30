/**
 * Money and date formatting. The API speaks decimal strings ("1500.50"); this file turns them
 * into integer minor units (cents) for any arithmetic and back, so a float never touches an
 * amount: 0.1 + 0.2 is not 0.3, and a ledger that drifts by a cent cannot be reconciled.
 */

const DECIMAL = /^-?\d{1,14}(\.\d{1,2})?$/;

/** "1234.5" -> 123450. Throws on anything that is not a plain decimal with at most 2 places. */
export function toMinor(value: string | number): number {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!DECIMAL.test(text)) {
    throw new Error(`"${text}" is not a valid amount`);
  }
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return negative ? -minor : minor;
}

/** 123450 -> "1234.50". */
export function fromMinor(minor: number): string {
  if (!Number.isSafeInteger(minor)) {
    throw new Error('amount is not a safe integer number of minor units');
  }
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function addMoney(a: string, b: string): string {
  return fromMinor(toMinor(a) + toMinor(b));
}

export function subMoney(a: string, b: string): string {
  return fromMinor(toMinor(a) - toMinor(b));
}

export function sumMoney(values: Array<string | null | undefined>): string {
  return fromMinor(values.reduce<number>((total, value) => total + (value ? toMinor(value) : 0), 0));
}

export function negateMoney(a: string): string {
  return fromMinor(-toMinor(a));
}

export function compareMoney(a: string, b: string): number {
  return Math.sign(toMinor(a) - toMinor(b));
}

export function isZeroMoney(a: string | null | undefined): boolean {
  return !a || toMinor(a) === 0;
}

export interface MoneyFormatOptions {
  currency?: string;
  /** Show the currency code. Off inside tables whose header already says KES. */
  showCurrency?: boolean;
  /** Accountants write negatives in brackets. */
  negative?: 'minus' | 'parens';
  /** Show "-" instead of 0.00. */
  dashForZero?: boolean;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1234567.5" -> "KES 1,234,567.50", using integer maths only. */
export function formatMoney(value: string | number | null | undefined, options: MoneyFormatOptions = {}): string {
  const { currency = 'KES', showCurrency = true, negative = 'minus', dashForZero = false } = options;
  if (value === null || value === undefined || value === '') return dashForZero ? '-' : showCurrency ? `${currency} 0.00` : '0.00';
  const minor = toMinor(value);
  if (minor === 0 && dashForZero) return '-';
  const abs = Math.abs(minor);
  const body = `${group(String(Math.trunc(abs / 100)))}.${String(abs % 100).padStart(2, '0')}`;
  const text = showCurrency ? `${currency} ${body}` : body;
  if (minor < 0) return negative === 'parens' ? `(${text})` : `-${text}`;
  return text;
}

/** Keeps only what a money field may hold while typing: digits, one dot, two decimals. */
export function sanitizeMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  if (dot === -1) return cleaned.slice(0, 14);
  const whole = cleaned.slice(0, dot).slice(0, 14);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${fraction}`;
}

/** On blur: "12" -> "12.00", ".5" -> "0.50", "" -> "". */
export function normalizeMoneyInput(raw: string): string {
  const cleaned = sanitizeMoneyInput(raw);
  if (cleaned === '' || cleaned === '.') return '';
  const [whole, fraction = ''] = cleaned.split('.');
  return `${whole === '' ? '0' : String(Number(whole))}.${fraction.padEnd(2, '0')}`;
}

/** Share of a whole as a number with one decimal, from integer minor units. */
export function percent(part: string | number, whole: string | number): number {
  const p = typeof part === 'string' ? toMinor(part) : part;
  const w = typeof whole === 'string' ? toMinor(whole) : whole;
  if (w === 0) return 0;
  return Math.round((p * 1000) / w) / 10;
}

export function formatCount(n: number): string {
  return group(String(Math.trunc(n)));
}

// ---- dates ------------------------------------------------------------------------------

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStartISO(date = todayISO()): string {
  return `${date.slice(0, 7)}-01`;
}

export function yearStartISO(date = todayISO()): string {
  return `${date.slice(0, 4)}-01-01`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-09-30" or an ISO timestamp -> "30 Sep 2026". Pure string work, so no timezone drift. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(d.toISOString().slice(0, 10))} ${time}`;
}

/** Month name for charts: 1..12. */
export function monthLabel(month: number): string {
  return MONTHS[(month - 1 + 12) % 12];
}

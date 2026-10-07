export type Cents = number & { readonly __brand: 'Cents' };

export class MoneyError extends Error {}

export function cents(value: number): Cents {
  if (!Number.isFinite(value)) {
    throw new MoneyError('an amount must be a finite number');
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError('amounts are held in whole cents, never floats');
  }
  return value as Cents;
}

export function fromShillings(value: number): Cents {
  return cents(Math.round(value * 100));
}

export function toShillings(value: Cents): number {
  return value / 100;
}

export function addCents(...values: Cents[]): Cents {
  return cents(values.reduce<number>((total, value) => total + value, 0));
}

export function subtractCents(left: Cents, right: Cents): Cents {
  return cents(left - right);
}

export function formatKsh(value: Cents): string {
  // integer arithmetic only (moneyText below): no float division of money
  return `${value < 0 ? '-' : ''}KSh ${moneyText(Math.abs(value))}`;
}

function splitCents(value: number): { sign: string; whole: string; frac: string } {
  if (!Number.isSafeInteger(value)) throw new MoneyError('an amount must be a safe whole number of cents');
  const abs = BigInt(Math.abs(value));
  return { sign: value < 0 ? '-' : '', whole: String(abs / 100n), frac: String(abs % 100n).padStart(2, '0') };
}

/** "1234.50": a plain decimal for CSV and statements, built from integer cents (no float division). */
export function csvMoney(value: number): string {
  const { sign, whole, frac } = splitCents(value);
  return `${sign}${whole}.${frac}`;
}

/** "1,234.50" or "1,234" when there are no cents, for messages shown to people. Integer arithmetic only. */
export function moneyText(value: number): string {
  const { sign, whole, frac } = splitCents(value);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${frac === '00' ? '' : `.${frac}`}`;
}

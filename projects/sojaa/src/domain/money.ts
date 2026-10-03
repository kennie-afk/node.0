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
  const shillings = Math.abs(value) / 100;
  const sign = value < 0 ? '-' : '';
  return `${sign}KSh ${shillings.toLocaleString('en-KE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

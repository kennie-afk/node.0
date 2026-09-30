/**
 * Money is carried as an integer count of minor units (cents) everywhere inside the system and
 * only turned into a decimal string at the API edge. Floating point never touches an amount:
 * 0.1 + 0.2 is not 0.3, and a ledger that drifts by a cent cannot be reconciled.
 */
import { z } from 'zod';
import { BadRequestError } from '../utils/errors';

/** 100 billion major units. Keeps every sum of amounts inside Number.MAX_SAFE_INTEGER. */
export const MAX_MINOR = 10_000_000_000_000;

const DECIMAL = /^-?\d{1,14}(\.\d{1,2})?$/;

export function toMinor(input: string | number): number {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (!DECIMAL.test(text)) {
    throw new BadRequestError(`"${text}" is not a valid amount (at most two decimal places)`);
  }
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.replace('-', '').split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (minor > MAX_MINOR) {
    throw new BadRequestError('amount is larger than the system allows');
  }
  return negative ? -minor : minor;
}

export function fromMinor(minor: number | string | bigint | null | undefined): string {
  const value = Number(minor ?? 0);
  if (!Number.isSafeInteger(value)) {
    throw new Error('amount is not a safe integer number of minor units');
  }
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${cents}`;
}

/** Accepts a decimal string or a number, and yields minor units. Positive only. */
export const moneyInput = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    try {
      return toMinor(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: (error as Error).message });
      return z.NEVER;
    }
  })
  .refine((minor) => minor > 0, 'amount must be greater than zero');

/** Like {@link moneyInput} but zero and negative values are allowed (opening balances, variances). */
export const signedMoneyInput = z.union([z.string(), z.number()]).transform((value, ctx) => {
  try {
    return toMinor(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: (error as Error).message });
    return z.NEVER;
  }
});

/**
 * Splits a total by weights so the parts always add back to the total (largest remainder), for
 * apportioning a payment across several lines without losing or inventing a cent.
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    throw new Error('weights must sum to a positive number');
  }
  const exact = weights.map((w) => (total * w) / sum);
  const floors = exact.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (remainder <= 0) break;
    floors[index] += 1;
    remainder -= 1;
  }
  return floors;
}

/** Rounds half away from zero, for percentage maths on whole minor units. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function percentOf(minor: number, basisPoints: number): number {
  return roundHalfUp((minor * basisPoints) / 10_000);
}

export function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`value ${String(value)} is not a safe integer`);
  }
  return n;
}

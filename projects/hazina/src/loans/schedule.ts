/**
 * Loan schedules and repayment allocation: pure functions, no database, so every rule is testable on its own.
 * The formulas are written out in docs/ACCOUNTING.md; they are standard, but they are the rules Hazina applies, and an
 * organisation's own loan policy must match them before it relies on the figures.
 *
 * Money is whole cents. A rate is basis points a year (1200 = 12.00%). Products of cents x basis points x months can
 * pass 2^53, so the arithmetic that multiplies them is done in BigInt.
 *
 *  flat       total interest = principal x rate x months / 12, spread evenly over the months; principal is also spread
 *             evenly. Any remainder cents go to the last instalment so the schedule always adds up exactly.
 *  reducing   equal instalments on the falling balance: payment = P x i / (1 - (1 + i)^-n) with i = rate / 12, rounded
 *             to the cent; each month's interest is the opening balance x i, rounded; the last instalment clears the
 *             exact remaining balance, so principal always totals the loan.
 */

export type Method = 'flat' | 'reducing';

export interface ScheduleInput {
  principalCents: number;
  termMonths: number;
  annualRateBp: number;
  method: Method;
  /** YYYY-MM-DD of the first instalment; later ones fall on the same day of each month, clamped to month end */
  firstDueDate: string;
}

export interface Installment {
  installmentNo: number;
  dueDate: string;
  principalCents: number;
  interestCents: number;
}

export class ScheduleError extends Error {}

/** Round-half-up integer division of non-negative BigInts. */
function divRound(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function parseDay(day: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new ScheduleError(`"${day}" is not a YYYY-MM-DD date`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new ScheduleError(`"${day}" is not a real date`);
  }
  return { y, m, d };
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The same day-of-month `months` later, clamped to the last day of a shorter month (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsToDay(day: string, months: number): string {
  const { y, m, d } = parseDay(day);
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return formatDay(new Date(Date.UTC(year, month, Math.min(d, last))));
}

export function addDaysToDay(day: string, days: number): string {
  const { y, m, d } = parseDay(day);
  return formatDay(new Date(Date.UTC(y, m - 1, d + days)));
}

export function daysBetween(from: string, to: string): number {
  const a = parseDay(from);
  const b = parseDay(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

export function buildSchedule(input: ScheduleInput): Installment[] {
  const { principalCents, termMonths, annualRateBp, method } = input;
  if (!Number.isInteger(principalCents) || principalCents <= 0) throw new ScheduleError('the principal must be a positive whole number of cents');
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 360) throw new ScheduleError('the term must be 1 to 360 months');
  if (!Number.isInteger(annualRateBp) || annualRateBp < 0 || annualRateBp > 100_000) throw new ScheduleError('the rate must be 0 to 1000% a year, in basis points');

  const rows: Installment[] = [];
  const P = BigInt(principalCents);
  const n = BigInt(termMonths);

  if (method === 'flat') {
    const totalInterest = divRound(P * BigInt(annualRateBp) * n, 120_000n);
    const principalEach = P / n;
    const interestEach = totalInterest / n;
    let principalLeft = P;
    let interestLeft = totalInterest;
    for (let k = 1; k <= termMonths; k += 1) {
      const last = k === termMonths;
      const principal = last ? principalLeft : principalEach;
      const interest = last ? interestLeft : interestEach;
      principalLeft -= principal;
      interestLeft -= interest;
      rows.push({ installmentNo: k, dueDate: addMonthsToDay(input.firstDueDate, k - 1), principalCents: Number(principal), interestCents: Number(interest) });
    }
    return rows;
  }

  // reducing balance
  const monthlyRate = annualRateBp / 120_000;
  let paymentCents: bigint;
  if (annualRateBp === 0) {
    paymentCents = divRound(P, n);
  } else {
    const factor = monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths));
    paymentCents = BigInt(Math.round(principalCents * factor));
  }
  let balance = P;
  for (let k = 1; k <= termMonths; k += 1) {
    const interest = divRound(balance * BigInt(annualRateBp), 120_000n);
    let principal: bigint;
    if (k === termMonths) {
      principal = balance;
    } else {
      principal = paymentCents - interest;
      // a payment smaller than the month's interest would grow the balance; refuse rather than invent a schedule
      if (principal < 0n) throw new ScheduleError('the rate is too high for this term: the instalment would not cover the interest');
      if (principal > balance) principal = balance;
    }
    balance -= principal;
    rows.push({ installmentNo: k, dueDate: addMonthsToDay(input.firstDueDate, k - 1), principalCents: Number(principal), interestCents: Number(interest) });
  }
  return rows;
}

export interface ScheduleTotals {
  principalCents: number;
  interestCents: number;
  totalCents: number;
}

export function totals(rows: readonly Installment[]): ScheduleTotals {
  const principalCents = rows.reduce((sum, r) => sum + r.principalCents, 0);
  const interestCents = rows.reduce((sum, r) => sum + r.interestCents, 0);
  return { principalCents, interestCents, totalCents: principalCents + interestCents };
}

// ---- repayment allocation --------------------------------------------------------------------------------------

export interface OwedInstallment {
  installmentNo: number;
  principalCents: number;
  interestCents: number;
  penaltyCents: number;
  paidPrincipalCents: number;
  paidInterestCents: number;
  paidPenaltyCents: number;
}

export interface Allocation {
  /** per instalment: how much of this payment went to each part */
  lines: Array<{ installmentNo: number; penaltyCents: number; interestCents: number; principalCents: number }>;
  penaltyCents: number;
  interestCents: number;
  principalCents: number;
  /** what was left after every instalment was cleared: the loan is fully repaid and this much is not owed to anyone */
  unappliedCents: number;
}

/**
 * Oldest instalment first; within one instalment penalty, then interest, then principal. A payment larger than what is
 * due clears later instalments in order, so an early repayment shortens the loan rather than being parked. Whatever is
 * left after the last instalment is returned as unapplied and is the caller's to refund or hold; it is never lost.
 */
export function allocateRepayment(amountCents: number, installments: readonly OwedInstallment[]): Allocation {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new ScheduleError('a repayment must be a positive whole number of cents');
  let left = amountCents;
  const lines: Allocation['lines'] = [];
  let penalty = 0;
  let interest = 0;
  let principal = 0;
  for (const row of [...installments].sort((a, b) => a.installmentNo - b.installmentNo)) {
    if (left === 0) break;
    const owedPenalty = row.penaltyCents - row.paidPenaltyCents;
    const owedInterest = row.interestCents - row.paidInterestCents;
    const owedPrincipal = row.principalCents - row.paidPrincipalCents;
    const toPenalty = Math.min(left, owedPenalty);
    left -= toPenalty;
    const toInterest = Math.min(left, owedInterest);
    left -= toInterest;
    const toPrincipal = Math.min(left, owedPrincipal);
    left -= toPrincipal;
    if (toPenalty + toInterest + toPrincipal > 0) {
      lines.push({ installmentNo: row.installmentNo, penaltyCents: toPenalty, interestCents: toInterest, principalCents: toPrincipal });
      penalty += toPenalty;
      interest += toInterest;
      principal += toPrincipal;
    }
  }
  return { lines, penaltyCents: penalty, interestCents: interest, principalCents: principal, unappliedCents: left };
}

// ---- arrears ----------------------------------------------------------------------------------------------------

export interface ArrearsInstallment extends OwedInstallment {
  dueDate: string;
}

export interface Arrears {
  overduePrincipalCents: number;
  overdueInterestCents: number;
  overduePenaltyCents: number;
  /** days since the oldest unpaid instalment fell due; 0 when nothing is overdue */
  daysOverdue: number;
}

export function arrearsAsAt(asOf: string, installments: readonly ArrearsInstallment[]): Arrears {
  let principal = 0;
  let interest = 0;
  let penalty = 0;
  let oldest: string | null = null;
  for (const row of installments) {
    if (row.dueDate >= asOf) continue;
    const p = row.principalCents - row.paidPrincipalCents;
    const i = row.interestCents - row.paidInterestCents;
    const f = row.penaltyCents - row.paidPenaltyCents;
    if (p + i + f <= 0) continue;
    principal += p;
    interest += i;
    penalty += f;
    if (oldest === null || row.dueDate < oldest) oldest = row.dueDate;
  }
  return {
    overduePrincipalCents: principal,
    overdueInterestCents: interest,
    overduePenaltyCents: penalty,
    daysOverdue: oldest === null ? 0 : daysBetween(oldest, asOf)
  };
}

export const AGEING_BUCKETS = ['current', '1-30', '31-60', '61-90', '91-180', '180+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function bucketFor(daysOverdue: number): AgeingBucket {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  if (daysOverdue <= 180) return '91-180';
  return '180+';
}

/** One month's penalty on one overdue instalment, in cents: the overdue principal and interest times the monthly rate. */
export function penaltyFor(overdueCents: number, penaltyRateBp: number): number {
  if (overdueCents <= 0 || penaltyRateBp <= 0) return 0;
  return Number(divRound(BigInt(overdueCents) * BigInt(penaltyRateBp), 10_000n));
}

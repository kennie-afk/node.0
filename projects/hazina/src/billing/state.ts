/**
 * The subscription state machine, as pure functions of dates. The status that gates the product is
 * always computed from these dates at the moment of the request, never trusted from a stored column
 * that a missed scheduler run could leave stale; the stored status only mirrors it for reporting.
 *
 *   trial      now < trialEndsAt
 *   active     now < coveredUntil           (a paid period, or a prepaid one starting after the trial)
 *   past_due   lapsed, but within suspendAfterDays of the lapse
 *   suspended  lapsed for longer: read-only, nothing is ever deleted
 *   cancelled  set by an operator
 */
import { BillingConfig } from './pricing';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled';

export interface SubscriptionFacts {
  status: SubscriptionStatus;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
}

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calendar month in UTC, clamping the day (31 Jan + 1 month is 28/29 Feb, not 3 March). */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function coveredUntil(sub: SubscriptionFacts): Date {
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > sub.trialEndsAt.getTime()) {
    return sub.currentPeriodEnd;
  }
  return sub.trialEndsAt;
}

export function effectiveStatus(sub: SubscriptionFacts, now: Date, config: BillingConfig): SubscriptionStatus {
  if (sub.status === 'cancelled') return 'cancelled';
  if (now.getTime() < sub.trialEndsAt.getTime()) return 'trial';
  const covered = coveredUntil(sub);
  if (now.getTime() < covered.getTime()) return 'active';
  return now.getTime() < addDays(covered, config.suspendAfterDays).getTime() ? 'past_due' : 'suspended';
}

/** Suspended and cancelled organisations keep their data and their reads, and lose configuration writes. */
export function writesAllowed(status: SubscriptionStatus): boolean {
  return status !== 'suspended' && status !== 'cancelled';
}

export interface InvoiceWindow {
  periodStart: Date;
  periodEnd: Date;
}

/** The next invoice is due to be issued once we are within issueLeadDays of the end of coverage. */
export function nextInvoiceWindow(sub: SubscriptionFacts, now: Date, config: BillingConfig): InvoiceWindow | null {
  if (sub.status === 'cancelled') return null;
  const start = coveredUntil(sub);
  if (now.getTime() < addDays(start, -config.issueLeadDays).getTime()) return null;
  return { periodStart: start, periodEnd: addMonths(start, 1) };
}

/**
 * The new end of coverage once an invoice is fully paid. A late payment buys a full month from the
 * day it arrives, not from the day it should have; an early one continues from where coverage ended.
 */
export function coverageAfterPayment(invoice: InvoiceWindow, paidAt: Date): Date {
  const from = paidAt.getTime() > invoice.periodStart.getTime() ? paidAt : invoice.periodStart;
  return addMonths(from, 1);
}

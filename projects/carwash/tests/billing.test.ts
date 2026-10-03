import { describe, expect, it } from 'vitest';
import { BillingConfig, quote } from '../src/billing/pricing';
import {
  addDays,
  addMonths,
  coverageAfterPayment,
  coveredUntil,
  effectiveStatus,
  nextInvoiceWindow,
  SubscriptionFacts,
  writesAllowed
} from '../src/billing/state';
import { normaliseBillingRef } from '../src/billing/ref';
import { renderSummaryText } from '../src/reporting/summary-text';
import { localYesterday } from '../src/reconciliation/schedule';

const CONFIG: BillingConfig = {
  starterCents: 350_000,
  growthCents: 300_000,
  growthMaxSites: 5,
  trialDays: 14,
  issueLeadDays: 3,
  suspendAfterDays: 14
};

const T0 = new Date('2026-10-01T09:00:00Z');
const trial = (overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts => ({
  status: 'trial',
  trialEndsAt: addDays(T0, 14),
  currentPeriodEnd: null,
  ...overrides
});

describe('pricing follows the published tiers (provisional amounts)', () => {
  it('charges KES 3,500 for one site and 3,000 each for two to five', () => {
    expect(quote(1, CONFIG)).toMatchObject({ planCode: 'starter', unitCents: 350_000, amountCents: 350_000 });
    expect(quote(2, CONFIG)).toMatchObject({ planCode: 'growth', unitCents: 300_000, amountCents: 600_000 });
    expect(quote(5, CONFIG)).toMatchObject({ planCode: 'growth', amountCents: 1_500_000 });
  });

  it('treats six or more sites as a custom plan: list rate until an agreed price is set', () => {
    expect(quote(6, CONFIG)).toMatchObject({ planCode: 'custom', unitCents: 300_000, amountCents: 1_800_000 });
    expect(quote(6, CONFIG, 250_000)).toMatchObject({ unitCents: 250_000, amountCents: 1_500_000 });
  });

  it('ignores an agreed price on plans that are not custom, and never bills for zero sites', () => {
    expect(quote(1, CONFIG, 1).unitCents).toBe(350_000);
    expect(quote(0, CONFIG).siteCount).toBe(1);
  });

  it('keeps money in whole cents', () => {
    for (const sites of [1, 2, 3, 7, 40]) expect(Number.isInteger(quote(sites, CONFIG).amountCents)).toBe(true);
  });
});

describe('calendar arithmetic', () => {
  it('adds months without overflowing short ones', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    expect(addMonths(new Date('2026-12-15T00:00:00Z'), 1).toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });
});

describe('subscription status is computed from dates', () => {
  it('is a trial until the trial ends', () => {
    expect(effectiveStatus(trial(), T0, CONFIG)).toBe('trial');
    expect(effectiveStatus(trial(), addDays(T0, 13), CONFIG)).toBe('trial');
  });

  it('goes past due the moment an unpaid trial ends, and suspended after the grace period', () => {
    const sub = trial();
    expect(effectiveStatus(sub, addDays(T0, 14), CONFIG)).toBe('past_due');
    expect(effectiveStatus(sub, addDays(T0, 27), CONFIG)).toBe('past_due');
    expect(effectiveStatus(sub, addDays(T0, 28), CONFIG)).toBe('suspended');
  });

  it('is active while a paid period runs, including a prepaid one that starts after the trial', () => {
    const prepaid = trial({ currentPeriodEnd: addMonths(addDays(T0, 14), 1) });
    expect(effectiveStatus(prepaid, addDays(T0, 5), CONFIG)).toBe('trial');
    expect(effectiveStatus(prepaid, addDays(T0, 20), CONFIG)).toBe('active');
    expect(coveredUntil(prepaid).toISOString()).toBe(addMonths(addDays(T0, 14), 1).toISOString());
  });

  it('never lets a stale stored status override the dates', () => {
    expect(effectiveStatus(trial({ status: 'active' }), addDays(T0, 40), CONFIG)).toBe('suspended');
    expect(effectiveStatus(trial({ status: 'suspended' }), T0, CONFIG)).toBe('trial');
  });

  it('keeps cancelled cancelled', () => {
    expect(effectiveStatus(trial({ status: 'cancelled' }), T0, CONFIG)).toBe('cancelled');
  });

  it('suspends writes but nothing else', () => {
    expect(writesAllowed('trial')).toBe(true);
    expect(writesAllowed('active')).toBe(true);
    expect(writesAllowed('past_due')).toBe(true);
    expect(writesAllowed('suspended')).toBe(false);
    expect(writesAllowed('cancelled')).toBe(false);
  });
});

describe('invoicing windows', () => {
  it('issues the first invoice three days before the trial ends, for the month that follows it', () => {
    const sub = trial();
    expect(nextInvoiceWindow(sub, addDays(T0, 10), CONFIG)).toBeNull();
    const window = nextInvoiceWindow(sub, addDays(T0, 11), CONFIG)!;
    expect(window.periodStart.toISOString()).toBe(addDays(T0, 14).toISOString());
    expect(window.periodEnd.toISOString()).toBe(addMonths(addDays(T0, 14), 1).toISOString());
  });

  it('issues nothing for a cancelled subscription', () => {
    expect(nextInvoiceWindow(trial({ status: 'cancelled' }), addDays(T0, 30), CONFIG)).toBeNull();
  });

  it('gives a late payer a full month from the day they pay, and an early payer continuity', () => {
    const invoice = { periodStart: new Date('2026-10-15T00:00:00Z'), periodEnd: new Date('2026-11-15T00:00:00Z') };
    expect(coverageAfterPayment(invoice, new Date('2026-10-12T00:00:00Z')).toISOString()).toBe('2026-11-15T00:00:00.000Z');
    expect(coverageAfterPayment(invoice, new Date('2026-10-25T00:00:00Z')).toISOString()).toBe('2026-11-25T00:00:00.000Z');
  });
});

describe('account numbers typed on a phone', () => {
  it('ignore case, spaces and dashes', () => {
    expect(normaliseBillingRef(' fc-123 456 ')).toBe('FC123456');
    expect(normaliseBillingRef('fc123456')).toBe('FC123456');
  });
});

describe('the shareable summary', () => {
  const base = {
    scope: 'real' as const,
    windowDays: 14,
    from: '2026-09-18',
    to: '2026-10-01',
    daysChecked: 14,
    carsDetected: 410,
    jobsRecorded: 398,
    expectedCents: 1_000_000,
    receivedCents: 940_000,
    gapCents: 60_000,
    flagsRaised: 3,
    openFlags: 2,
    flaggedCents: 45_000,
    sites: [],
    topFlags: [{ type: 'ghost_wash', label: 'Cars washed with no job recorded', count: 3, estimatedCents: 45_000 }]
  };

  it('states only what was computed and says flags are leads, not proof', () => {
    const text = renderSummaryText(base, 'Pwani Wash');
    expect(text).toContain('Pwani Wash: what Forecourt found, 2026-09-18 to 2026-10-01');
    expect(text).toContain('Days checked:      14');
    expect(text).toContain('Cars washed with no job recorded: 3');
    expect(text).toContain('not proof');
    expect(text).not.toContain('SAMPLE');
  });

  it('labels sample data as sample, loudly, on the first line', () => {
    expect(renderSummaryText({ ...base, scope: 'sample' }, 'Pwani Wash').split('\n')[0]).toBe('SAMPLE DATA - not your records');
  });

  it('says plainly when nothing has been reconciled', () => {
    expect(renderSummaryText({ ...base, scope: 'none', daysChecked: 0 }, 'Pwani Wash')).toContain('Nothing has been reconciled yet');
  });
});

describe('which day is yesterday at the site', () => {
  it('uses the site\'s own clock, not the server\'s', () => {
    // 22:30 UTC on 1 Oct is already 01:30 on 2 Oct in Nairobi (UTC+3): yesterday there is 1 Oct, not 30 Sep.
    const now = new Date('2026-10-01T22:30:00Z');
    expect(localYesterday(now, 'Africa/Nairobi')).toBe('2026-10-01');
    expect(localYesterday(now, 'UTC')).toBe('2026-09-30');
    expect(localYesterday(new Date('2026-03-01T00:30:00Z'), 'UTC')).toBe('2026-02-28');
    expect(localYesterday(new Date('2028-03-01T12:00:00Z'), 'UTC')).toBe('2028-02-29');
  });
});

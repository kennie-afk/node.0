import { describe, expect, it } from 'vitest';
import { ROLES, can, canGrantRole, Permission } from '../src/domain/roles';
import { quote, BillingConfig } from '../src/billing/pricing';
import { effectiveStatus, writesAllowed, addMonths } from '../src/billing/state';

describe('roles', () => {
  it('lets a teller take money in but not approve, lend, post journals or see the books', () => {
    expect(can('teller', 'savings_post')).toBe(true);
    expect(can('teller', 'loan_repay')).toBe(true);
    for (const p of ['loan_approve', 'loan_disburse', 'loan_writeoff', 'journal_post', 'reports', 'settings', 'billing', 'withdraw_approve'] as Permission[]) expect(can('teller', p)).toBe(false);
  });
  it('lets a loan officer apply and appraise but never approve or pay out', () => {
    expect(can('loan_officer', 'loan_apply')).toBe(true);
    expect(can('loan_officer', 'loan_appraise')).toBe(true);
    expect(can('loan_officer', 'loan_approve')).toBe(false);
    expect(can('loan_officer', 'loan_disburse')).toBe(false);
  });
  it('lets an accountant pay out and post journals but not approve a loan', () => {
    expect(can('accountant', 'loan_disburse')).toBe(true);
    expect(can('accountant', 'journal_post')).toBe(true);
    expect(can('accountant', 'loan_approve')).toBe(false);
  });
  it('lets an auditor read everything and change nothing', () => {
    expect(can('auditor', 'read')).toBe(true);
    expect(can('auditor', 'reports')).toBe(true);
    const writes: Permission[] = ['members_write', 'savings_post', 'withdraw_approve', 'products_write', 'loan_apply', 'loan_appraise', 'loan_approve', 'loan_disburse', 'loan_repay', 'loan_writeoff', 'penalties_run', 'recon', 'intake', 'journal_post', 'accounts_write', 'returns', 'settings', 'team_write', 'branches_write', 'billing'];
    for (const p of writes) expect(can('auditor', p), p).toBe(false);
  });
  it('gives the owner everything', () => {
    for (const p of ['read', 'loan_approve', 'billing', 'settings', 'journal_post', 'branches_write'] as Permission[]) expect(can('owner', p)).toBe(true);
  });
  it('lets a manager create staff below them, never a manager or an owner', () => {
    expect(canGrantRole('manager', 'teller')).toBe(true);
    expect(canGrantRole('manager', 'manager')).toBe(false);
    expect(canGrantRole('manager', 'owner')).toBe(false);
    expect(canGrantRole('owner', 'owner')).toBe(false);
    expect(canGrantRole('owner', 'manager')).toBe(true);
    expect(canGrantRole('teller', 'teller')).toBe(false);
  });
  it('knows exactly six roles', () => {
    expect([...ROLES].sort()).toEqual(['accountant', 'auditor', 'loan_officer', 'manager', 'owner', 'teller']);
  });
});

const CONFIG: BillingConfig = {
  saccoSmallCents: 3_500_00, saccoMediumCents: 6_000_00, saccoExtraPer1000Cents: 1_000_00, saccoSmallMaxMembers: 500, saccoMediumMaxMembers: 3000,
  lenderCents: 10_000_00, lenderIncludedBorrowers: 2000, lenderExtraPer1000Cents: 2_000_00, trialDays: 14, issueLeadDays: 3, suspendAfterDays: 14
};

describe('pricing (provisional tiers)', () => {
  it('prices a small SACCO, a medium one, and a large one with the per-thousand step', () => {
    expect(quote('sacco', 120, CONFIG)).toMatchObject({ planCode: 'sacco-small', amountCents: 3_500_00 });
    expect(quote('sacco', 500, CONFIG).planCode).toBe('sacco-small');
    expect(quote('sacco', 501, CONFIG)).toMatchObject({ planCode: 'sacco-medium', amountCents: 6_000_00 });
    expect(quote('sacco', 3000, CONFIG).planCode).toBe('sacco-medium');
    expect(quote('sacco', 3001, CONFIG)).toMatchObject({ planCode: 'sacco-large', amountCents: 7_000_00 });
    expect(quote('sacco', 5000, CONFIG).amountCents).toBe(8_000_00);
    expect(quote('sacco', 5001, CONFIG).amountCents).toBe(9_000_00);
  });
  it('prices a lender flat up to its included borrowers, then per thousand', () => {
    expect(quote('lender', 50, CONFIG)).toMatchObject({ planCode: 'lender', amountCents: 10_000_00 });
    expect(quote('lender', 2000, CONFIG).amountCents).toBe(10_000_00);
    expect(quote('lender', 2001, CONFIG)).toMatchObject({ planCode: 'lender-large', amountCents: 12_000_00 });
  });
  it('never bills for nothing, and an agreed price overrides the tiers', () => {
    expect(quote('sacco', 0, CONFIG).unitCount).toBe(1);
    expect(quote('sacco', 4000, CONFIG, 4_200_00)).toMatchObject({ planCode: 'custom', amountCents: 4_200_00 });
  });
});

describe('subscription state', () => {
  const now = new Date('2026-10-03T00:00:00Z');
  it('is trial, then active once paid, then past due, then suspended read-only', () => {
    const sub = (over: object) => ({ status: 'trial' as const, trialEndsAt: new Date('2026-10-10T00:00:00Z'), currentPeriodEnd: null, ...over });
    expect(effectiveStatus(sub({}), now, CONFIG)).toBe('trial');
    expect(effectiveStatus(sub({ currentPeriodEnd: new Date('2026-11-10T00:00:00Z') }), new Date('2026-10-20T00:00:00Z'), CONFIG)).toBe('active');
    expect(effectiveStatus(sub({}), new Date('2026-10-15T00:00:00Z'), CONFIG)).toBe('past_due');
    const late = effectiveStatus(sub({}), new Date('2026-12-01T00:00:00Z'), CONFIG);
    expect(late).toBe('suspended');
    expect(writesAllowed(late)).toBe(false);
    expect(writesAllowed('past_due')).toBe(true);
  });
  it('clamps month ends', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});

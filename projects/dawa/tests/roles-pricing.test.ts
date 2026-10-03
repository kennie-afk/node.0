import { describe, expect, it } from 'vitest';
import { can, canGrantRole, Permission, ROLES } from '../src/domain/roles';
import { BillingConfig, quote } from '../src/billing/pricing';

describe('who may do what', () => {
  it('lets a cashier sell and take payment but not dispense, void, discount, adjust, close the day or see reports', () => {
    expect(can('cashier', 'sell')).toBe(true);
    for (const p of ['dispense', 'controlled', 'void_sale', 'discount', 'adjust_stock', 'day_close', 'reports', 'billing', 'return_sale'] as Permission[]) {
      expect(can('cashier', p)).toBe(false);
    }
  });
  it('lets a pharmacist dispense and handle controlled drugs but not void, discount, adjust or see billing', () => {
    expect(can('pharmacist', 'dispense')).toBe(true);
    expect(can('pharmacist', 'controlled')).toBe(true);
    expect(can('pharmacist', 'receive_stock')).toBe(true);
    for (const p of ['void_sale', 'discount', 'adjust_stock', 'day_close', 'billing'] as Permission[]) expect(can('pharmacist', p)).toBe(false);
  });
  it('keeps billing and branch changes with the owner alone', () => {
    expect(can('owner', 'billing')).toBe(true);
    expect(can('manager', 'billing')).toBe(false);
    expect(can('owner', 'branches_write')).toBe(true);
    expect(can('manager', 'branches_write')).toBe(false);
  });
  it('gives the owner every permission and an unknown role none', () => {
    const everything: Permission[] = ['sell', 'dispense', 'controlled', 'receive_stock', 'adjust_stock', 'stocktake_count', 'stocktake_approve', 'catalogue_write', 'suppliers', 'customers_write', 'void_sale', 'discount', 'return_sale', 'day_close', 'reports', 'team_write', 'branches_write', 'billing'];
    for (const p of everything) expect(can('owner', p)).toBe(true);
    for (const p of everything) expect(can('intruder', p)).toBe(false);
    expect(ROLES).toHaveLength(4);
  });
  it('lets nobody grant a role above their own', () => {
    expect(canGrantRole('owner', 'manager')).toBe(true);
    expect(canGrantRole('owner', 'owner')).toBe(false);
    expect(canGrantRole('manager', 'cashier')).toBe(true);
    expect(canGrantRole('manager', 'manager')).toBe(false);
    expect(canGrantRole('manager', 'owner')).toBe(false);
    expect(canGrantRole('pharmacist', 'cashier')).toBe(false);
    expect(canGrantRole('cashier', 'cashier')).toBe(false);
  });
});

const CONFIG: BillingConfig = { firstBranchCents: 450_000, extraBranchCents: 350_000, trialDays: 14, issueLeadDays: 3, suspendAfterDays: 14 };

describe('Dawa pricing (provisional amounts)', () => {
  it('charges KES 4,500 for one branch', () => {
    expect(quote(1, CONFIG)).toMatchObject({ planCode: 'single', amountCents: 450_000 });
  });
  it('charges KES 4,500 for the first branch and KES 3,500 for each additional one, up to five', () => {
    expect(quote(2, CONFIG)).toMatchObject({ planCode: 'multi', amountCents: 800_000 });
    expect(quote(5, CONFIG)).toMatchObject({ planCode: 'multi', amountCents: 450_000 + 4 * 350_000 });
  });
  it('treats six or more branches as custom: the additional-branch rate until an agreed price is set', () => {
    expect(quote(6, CONFIG)).toMatchObject({ planCode: 'custom', amountCents: 6 * 350_000 });
    expect(quote(6, CONFIG, 300_000)).toMatchObject({ unitCents: 300_000, amountCents: 1_800_000 });
  });
  it('ignores an agreed price below the custom tier and never bills for zero branches', () => {
    expect(quote(1, CONFIG, 1).amountCents).toBe(450_000);
    expect(quote(3, CONFIG, 1).amountCents).toBe(450_000 + 2 * 350_000);
    expect(quote(0, CONFIG).branchCount).toBe(1);
  });
  it('keeps money in whole cents', () => {
    for (const n of [1, 2, 3, 7, 40]) expect(Number.isInteger(quote(n, CONFIG).amountCents)).toBe(true);
  });
});

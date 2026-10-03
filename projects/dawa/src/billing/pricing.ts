/**
 * What Dawa charges for itself. Pure, so every rule is testable without a database.
 *
 * PROVISIONAL: the amounts come from configuration (BILLING_PRICE_*), defaulting to KES 4,500 a month for the
 * first branch and KES 3,500 a month for each additional branch. Money is whole cents throughout.
 */
export interface BillingConfig {
  firstBranchCents: number;
  extraBranchCents: number;
  trialDays: number;
  issueLeadDays: number;
  suspendAfterDays: number;
}

export type PlanCode = 'single' | 'multi' | 'custom';

export interface Quote {
  planCode: PlanCode;
  branchCount: number;
  /** the price of the first branch, or the agreed per-branch price on a custom plan */
  unitCents: number;
  amountCents: number;
}

/** Up to this many branches the list price applies; beyond it the price is agreed, so list price is only the default. */
export const LIST_PRICE_MAX_BRANCHES = 5;

/** One branch is the minimum billed: an organisation that exists is never invoiced for nothing. */
export function quote(branchCount: number, config: BillingConfig, overrideUnitCents: number | null = null): Quote {
  const branches = Math.max(1, Math.floor(branchCount));
  if (branches === 1) {
    return { planCode: 'single', branchCount: 1, unitCents: config.firstBranchCents, amountCents: config.firstBranchCents };
  }
  if (branches <= LIST_PRICE_MAX_BRANCHES) {
    return {
      planCode: 'multi',
      branchCount: branches,
      unitCents: config.extraBranchCents,
      amountCents: config.firstBranchCents + (branches - 1) * config.extraBranchCents
    };
  }
  const unit = overrideUnitCents ?? config.extraBranchCents;
  return { planCode: 'custom', branchCount: branches, unitCents: unit, amountCents: unit * branches };
}

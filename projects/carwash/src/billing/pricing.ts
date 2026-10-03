/**
 * What Forecourt charges for itself. Pure, so every rule is testable without a database.
 *
 * PROVISIONAL: the amounts come from configuration (BILLING_PRICE_*), defaulting to what the public
 * pricing page says: one site KES 3,500 a month, two to five sites KES 3,000 each, six or more by
 * agreement. Money is whole cents throughout.
 */
export interface BillingConfig {
  starterCents: number;
  growthCents: number;
  growthMaxSites: number;
  trialDays: number;
  issueLeadDays: number;
  suspendAfterDays: number;
}

export type PlanCode = 'starter' | 'growth' | 'custom';

export interface Quote {
  planCode: PlanCode;
  siteCount: number;
  unitCents: number;
  amountCents: number;
}

/** One site is the minimum billed: an organisation that exists is never invoiced for nothing. */
export function quote(siteCount: number, config: BillingConfig, overrideUnitCents: number | null = null): Quote {
  const sites = Math.max(1, Math.floor(siteCount));
  let planCode: PlanCode;
  let unitCents: number;

  if (sites === 1) {
    planCode = 'starter';
    unitCents = config.starterCents;
  } else if (sites <= config.growthMaxSites) {
    planCode = 'growth';
    unitCents = config.growthCents;
  } else {
    planCode = 'custom';
    unitCents = config.growthCents;
  }

  if (overrideUnitCents !== null && planCode === 'custom') {
    unitCents = overrideUnitCents;
  }
  return { planCode, siteCount: sites, unitCents, amountCents: unitCents * sites };
}

/**
 * What Sojaa charges for itself. Pure, so every rule is testable without a database.
 *
 * PROVISIONAL: every amount comes from configuration (BILLING_*). Defaults, whole shillings:
 *
 *   KES 200 per active guard per month, with a minimum of KES 3,000 a month (the minimum applies up to 15 guards).
 *
 * The research priced this at about KES 150-250 per guard (an estimate; no Kenyan guard-software price exists to check it against).
 * Money is whole cents throughout. An organisation is billed for its ACTIVE guards on the day the invoice is issued.
 */
export interface BillingConfig {
  perGuardCents: number;
  minimumCents: number;
  trialDays: number;
  issueLeadDays: number;
  suspendAfterDays: number;
}

export type PlanCode = 'per-guard' | 'minimum' | 'custom';

export interface Quote {
  planCode: PlanCode;
  unitCount: number;
  /** the price of one guard for a month, or the agreed monthly total on a custom plan */
  unitCents: number;
  amountCents: number;
}

export function quote(guards: number, config: BillingConfig, overrideCents: number | null = null): Quote {
  const count = Math.max(0, Math.floor(guards));
  if (overrideCents !== null) return { planCode: 'custom', unitCount: count, unitCents: overrideCents, amountCents: overrideCents };
  const metered = count * config.perGuardCents;
  if (metered < config.minimumCents) return { planCode: 'minimum', unitCount: count, unitCents: config.perGuardCents, amountCents: config.minimumCents };
  return { planCode: 'per-guard', unitCount: count, unitCents: config.perGuardCents, amountCents: metered };
}

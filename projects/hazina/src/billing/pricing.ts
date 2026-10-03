/**
 * What Hazina charges for itself. Pure, so every rule is testable without a database.
 *
 * PROVISIONAL: every amount and every size limit comes from configuration (BILLING_*). Defaults, whole shillings a month:
 *
 *   SACCO    up to 500 active members      3,500
 *            up to 3,000 active members    6,000
 *            beyond that                   6,000 plus 1,000 for each further 1,000 members (or part of 1,000)
 *   Lender   up to 2,000 active borrowers  10,000
 *            beyond that                   10,000 plus 2,000 for each further 1,000 borrowers (or part of 1,000)
 *
 * Money is whole cents throughout. An organisation is billed for its ACTIVE members or borrowers on the day the invoice
 * is issued, at least one, so an organisation that exists is never invoiced for nothing.
 */
export type OrgKind = 'sacco' | 'lender';

export interface BillingConfig {
  saccoSmallCents: number;
  saccoMediumCents: number;
  saccoExtraPer1000Cents: number;
  saccoSmallMaxMembers: number;
  saccoMediumMaxMembers: number;
  lenderCents: number;
  lenderIncludedBorrowers: number;
  lenderExtraPer1000Cents: number;
  trialDays: number;
  issueLeadDays: number;
  suspendAfterDays: number;
}

export type PlanCode = 'sacco-small' | 'sacco-medium' | 'sacco-large' | 'lender' | 'lender-large' | 'custom';

export interface Quote {
  planCode: PlanCode;
  unitCount: number;
  /** the flat price of the tier, or the agreed price on a custom plan */
  unitCents: number;
  amountCents: number;
}

const thousandsOver = (count: number, included: number) => Math.ceil(Math.max(0, count - included) / 1000);

export function quote(kind: OrgKind, units: number, config: BillingConfig, overrideCents: number | null = null): Quote {
  const count = Math.max(1, Math.floor(units));
  if (overrideCents !== null) return { planCode: 'custom', unitCount: count, unitCents: overrideCents, amountCents: overrideCents };
  if (kind === 'lender') {
    if (count <= config.lenderIncludedBorrowers) return { planCode: 'lender', unitCount: count, unitCents: config.lenderCents, amountCents: config.lenderCents };
    return {
      planCode: 'lender-large', unitCount: count, unitCents: config.lenderCents,
      amountCents: config.lenderCents + thousandsOver(count, config.lenderIncludedBorrowers) * config.lenderExtraPer1000Cents
    };
  }
  if (count <= config.saccoSmallMaxMembers) return { planCode: 'sacco-small', unitCount: count, unitCents: config.saccoSmallCents, amountCents: config.saccoSmallCents };
  if (count <= config.saccoMediumMaxMembers) return { planCode: 'sacco-medium', unitCount: count, unitCents: config.saccoMediumCents, amountCents: config.saccoMediumCents };
  return {
    planCode: 'sacco-large', unitCount: count, unitCents: config.saccoMediumCents,
    amountCents: config.saccoMediumCents + thousandsOver(count, config.saccoMediumMaxMembers) * config.saccoExtraPer1000Cents
  };
}

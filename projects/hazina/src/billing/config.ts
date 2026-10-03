import { env } from '../config/env';
import { BillingConfig } from './pricing';

export function billingConfig(): BillingConfig {
  return {
    saccoSmallCents: env.BILLING_PRICE_SACCO_SMALL_KES * 100,
    saccoMediumCents: env.BILLING_PRICE_SACCO_MEDIUM_KES * 100,
    saccoExtraPer1000Cents: env.BILLING_PRICE_SACCO_EXTRA_PER_1000_KES * 100,
    saccoSmallMaxMembers: env.BILLING_SACCO_SMALL_MAX_MEMBERS,
    saccoMediumMaxMembers: env.BILLING_SACCO_MEDIUM_MAX_MEMBERS,
    lenderCents: env.BILLING_PRICE_LENDER_KES * 100,
    lenderIncludedBorrowers: env.BILLING_LENDER_INCLUDED_BORROWERS,
    lenderExtraPer1000Cents: env.BILLING_PRICE_LENDER_EXTRA_PER_1000_KES * 100,
    trialDays: env.BILLING_TRIAL_DAYS,
    issueLeadDays: env.BILLING_ISSUE_LEAD_DAYS,
    suspendAfterDays: env.BILLING_SUSPEND_AFTER_DAYS
  };
}

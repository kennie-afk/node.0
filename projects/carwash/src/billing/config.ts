import { env } from '../config/env';
import { BillingConfig } from './pricing';

export function billingConfig(): BillingConfig {
  return {
    starterCents: env.BILLING_PRICE_STARTER_KES * 100,
    growthCents: env.BILLING_PRICE_GROWTH_KES * 100,
    growthMaxSites: env.BILLING_GROWTH_MAX_SITES,
    trialDays: env.BILLING_TRIAL_DAYS,
    issueLeadDays: env.BILLING_ISSUE_LEAD_DAYS,
    suspendAfterDays: env.BILLING_SUSPEND_AFTER_DAYS
  };
}

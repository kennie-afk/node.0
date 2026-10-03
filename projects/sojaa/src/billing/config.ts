import { env } from '../config/env';
import { BillingConfig } from './pricing';

export function billingConfig(): BillingConfig {
  return {
    perGuardCents: env.BILLING_PRICE_PER_GUARD_KES * 100,
    minimumCents: env.BILLING_MINIMUM_KES * 100,
    trialDays: env.BILLING_TRIAL_DAYS,
    issueLeadDays: env.BILLING_ISSUE_LEAD_DAYS,
    suspendAfterDays: env.BILLING_SUSPEND_AFTER_DAYS
  };
}

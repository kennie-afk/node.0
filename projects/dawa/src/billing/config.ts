import { env } from '../config/env';
import { BillingConfig } from './pricing';

export function billingConfig(): BillingConfig {
  return {
    firstBranchCents: env.BILLING_PRICE_FIRST_BRANCH_KES * 100,
    extraBranchCents: env.BILLING_PRICE_EXTRA_BRANCH_KES * 100,
    trialDays: env.BILLING_TRIAL_DAYS,
    issueLeadDays: env.BILLING_ISSUE_LEAD_DAYS,
    suspendAfterDays: env.BILLING_SUSPEND_AFTER_DAYS
  };
}

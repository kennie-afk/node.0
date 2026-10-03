/**
 * Sojaa takes M-Pesa money in one place only: its own subscription, on its own shortcode (see billing/service.ts).
 * A confirmation for any other shortcode is logged and ignored: firms' guards are paid by the firm, not through Sojaa,
 * and Sojaa holds and moves no money for its customers.
 */
import { normaliseConfirmation } from './daraja';
import { ingestBillingPayment, payShortcode } from '../billing/service';
import { logger } from '../common/logger';

export interface IngestOutcome {
  billing: boolean;
  matched: boolean;
  duplicate: boolean;
}

export async function ingestConfirmation(raw: unknown): Promise<IngestOutcome | null> {
  const payment = normaliseConfirmation(raw);
  const billingShortcode = payShortcode();
  if (billingShortcode && payment.shortCode === billingShortcode) {
    const billed = await ingestBillingPayment(payment);
    logger.info('billing payment ingested', { matched: billed.matched, duplicate: billed.duplicate });
    return { billing: true, ...billed };
  }
  logger.warn('M-Pesa confirmation for an unknown shortcode ignored', { shortCode: payment.shortCode });
  return null;
}

/**
 * Sojaa takes M-Pesa money in one place only: its own subscription, on its own shortcode (see billing/service.ts).
 * A confirmation for any other shortcode is not applied to anything (firms' guards are paid by the firm, not through
 * Sojaa, and Sojaa holds and moves no money for its customers), but it is kept in mpesa_unclaimed rather than dropped,
 * because a misdirected payment is still somebody's money and Daraja will not send it twice.
 */
import { withoutTenant } from '../persistence/pool';
import { normaliseConfirmation, type NormalisedPayment } from './daraja';
import { ingestBillingPayment, payShortcode } from '../billing/service';
import { logger } from '../common/logger';

export interface IngestOutcome {
  billing: boolean;
  matched: boolean;
  duplicate: boolean;
}

async function keepUnclaimed(payment: NormalisedPayment, raw: unknown): Promise<void> {
  await withoutTenant(async (client) => {
    await client.query(
      `INSERT INTO mpesa_unclaimed (short_code, external_ref, amount_cents, payer_msisdn, bill_ref, received_at, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (external_ref) DO NOTHING`,
      [payment.shortCode, payment.externalRef, payment.amountCents, payment.payerMsisdn, payment.reference || null, payment.receivedAt, JSON.stringify(raw)]
    );
  });
}

export async function ingestConfirmation(raw: unknown): Promise<IngestOutcome | null> {
  const payment = normaliseConfirmation(raw);
  const billingShortcode = payShortcode();
  if (billingShortcode && payment.shortCode === billingShortcode) {
    const billed = await ingestBillingPayment(payment);
    logger.info('billing payment ingested', { matched: billed.matched, duplicate: billed.duplicate });
    return { billing: true, ...billed };
  }
  // The money is real and Daraja will not send it again, so keep it for an operator instead of dropping it.
  await keepUnclaimed(payment, raw);
  logger.warn('M-Pesa confirmation for an unknown shortcode kept for an operator', { shortCode: payment.shortCode, externalRef: payment.externalRef });
  return null;
}

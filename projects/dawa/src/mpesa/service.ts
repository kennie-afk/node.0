import { withOrg, withoutTenant } from '../persistence/pool';
import { normaliseConfirmation } from './daraja';
import { logger } from '../common/logger';
import { ingestBillingPayment, payShortcode } from '../billing/service';
import { applyMpesaConfirmation } from '../sales/service';

export interface IngestOutcome {
  matched: boolean;
  duplicate: boolean;
  saleId: string | null;
}

/**
 * One entry point for every M-Pesa confirmation Daraja delivers. Money paid to Dawa itself (a subscription) arrives on
 * Dawa's own shortcode and is handled by billing, checked first so no branch's till can ever shadow it. Anything else
 * is looked up by till number and applied to that branch's sales. A payment for an unknown till is logged and dropped
 * (there is nobody to hold it for); one for a known till that matches no sale is kept for the manager to assign.
 */
export async function ingestConfirmation(raw: unknown): Promise<IngestOutcome | null> {
  const payment = normaliseConfirmation(raw);

  const billingShortcode = payShortcode();
  if (billingShortcode && payment.shortCode === billingShortcode) {
    const billed = await ingestBillingPayment(payment);
    logger.info('billing payment ingested', { matched: billed.matched, duplicate: billed.duplicate });
    return null;
  }

  const till = await withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT org_id, branch_id FROM resolve_till($1)', [payment.shortCode]);
    return rows[0] as { org_id: string; branch_id: string } | undefined;
  });
  if (!till) {
    logger.warn('payment for an unknown till', { shortCode: payment.shortCode });
    return null;
  }

  const outcome = await withOrg(till.org_id, (client) =>
    applyMpesaConfirmation(client, till.org_id, till.branch_id, {
      externalRef: payment.externalRef,
      amountCents: payment.amountCents,
      payerMsisdn: payment.payerMsisdn,
      receivedAt: payment.receivedAt,
      reference: payment.reference
    })
  );
  logger.info('till payment ingested', { matched: outcome.matched, duplicate: outcome.duplicate });
  return outcome;
}

import { withoutTenant, withOrg } from '../persistence/pool';
import { insertPayment, openJobsForMatching, recordJobEvent, transitionJob } from '../persistence/repositories';
import { normaliseConfirmation } from './daraja';
import { matchPaymentToJob } from './matching';
import { logger } from '../common/logger';
import { ingestBillingPayment, payShortcode } from '../billing/service';

export interface IngestOutcome {
  paymentId: string;
  duplicate: boolean;
  matchedJobId: string | null;
  confidence: string;
}

async function resolveTill(shortCode: string): Promise<{ orgId: string; siteId: string } | null> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query(`SELECT org_id, site_id FROM resolve_till($1)`, [
      shortCode
    ]);
    const row = rows[0];
    return row ? { orgId: row.org_id, siteId: row.site_id } : null;
  });
}

export async function ingestConfirmation(raw: unknown): Promise<IngestOutcome | null> {
  const payment = normaliseConfirmation(raw);

  // Money paid to Forecourt itself (a subscription) arrives on Forecourt's own shortcode, through
  // this same callback. It is checked first so that no tenant's till can ever shadow it.
  const billingShortcode = payShortcode();
  if (billingShortcode && payment.shortCode === billingShortcode) {
    const billed = await ingestBillingPayment(payment);
    logger.info('billing payment ingested', { matched: billed.matched, duplicate: billed.duplicate });
    return null;
  }
  const till = await resolveTill(payment.shortCode);

  if (!till) {
    logger.warn('payment for an unknown till', { shortCode: payment.shortCode });
    return null;
  }

  return withOrg(till.orgId, async (client) => {
    const candidates = await openJobsForMatching(client, till.siteId);
    const match = matchPaymentToJob(
      {
        amountCents: payment.amountCents,
        reference: payment.reference,
        receivedAt: payment.receivedAt
      },
      candidates
    );

    const stored = await insertPayment(client, {
      orgId: till.orgId,
      siteId: till.siteId,
      jobId: match.jobId,
      channel: 'mpesa',
      amountCents: payment.amountCents,
      externalRef: payment.externalRef,
      payerMsisdn: payment.payerMsisdn,
      receivedAt: payment.receivedAt
    });

    if (stored.created && match.jobId) {
      await recordJobEvent(client, {
        orgId: till.orgId,
        jobId: match.jobId,
        type: 'job.payment_matched',
        actorId: null,
        payload: {
          paymentId: stored.id,
          confidence: match.confidence,
          reason: match.reason,
          amountCents: payment.amountCents
        },
        clientTs: null
      });
      await transitionJob(client, match.jobId, 'paid');
    }

    return {
      paymentId: stored.id,
      duplicate: !stored.created,
      matchedJobId: match.jobId,
      confidence: match.confidence
    };
  });
}

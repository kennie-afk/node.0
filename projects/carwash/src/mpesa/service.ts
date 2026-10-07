import { withoutTenant, withOrg } from '../persistence/pool';
import { insertPayment, openJobsForMatching, recordJobEvent, transitionJob } from '../persistence/repositories';
import { normaliseConfirmation, type NormalisedPayment } from './daraja';
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
    // Nobody to attach it to yet, but the money is real and Daraja will not send it again. Keep it so an
    // operator can hand it to the right organisation once its till is registered.
    await keepUnclaimed(payment, raw);
    logger.warn('payment for an unknown till kept for an operator', { shortCode: payment.shortCode, externalRef: payment.externalRef });
    return null;
  }

  return recordTillPayment(till, payment);
}

/**
 * Stores a confirmed payment under a till's organisation and, when exactly one open job fits, matches it.
 * Idempotent on the M-Pesa transaction id, which is what lets both a Daraja retry and an operator re-running
 * `unclaimed:assign` land safely.
 */
export async function recordTillPayment(till: { orgId: string; siteId: string }, payment: NormalisedPayment): Promise<IngestOutcome> {
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

/**
 * Forecourt's own subscription billing: the trial, invoices, and collection through the existing
 * Daraja confirmation path. Every function that touches a tenant runs through `withOrg`, so row-level
 * security confines it; the only cross-tenant reads are two SECURITY DEFINER lookups that return an
 * organisation id and nothing else.
 *
 * Collection: the owner pays Forecourt's paybill with their account number (`billing_ref`). Daraja
 * calls the same confirmation webhook the car-wash tills use, with Forecourt's own shortcode, and
 * `ingestConfirmation` hands those to `ingestBillingPayment`. No STK push is involved. A callback
 * delivered twice is applied once, because the M-Pesa transaction id is unique.
 */
import { PoolClient } from 'pg';
import { randomInt } from 'node:crypto';
import { withOrg, withoutTenant } from '../persistence/pool';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { ConflictError, NotFoundError } from '../domain/errors';
import { NormalisedPayment } from '../mpesa/daraja';
import { sendMessage } from '../notify/provider';
import { formatKsh, Cents } from '../domain/money';
import { BillingConfig, quote, Quote } from './pricing';
import { billingConfig } from './config';
import { normaliseBillingRef } from './ref';
import {
  addDays,
  coverageAfterPayment,
  coveredUntil,
  effectiveStatus,
  nextInvoiceWindow,
  SubscriptionFacts,
  SubscriptionStatus,
  writesAllowed
} from './state';

export interface SubscriptionRow extends SubscriptionFacts {
  orgId: string;
  billingRef: string;
  creditCents: number;
  unitPriceOverrideCents: number | null;
}

function toRow(row: Record<string, any>): SubscriptionRow {
  return {
    orgId: row.org_id,
    status: row.status,
    trialEndsAt: row.trial_ends_at,
    currentPeriodEnd: row.current_period_end,
    billingRef: row.billing_ref,
    creditCents: Number(row.credit_cents),
    unitPriceOverrideCents: row.unit_price_override_cents === null ? null : Number(row.unit_price_override_cents)
  };
}

function newBillingRef(): string {
  return `FC${String(randomInt(100_000, 1_000_000))}`;
}

/** Used while provisioning, inside the new organisation's own transaction. */
export async function createSubscription(client: PoolClient, orgId: string, now: Date = new Date(), config: BillingConfig = billingConfig()): Promise<SubscriptionRow> {
  const trialEnds = addDays(now, config.trialDays);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { rows } = await client.query(
      `INSERT INTO subscriptions (org_id, status, trial_ends_at, billing_ref)
       VALUES ($1, 'trial', $2, $3) ON CONFLICT DO NOTHING RETURNING *`,
      [orgId, trialEnds, newBillingRef()]
    );
    if (rows[0]) return toRow(rows[0]);
    const existing = await client.query('SELECT * FROM subscriptions WHERE org_id = $1', [orgId]);
    if (existing.rows[0]) return toRow(existing.rows[0]);
    // otherwise the random account number collided with another organisation's: draw again
  }
  throw new Error('could not allocate a billing account number');
}

async function loadSubscription(client: PoolClient, orgId: string, lock: boolean): Promise<SubscriptionRow> {
  const { rows } = await client.query(`SELECT * FROM subscriptions WHERE org_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [orgId]);
  if (rows[0]) return toRow(rows[0]);
  // An organisation older than billing, or one the migration could not see: it starts its trial now.
  await createSubscription(client, orgId);
  const again = await client.query(`SELECT * FROM subscriptions WHERE org_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [orgId]);
  return toRow(again.rows[0]);
}

async function billableSites(client: PoolClient): Promise<number> {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM sites WHERE NOT is_demo');
  return rows[0].n;
}

async function mirrorStatus(client: PoolClient, sub: SubscriptionRow, now: Date, config: BillingConfig): Promise<SubscriptionStatus> {
  const status = effectiveStatus(sub, now, config);
  if (status !== sub.status) {
    await client.query('UPDATE subscriptions SET status = $2, updated_at = now() WHERE org_id = $1', [sub.orgId, status]);
    logger.info('subscription status changed', { orgId: sub.orgId, from: sub.status, to: status });
  }
  return status;
}

async function paidSoFar(client: PoolClient, invoiceId: string): Promise<number> {
  const { rows } = await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS paid FROM billing_payments WHERE invoice_id = $1', [invoiceId]);
  return Number(rows[0].paid);
}

/** Marks an invoice paid if it is covered, moves coverage forward, and banks any excess as credit. */
async function settleInvoice(client: PoolClient, sub: SubscriptionRow, invoice: Record<string, any>, paidAt: Date, config: BillingConfig, now: Date): Promise<boolean> {
  const paid = await paidSoFar(client, invoice.id);
  const amount = Number(invoice.amount_cents);
  if (paid < amount) return false;

  const periodEnd = coverageAfterPayment({ periodStart: invoice.period_start, periodEnd: invoice.period_end }, paidAt);
  await client.query(`UPDATE invoices SET status = 'paid', paid_at = $2 WHERE id = $1 AND status = 'open'`, [invoice.id, paidAt]);
  await client.query(
    `UPDATE subscriptions SET current_period_end = $2, credit_cents = credit_cents + $3, updated_at = now() WHERE org_id = $1`,
    [sub.orgId, periodEnd, paid - amount]
  );
  await mirrorStatus(client, { ...sub, currentPeriodEnd: periodEnd }, now, config);
  return true;
}

export interface IssuedInvoice {
  id: string;
  number: string;
  amountCents: number;
  periodStart: Date;
  periodEnd: Date;
}

/** Issues the invoice that is due, if any. Idempotent: (org, period) is unique, so a rerun does nothing. */
export async function issueDueInvoice(client: PoolClient, orgId: string, now: Date, config: BillingConfig = billingConfig()): Promise<IssuedInvoice | null> {
  const sub = await loadSubscription(client, orgId, true);
  const window = nextInvoiceWindow(sub, now, config);
  if (!window) {
    await mirrorStatus(client, sub, now, config);
    return null;
  }

  // Check first: a sequence value is consumed even by an insert that conflicts, and invoice numbers
  // must not gain a gap every time the runner passes. The subscription row is locked, so nothing can
  // slip in between this check and the insert.
  const existing = await client.query('SELECT 1 FROM invoices WHERE period_start = $1', [window.periodStart]);
  if (existing.rows.length > 0) {
    await mirrorStatus(client, sub, now, config);
    return null;
  }

  const priced: Quote = quote(await billableSites(client), config, sub.unitPriceOverrideCents);
  const { rows } = await client.query(
    `INSERT INTO invoices (org_id, number, period_start, period_end, site_count, plan_code, unit_price_cents, amount_cents, status, issued_at)
     VALUES ($1, 'FC-' || to_char($8::timestamptz, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0'),
             $2, $3, $4, $5, $6, $7, 'open', $8)
     ON CONFLICT (org_id, period_start) DO NOTHING RETURNING *`,
    [orgId, window.periodStart, window.periodEnd, priced.siteCount, priced.planCode, priced.unitCents, priced.amountCents, now]
  );
  if (!rows[0]) {
    await mirrorStatus(client, sub, now, config);
    return null;
  }
  const invoice = rows[0];

  // Credit left over from an earlier overpayment or a payment made before an invoice existed.
  if (sub.creditCents > 0) {
    const applied = Math.min(sub.creditCents, Number(invoice.amount_cents));
    await client.query(
      `INSERT INTO billing_payments (org_id, invoice_id, channel, amount_cents, external_ref, received_at)
       VALUES ($1, $2, 'credit', $3, $4, $5)`,
      [orgId, invoice.id, applied, `credit:${invoice.id}`, now]
    );
    await client.query('UPDATE subscriptions SET credit_cents = credit_cents - $2, updated_at = now() WHERE org_id = $1', [orgId, applied]);
    sub.creditCents -= applied;
    await settleInvoice(client, sub, invoice, now, config, now);
  } else {
    await mirrorStatus(client, sub, now, config);
  }

  logger.info('invoice issued', { orgId, number: invoice.number, amountCents: Number(invoice.amount_cents) });
  return {
    id: invoice.id,
    number: invoice.number,
    amountCents: Number(invoice.amount_cents),
    periodStart: invoice.period_start,
    periodEnd: invoice.period_end
  };
}

export interface PaymentOutcome {
  duplicate: boolean;
  invoiceId: string | null;
  invoicePaid: boolean;
  status: SubscriptionStatus;
}

export interface PaymentInput {
  externalRef: string;
  amountCents: number;
  payerMsisdn: string | null;
  receivedAt: Date;
  channel: 'mpesa' | 'manual';
}

/** Applies one payment to the oldest open invoice (or banks it as credit). Safe to call twice with the same ref. */
export async function applyPayment(client: PoolClient, orgId: string, input: PaymentInput, now: Date = new Date(), config: BillingConfig = billingConfig()): Promise<PaymentOutcome> {
  const sub = await loadSubscription(client, orgId, true);

  const open = await client.query(`SELECT * FROM invoices WHERE status = 'open' ORDER BY period_start LIMIT 1`);
  const invoice = open.rows[0] ?? null;

  const inserted = await client.query(
    `INSERT INTO billing_payments (org_id, invoice_id, channel, amount_cents, external_ref, payer_msisdn, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (external_ref) DO NOTHING RETURNING id`,
    [orgId, invoice?.id ?? null, input.channel, input.amountCents, input.externalRef, input.payerMsisdn, input.receivedAt]
  );
  if (!inserted.rows[0]) {
    return { duplicate: true, invoiceId: invoice?.id ?? null, invoicePaid: false, status: effectiveStatus(sub, now, config) };
  }

  if (!invoice) {
    await client.query('UPDATE subscriptions SET credit_cents = credit_cents + $2, updated_at = now() WHERE org_id = $1', [orgId, input.amountCents]);
    logger.info('billing payment banked as credit', { orgId, amountCents: input.amountCents });
    return { duplicate: false, invoiceId: null, invoicePaid: false, status: effectiveStatus(sub, now, config) };
  }

  const settled = await settleInvoice(client, sub, invoice, input.receivedAt, config, now);
  const after = await loadSubscription(client, orgId, false);
  return { duplicate: false, invoiceId: invoice.id, invoicePaid: settled, status: effectiveStatus(after, now, config) };
}

/**
 * The entry point for a Daraja confirmation on Forecourt's own shortcode. A payment whose account
 * number matches nobody is kept in unmatched_billing_payments for an operator to assign; it is never
 * dropped and never guessed at.
 */
export async function ingestBillingPayment(payment: NormalisedPayment): Promise<{ matched: boolean; duplicate: boolean }> {
  const ref = normaliseBillingRef(payment.reference);
  const orgId = await withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT org_id FROM resolve_billing_ref($1)', [ref]);
    return rows[0]?.org_id as string | undefined;
  });

  if (!orgId) {
    const { rowCount } = await withoutTenant((client) =>
      client.query(
        `INSERT INTO unmatched_billing_payments (external_ref, reference, amount_cents, payer_msisdn, received_at)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (external_ref) DO NOTHING`,
        [payment.externalRef, payment.reference, payment.amountCents, payment.payerMsisdn, payment.receivedAt]
      )
    );
    logger.warn('billing payment with an unknown account number kept for review', { externalRef: payment.externalRef });
    return { matched: false, duplicate: rowCount === 0 };
  }

  const outcome = await withOrg(orgId, (client) =>
    applyPayment(client, orgId, {
      externalRef: payment.externalRef,
      amountCents: payment.amountCents,
      payerMsisdn: payment.payerMsisdn,
      receivedAt: payment.receivedAt,
      channel: 'mpesa'
    })
  );
  return { matched: true, duplicate: outcome.duplicate };
}

export interface InvoiceView {
  id: string;
  number: string;
  periodStart: Date;
  periodEnd: Date;
  siteCount: number;
  planCode: string;
  amountCents: number;
  paidCents: number;
  status: string;
  issuedAt: Date;
}

export interface BillingView {
  mode: 'mock' | 'live';
  status: SubscriptionStatus;
  writesAllowed: boolean;
  trialEndsAt: Date;
  coveredUntil: Date;
  daysLeft: number;
  billingRef: string;
  billedSites: number;
  quote: Quote;
  creditCents: number;
  outstandingCents: number;
  pay: { shortcode: string; accountNumber: string; amountCents: number } | null;
  invoices: InvoiceView[];
}

export function payShortcode(): string | null {
  return env.BILLING_MODE === 'live' ? env.BILLING_SHORTCODE ?? null : 'MOCKPAYBILL';
}

export async function getBillingView(orgId: string, now: Date = new Date(), config: BillingConfig = billingConfig()): Promise<BillingView> {
  return withOrg(orgId, async (client) => {
    const sub = await loadSubscription(client, orgId, false);
    const status = effectiveStatus(sub, now, config);
    const sites = await billableSites(client);
    const priced = quote(sites, config, sub.unitPriceOverrideCents);

    const { rows } = await client.query(
      `SELECT i.*, COALESCE((SELECT sum(amount_cents) FROM billing_payments p WHERE p.invoice_id = i.id), 0)::bigint AS paid
         FROM invoices i ORDER BY i.issued_at DESC LIMIT 24`
    );
    const invoices: InvoiceView[] = rows.map((row) => ({
      id: row.id,
      number: row.number,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      siteCount: row.site_count,
      planCode: row.plan_code,
      amountCents: Number(row.amount_cents),
      paidCents: Number(row.paid),
      status: row.status,
      issuedAt: row.issued_at
    }));
    const outstanding = invoices.filter((inv) => inv.status === 'open').reduce((sum, inv) => sum + (inv.amountCents - inv.paidCents), 0);
    const shortcode = payShortcode();
    const covered = coveredUntil(sub);

    return {
      mode: env.BILLING_MODE,
      status,
      writesAllowed: writesAllowed(status),
      trialEndsAt: sub.trialEndsAt,
      coveredUntil: covered,
      daysLeft: Math.max(0, Math.ceil((covered.getTime() - now.getTime()) / 86_400_000)),
      billingRef: sub.billingRef,
      billedSites: priced.siteCount,
      quote: priced,
      creditCents: sub.creditCents,
      outstandingCents: outstanding,
      pay: shortcode && outstanding > 0 ? { shortcode, accountNumber: sub.billingRef, amountCents: outstanding } : null,
      invoices
    };
  });
}

/** What the write gate asks on every mutating request. One indexed read. */
export async function currentStatus(orgId: string, now: Date = new Date(), config: BillingConfig = billingConfig()): Promise<SubscriptionStatus> {
  return withOrg(orgId, async (client) => effectiveStatus(await loadSubscription(client, orgId, false), now, config));
}

export interface CycleResult {
  organisations: number;
  invoicesIssued: number;
  byStatus: Record<string, number>;
}

/** The periodic job: issue what is due, mirror statuses. Safe to run any number of times, from any replica. */
export async function runBillingCycle(now: Date = new Date(), config: BillingConfig = billingConfig()): Promise<CycleResult> {
  const orgIds = await withoutTenant(async (client) => (await client.query('SELECT org_id FROM billing_org_ids()')).rows.map((row) => row.org_id as string));
  const result: CycleResult = { organisations: orgIds.length, invoicesIssued: 0, byStatus: {} };

  for (const orgId of orgIds) {
    try {
      const { issued, status, phone, ref } = await withOrg(orgId, async (client) => {
        const issued = await issueDueInvoice(client, orgId, now, config);
        const sub = await loadSubscription(client, orgId, false);
        const owner = await client.query(`SELECT phone FROM users WHERE role = 'owner' AND status = 'active' AND NOT is_demo ORDER BY created_at LIMIT 1`);
        return { issued, status: effectiveStatus(sub, now, config), phone: owner.rows[0]?.phone as string | undefined, ref: sub.billingRef };
      });
      result.byStatus[status] = (result.byStatus[status] ?? 0) + 1;
      if (issued) {
        result.invoicesIssued += 1;
        if (phone) {
          const shortcode = payShortcode();
          const how = shortcode ? `Pay to ${shortcode}, account ${ref}.` : `Your account number is ${ref}.`;
          await sendMessage({
            to: phone,
            purpose: 'billing-reminder',
            body: `Forecourt invoice ${issued.number}: ${formatKsh(issued.amountCents as Cents)}. ${how}`
          });
        }
      }
    } catch (error) {
      logger.error('billing cycle failed for an organisation', { orgId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

// ---- operator tools -----------------------------------------------------------------------

export async function recordManualPayment(orgId: string, externalRef: string, amountCents: number, receivedAt: Date = new Date()): Promise<PaymentOutcome> {
  return withOrg(orgId, (client) => applyPayment(client, orgId, { externalRef, amountCents, payerMsisdn: null, receivedAt, channel: 'manual' }));
}

export async function listUnmatched(): Promise<Array<{ externalRef: string; reference: string; amountCents: number; payer: string | null; receivedAt: Date; assigned: boolean }>> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT * FROM unmatched_billing_payments ORDER BY received_at DESC LIMIT 100');
    return rows.map((row) => ({
      externalRef: row.external_ref,
      reference: row.reference,
      amountCents: Number(row.amount_cents),
      payer: row.payer_msisdn,
      receivedAt: row.received_at,
      assigned: row.assigned_org !== null
    }));
  });
}

export async function assignUnmatched(externalRef: string, orgId: string): Promise<PaymentOutcome> {
  const row = await withoutTenant(async (client) => (await client.query('SELECT * FROM unmatched_billing_payments WHERE external_ref = $1', [externalRef])).rows[0]);
  if (!row) throw new NotFoundError(`no unmatched payment ${externalRef}`);
  if (row.assigned_org) throw new ConflictError('that payment was already assigned');
  const outcome = await recordPaymentFor(orgId, row);
  await withoutTenant((client) => client.query('UPDATE unmatched_billing_payments SET assigned_org = $2 WHERE external_ref = $1', [externalRef, orgId]));
  return outcome;
}

async function recordPaymentFor(orgId: string, row: Record<string, any>): Promise<PaymentOutcome> {
  return withOrg(orgId, (client) =>
    applyPayment(client, orgId, {
      externalRef: row.external_ref,
      amountCents: Number(row.amount_cents),
      payerMsisdn: row.payer_msisdn,
      receivedAt: row.received_at,
      channel: 'manual'
    })
  );
}

export async function setUnitPriceOverride(orgId: string, unitCents: number | null): Promise<void> {
  await withOrg(orgId, async (client) => {
    await loadSubscription(client, orgId, false);
    await client.query('UPDATE subscriptions SET unit_price_override_cents = $2, updated_at = now() WHERE org_id = $1', [orgId, unitCents]);
  });
}

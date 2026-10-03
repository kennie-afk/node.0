/**
 * One entry point for every M-Pesa confirmation Daraja delivers. Money paid to Hazina itself (a subscription) arrives on
 * Hazina's own shortcode and is handled by billing, checked first so no organisation's paybill can ever shadow it.
 * Anything else is looked up by paybill number and reconciled for that organisation:
 *
 *   account reference M00012       -> savings of member M00012
 *   account reference M00012-SH    -> shares        (M00012-DP: deposits)
 *   account reference L00034       -> repayment of loan L00034
 *   anything else, or a reference that cannot be applied -> the unmatched queue, for a person to assign
 *
 * A payment for an unknown paybill is logged and dropped (there is nobody to hold it for). A payment for a known paybill is
 * NEVER dropped: it is recorded first, so the M-Pesa transaction id (unique across the system) makes a delivery repeated by
 * Safaricom a no-op, and if applying it fails for a business reason it is kept as unmatched with the reason.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { withOrg, withoutTenant } from '../persistence/pool';
import { NormalisedPayment, normaliseConfirmation } from './daraja';
import { logger } from '../common/logger';
import { ingestBillingPayment, payShortcode } from '../billing/service';
import { AppError, ConflictError, NotFoundError } from '../domain/errors';
import { Ctx, audit, orgInfo } from '../common/context';
import { postDeposit } from '../savings/service';
import { repayLoan } from '../loans/service';

/** Payments applied by the system are attributed to this id in the audit trail and on repayments. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

export interface IngestOutcome {
  matched: boolean;
  duplicate: boolean;
  status: 'applied' | 'unmatched';
  note: string | null;
}

export type Target = { type: 'savings' | 'shares' | 'deposits'; memberNo: string } | { type: 'loan'; loanNo: string };

/** Reads an account reference the way people type it: any case, spaces and dashes optional. */
export function parseReference(raw: string): Target | null {
  const text = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const loan = /^(L\d{4,})$/.exec(text);
  if (loan) return { type: 'loan', loanNo: loan[1]! };
  const member = /^(M\d{4,})(SH|DP|SV)?$/.exec(text);
  if (member) {
    const suffix = member[2];
    return { type: suffix === 'SH' ? 'shares' : suffix === 'DP' ? 'deposits' : 'savings', memberNo: member[1]! };
  }
  return null;
}

async function applyToTarget(client: PoolClient, ctx: Ctx, payment: { externalRef: string; amountCents: number; receivedOn: string }, target: Target): Promise<{ type: string; id: string; unapplied: number }> {
  if (target.type === 'loan') {
    const loan = (await client.query('SELECT id, status FROM loans WHERE loan_no = $1', [target.loanNo])).rows[0];
    if (!loan) throw new NotFoundError(`No loan ${target.loanNo}.`);
    const result = await repayLoan(client, ctx, loan.id, { amountCents: payment.amountCents, channel: 'mpesa', reference: payment.externalRef, receivedOn: payment.receivedOn });
    return { type: 'loan', id: loan.id, unapplied: result.unappliedCents };
  }
  const member = (await client.query('SELECT id FROM members WHERE member_no = $1', [target.memberNo])).rows[0];
  if (!member) throw new NotFoundError(`No member ${target.memberNo}.`);
  await postDeposit(client, ctx, { memberId: member.id, product: target.type, amountCents: payment.amountCents, channel: 'mpesa', reference: payment.externalRef, occurredOn: payment.receivedOn });
  return { type: target.type, id: member.id, unapplied: 0 };
}

function eatDay(at: Date): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export async function applyConfirmation(client: PoolClient, orgId: string, branchId: string, payment: NormalisedPayment): Promise<IngestOutcome> {
  const inserted = await client.query(
    `INSERT INTO mpesa_payments (org_id, branch_id, external_ref, shortcode, bill_ref, amount_cents, payer_msisdn, received_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'unmatched') ON CONFLICT (external_ref) DO NOTHING RETURNING id`,
    [orgId, branchId, payment.externalRef, payment.shortCode, payment.reference, payment.amountCents, payment.payerMsisdn, payment.receivedAt]
  );
  if (!inserted.rows[0]) return { matched: false, duplicate: true, status: 'unmatched', note: null };
  const id = inserted.rows[0].id as string;

  const ctx: Ctx = { orgId, userId: SYSTEM_USER_ID, role: 'owner', branchId: null };
  const target = parseReference(payment.reference);
  let note: string | null = null;
  if (!target) {
    note = payment.reference ? `The account reference "${payment.reference}" does not name a member or loan.` : 'The payment had no account reference.';
  } else {
    // a savepoint: if applying fails for a business reason the payment stays recorded as unmatched, with the reason
    await client.query('SAVEPOINT apply_payment');
    try {
      const applied = await applyToTarget(client, ctx, { externalRef: payment.externalRef, amountCents: payment.amountCents, receivedOn: eatDay(payment.receivedAt) }, target);
      await client.query('RELEASE SAVEPOINT apply_payment');
      await client.query(
        `UPDATE mpesa_payments SET status = 'applied', applied_to_type = $2, applied_to_id = $3, unapplied_cents = $4 WHERE id = $1`,
        [id, applied.type, applied.id, applied.unapplied]
      );
      return { matched: true, duplicate: false, status: 'applied', note: null };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT apply_payment');
      if (!(error instanceof AppError)) throw error;
      note = error.message;
    }
  }
  await client.query(`UPDATE mpesa_payments SET note = $2 WHERE id = $1`, [id, note]);
  await audit(client, ctx, 'mpesa.unmatched', 'mpesa_payment', id, { reference: payment.reference, note }, branchId);
  return { matched: false, duplicate: false, status: 'unmatched', note };
}

export async function ingestConfirmation(raw: unknown): Promise<IngestOutcome | null> {
  const payment = normaliseConfirmation(raw);

  const billingShortcode = payShortcode();
  if (billingShortcode && payment.shortCode === billingShortcode) {
    const billed = await ingestBillingPayment(payment);
    logger.info('billing payment ingested', { matched: billed.matched, duplicate: billed.duplicate });
    return null;
  }

  const paybill = await withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT org_id, branch_id FROM resolve_paybill($1)', [payment.shortCode]);
    return rows[0] as { org_id: string; branch_id: string } | undefined;
  });
  if (!paybill) {
    logger.warn('payment for an unknown paybill', { shortCode: payment.shortCode });
    return null;
  }
  const outcome = await withOrg(paybill.org_id, (client) => applyConfirmation(client, paybill.org_id, paybill.branch_id, payment));
  logger.info('paybill payment ingested', { status: outcome.status, duplicate: outcome.duplicate });
  return outcome;
}

// ---- the people's side: the queue and manual assignment -------------------------------------------------------------

export async function listPayments(client: PoolClient, opts: { status?: string; limit: number }) {
  const params: unknown[] = [];
  let where = '';
  if (opts.status) {
    params.push(opts.status);
    where = `WHERE status = $1`;
  }
  params.push(opts.limit);
  const rows = (await client.query(`SELECT * FROM mpesa_payments ${where} ORDER BY received_at DESC LIMIT $${params.length}`, params)).rows;
  return rows.map((r) => ({
    id: r.id, externalRef: r.external_ref, billRef: r.bill_ref, amountCents: Number(r.amount_cents), payer: r.payer_msisdn, receivedAt: r.received_at,
    status: r.status, appliedToType: r.applied_to_type, appliedToId: r.applied_to_id, unappliedCents: Number(r.unapplied_cents), note: r.note
  }));
}

export const assignSchema = z.object({
  target: z.discriminatedUnion('type', [
    z.object({ type: z.enum(['savings', 'shares', 'deposits']), memberNo: z.string().trim().min(2) }),
    z.object({ type: z.literal('loan'), loanNo: z.string().trim().min(2) })
  ]),
  note: z.string().trim().max(300).optional()
});

export async function assignPayment(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof assignSchema>) {
  const payment = (await client.query('SELECT * FROM mpesa_payments WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!payment) throw new NotFoundError('That payment was not found.');
  if (payment.status !== 'unmatched') throw new ConflictError(`That payment is already ${payment.status}.`);
  const target = input.target as Target;
  const applied = await applyToTarget(
    client,
    ctx,
    { externalRef: payment.external_ref, amountCents: Number(payment.amount_cents), receivedOn: eatDay(payment.received_at) },
    target
  );
  await client.query(
    `UPDATE mpesa_payments SET status = 'assigned', applied_to_type = $2, applied_to_id = $3, unapplied_cents = $4, resolved_by = $5, resolved_at = now(), note = COALESCE($6, note) WHERE id = $1`,
    [id, applied.type, applied.id, applied.unapplied, ctx.userId, input.note ?? null]
  );
  await audit(client, ctx, 'mpesa.assign', 'mpesa_payment', id, { to: applied.type, note: input.note ?? null });
  return { id, status: 'assigned' as const };
}

export async function ignorePayment(client: PoolClient, ctx: Ctx, id: string, note: string) {
  const row = (await client.query(`UPDATE mpesa_payments SET status = 'ignored', resolved_by = $2, resolved_at = now(), note = $3 WHERE id = $1 AND status = 'unmatched' RETURNING id`, [id, ctx.userId, note])).rows[0];
  if (!row) throw new ConflictError('That payment is not waiting in the unmatched queue.');
  await audit(client, ctx, 'mpesa.ignore', 'mpesa_payment', id, { note });
  return { id, status: 'ignored' as const };
}

/** Only meaningful for a SACCO or lender that exists: used by the mock simulator to find the paybill to pay. */
export async function paybillOf(client: PoolClient, branchId: string | null): Promise<string | null> {
  await orgInfo(client);
  const row = (await client.query(
    branchId ? 'SELECT paybill_number FROM branches WHERE id = $1' : 'SELECT paybill_number FROM branches WHERE paybill_number IS NOT NULL AND NOT archived ORDER BY created_at LIMIT 1',
    branchId ? [branchId] : []
  )).rows[0];
  return (row?.paybill_number as string | undefined) ?? null;
}

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
 * Money is in the ledger from the moment it arrives: a receipt entry debits M-Pesa collections and credits the M-Pesa suspense
 * liability (2310). Applying the payment (automatically, or by a person assigning it) debits the suspense instead of M-Pesa
 * collections, so suspense holds exactly the money received and not yet applied, and the trial balance shows it. Payments
 * received before suspense existed have no receipt entry and are applied the way they always were.
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
import { CODES } from '../ledger/chart';
import { postEntry, postingDateFor } from '../ledger/service';
import { cursorTs, decodeCursor, encodeCursor, likeContains } from '../common/search';

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

async function applyToTarget(client: PoolClient, ctx: Ctx, payment: { externalRef: string; amountCents: number; receivedOn: string; fromSuspense: boolean }, target: Target): Promise<{ type: string; id: string; unapplied: number }> {
  if (target.type === 'loan') {
    const loan = (await client.query('SELECT id, status FROM loans WHERE loan_no = $1', [target.loanNo])).rows[0];
    if (!loan) throw new NotFoundError(`No loan ${target.loanNo}.`);
    const funds = payment.fromSuspense ? { accountCode: CODES.mpesaSuspense } : undefined;
    const result = await repayLoan(client, ctx, loan.id, { amountCents: payment.amountCents, channel: 'mpesa', reference: payment.externalRef, receivedOn: payment.receivedOn }, funds);
    return { type: 'loan', id: loan.id, unapplied: result.unappliedCents };
  }
  const member = (await client.query('SELECT id FROM members WHERE member_no = $1', [target.memberNo])).rows[0];
  if (!member) throw new NotFoundError(`No member ${target.memberNo}.`);
  await postDeposit(client, ctx, { memberId: member.id, product: target.type, amountCents: payment.amountCents, channel: 'mpesa', reference: payment.externalRef, occurredOn: payment.receivedOn }, payment.fromSuspense ? CODES.mpesaSuspense : undefined);
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
  // the money is in the ledger now, whatever happens next; a closed period moves the date forward rather than refuse the money
  const receivedDay = await postingDateFor(client, eatDay(payment.receivedAt));
  const receipt = await postEntry(client, orgId, {
    entryDate: receivedDay, memo: `M-Pesa received ${payment.externalRef}`, sourceType: 'mpesa_receipt', sourceId: id, postedBy: SYSTEM_USER_ID,
    lines: [{ accountCode: CODES.mpesa, debitCents: payment.amountCents }, { accountCode: CODES.mpesaSuspense, creditCents: payment.amountCents }]
  });
  await client.query('UPDATE mpesa_payments SET receipt_entry_id = $2 WHERE id = $1', [id, receipt.id]);
  const target = parseReference(payment.reference);
  let note: string | null = null;
  if (!target) {
    note = payment.reference ? `The account reference "${payment.reference}" does not name a member or loan.` : 'The payment had no account reference.';
  } else {
    // a savepoint: if applying fails for a business reason the payment stays recorded as unmatched, with the reason
    await client.query('SAVEPOINT apply_payment');
    try {
      const applied = await applyToTarget(client, ctx, { externalRef: payment.externalRef, amountCents: payment.amountCents, receivedOn: receivedDay, fromSuspense: true }, target);
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
    return null;
  }

  const paybill = await withoutTenant(async (client) => {
    const { rows } = await client.query('SELECT org_id, branch_id FROM resolve_paybill($1)', [payment.shortCode]);
    return rows[0] as { org_id: string; branch_id: string } | undefined;
  });
  if (!paybill) {
    // The money is real and Daraja will not send it again, so keep it for an operator instead of dropping it.
    await keepUnclaimed(payment, raw);
    logger.warn('payment for an unknown paybill kept for an operator', { shortCode: payment.shortCode, externalRef: payment.externalRef });
    return null;
  }
  const outcome = await withOrg(paybill.org_id, (client) => applyConfirmation(client, paybill.org_id, paybill.branch_id, payment));
  logger.info('paybill payment ingested', { status: outcome.status, duplicate: outcome.duplicate });
  return outcome;
}

// ---- the people's side: the queue and manual assignment -------------------------------------------------------------

function toPayment(r: Record<string, any>) {
  return {
    id: r.id as string, externalRef: r.external_ref as string, billRef: r.bill_ref as string, amountCents: Number(r.amount_cents), payer: r.payer_msisdn as string | null, receivedAt: r.received_at as Date,
    status: r.status as string, appliedToType: r.applied_to_type as string | null, appliedToId: r.applied_to_id as string | null, unappliedCents: Number(r.unapplied_cents), note: r.note as string | null
  };
}

/** Newest first, keyset-paged on (received_at, id); `search` matches the M-Pesa code, the account reference and the payer's number. */
export async function listPaymentPage(client: PoolClient, opts: { status?: string; search?: string; limit: number; after?: string }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status) { params.push(opts.status); where.push(`status = $${params.length}`); }
  if (opts.search) {
    params.push(likeContains(opts.search));
    where.push(`(lower(external_ref) LIKE $${params.length} OR lower(bill_ref) LIKE $${params.length} OR payer_msisdn LIKE $${params.length})`);
  }
  if (opts.after) {
    const c = decodeCursor(opts.after);
    params.push(c.at, c.id);
    where.push(`(received_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(opts.limit + 1);
  const rows = (await client.query(`SELECT *, ${cursorTs('received_at')} AS cur FROM mpesa_payments ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY received_at DESC, id DESC LIMIT $${params.length}`, params)).rows;
  const page = rows.slice(0, opts.limit);
  const last = page[page.length - 1];
  return { items: page.map(toPayment), nextCursor: rows.length > opts.limit && last ? encodeCursor(last.cur as string, last.id as string) : null };
}

/** Every payment matching the filter, in pages, for exports: memory is bounded by one page whatever the volume. */
export async function eachPaymentPage(client: PoolClient, opts: { status?: string }, onPage: (rows: ReturnType<typeof toPayment>[]) => Promise<void>): Promise<number> {
  let after: string | undefined;
  let count = 0;
  for (;;) {
    const page = await listPaymentPage(client, { status: opts.status, limit: 1000, after });
    if (page.items.length > 0) await onPage(page.items);
    count += page.items.length;
    if (!page.nextCursor) return count;
    after = page.nextCursor;
  }
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
    { externalRef: payment.external_ref, amountCents: Number(payment.amount_cents), receivedOn: await postingDateFor(client, eatDay(payment.received_at)), fromSuspense: payment.receipt_entry_id !== null },
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

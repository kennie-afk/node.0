/**
 * Savings, shares and deposits. Only a SACCO takes them: a non-bank lender is a non-deposit-taking credit provider, so
 * the service refuses a deposit for one rather than let the product quietly run an unlicensed deposit book.
 *
 *  savings   withdrawable
 *  shares    the member's capital in the SACCO; not withdrawable here (it leaves with the member's exit, a decision for the
 *            committee, not a button)
 *  deposits  non-withdrawable security, typically what loan limits are multiples of
 *
 * A withdrawal below the approval threshold posts at once. At or above it, a second person must approve, and the ledger
 * entry exists only after they do. The member's row is locked while a withdrawal is checked, so two withdrawals at the
 * same moment cannot both pass the balance check.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { Ctx, audit, getSettings, mayCheck, orgInfo } from '../common/context';
import { CODES, Channel, settlementAccount } from '../ledger/chart';
import { memberBalance, postEntry } from '../ledger/service';
import { getMemberRow } from '../members/service';

export const PRODUCT_ACCOUNT = { savings: CODES.savings, shares: CODES.shares, deposits: CODES.deposits } as const;
export type SavingsProduct = keyof typeof PRODUCT_ACCOUNT;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const depositSchema = z.object({
  memberId: z.string().uuid(),
  product: z.enum(['savings', 'shares', 'deposits']),
  amountCents: z.number().int().positive(),
  channel: z.enum(['cash', 'mpesa', 'bank', 'transfer']),
  reference: z.string().trim().max(60).optional().nullable(),
  occurredOn: day.optional()
});

export const withdrawSchema = z.object({
  memberId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  channel: z.enum(['cash', 'mpesa', 'bank', 'transfer']),
  reference: z.string().trim().max(60).optional().nullable(),
  occurredOn: day.optional()
});

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

async function requireSacco(client: PoolClient): Promise<void> {
  const org = await orgInfo(client);
  if (org.kind !== 'sacco') throw new ConflictError('A lender does not take deposits, savings or shares: it is a non-deposit-taking credit provider.');
}

async function requireActiveMember(client: PoolClient, memberId: string): Promise<Record<string, any>> {
  const member = await getMemberRow(client, memberId, true);
  if (member.status === 'exited') throw new ConflictError('That member has exited.');
  return member;
}

export async function postDeposit(client: PoolClient, ctx: Ctx, input: z.infer<typeof depositSchema>) {
  await requireSacco(client);
  const member = await requireActiveMember(client, input.memberId);
  if (input.channel === 'mpesa') {
    if (!input.reference) throw new BadRequestError('An M-Pesa deposit needs the M-Pesa transaction code.');
    const dup = await client.query(`SELECT 1 FROM savings_txns WHERE channel = 'mpesa' AND reference = $1 AND status <> 'rejected' LIMIT 1`, [input.reference]);
    if (dup.rows[0]) throw new ConflictError('That M-Pesa code was already recorded.');
  }
  const date = input.occurredOn ?? (await today(client));
  const txn = (await client.query(
    `INSERT INTO savings_txns (org_id, member_id, product, kind, amount_cents, channel, reference, status, requested_by, occurred_on)
     VALUES ($1, $2, $3, 'deposit', $4, $5, $6, 'posted', $7, $8) RETURNING id`,
    [ctx.orgId, member.id, input.product, input.amountCents, input.channel, input.reference ?? null, ctx.userId, date]
  )).rows[0];
  const entry = await postEntry(client, ctx.orgId, {
    entryDate: date,
    memo: `${input.product} deposit ${member.member_no}${input.reference ? ` (${input.reference})` : ''}`,
    sourceType: 'savings',
    sourceId: txn.id,
    postedBy: ctx.userId,
    lines: [
      { accountCode: settlementAccount(input.channel as Channel), debitCents: input.amountCents },
      { accountCode: PRODUCT_ACCOUNT[input.product], creditCents: input.amountCents, memberId: member.id }
    ]
  });
  await client.query('UPDATE savings_txns SET journal_entry_id = $2 WHERE id = $1', [txn.id, entry.id]);
  await audit(client, ctx, 'savings.deposit', 'savings_txn', txn.id, { product: input.product, amountCents: input.amountCents });
  return { id: txn.id as string, journalSeq: entry.seq, status: 'posted' as const };
}

async function pendingWithdrawals(client: PoolClient, memberId: string): Promise<number> {
  const { rows } = await client.query(`SELECT COALESCE(sum(amount_cents), 0)::bigint AS n FROM savings_txns WHERE member_id = $1 AND kind = 'withdrawal' AND status = 'pending_approval'`, [memberId]);
  return Number(rows[0].n);
}

async function hasArrears(client: PoolClient, memberId: string, asOf: string): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM loan_schedule s JOIN loans l ON l.id = s.loan_id
      WHERE l.member_id = $1 AND l.status = 'disbursed' AND s.due_date < $2::date
        AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) + (s.penalty_cents - s.paid_penalty_cents) > 0 LIMIT 1`,
    [memberId, asOf]
  );
  return rows.length > 0;
}

export async function requestWithdrawal(client: PoolClient, ctx: Ctx, input: z.infer<typeof withdrawSchema>) {
  await requireSacco(client);
  const member = await requireActiveMember(client, input.memberId);
  const date = input.occurredOn ?? (await today(client));
  if (await hasArrears(client, member.id, date)) throw new ConflictError('This member has a loan in arrears, so savings cannot be withdrawn.');
  const available = (await memberBalance(client, member.id, CODES.savings)) - (await pendingWithdrawals(client, member.id));
  if (input.amountCents > available) throw new ConflictError(`The savings balance available is KSh ${(available / 100).toLocaleString('en-KE')}, which is less than the withdrawal.`);

  const settings = await getSettings(client);
  const needsApproval = input.amountCents >= settings.withdrawalApprovalCents;
  const txn = (await client.query(
    `INSERT INTO savings_txns (org_id, member_id, product, kind, amount_cents, channel, reference, status, requested_by, occurred_on)
     VALUES ($1, $2, 'savings', 'withdrawal', $3, $4, $5, $6, $7, $8) RETURNING id`,
    [ctx.orgId, member.id, input.amountCents, input.channel, input.reference ?? null, needsApproval ? 'pending_approval' : 'posted', ctx.userId, date]
  )).rows[0];
  if (needsApproval) {
    await audit(client, ctx, 'savings.withdraw_requested', 'savings_txn', txn.id, { amountCents: input.amountCents });
    return { id: txn.id as string, status: 'pending_approval' as const, journalSeq: null };
  }
  const posted = await postWithdrawal(client, ctx, txn.id, member, input.amountCents, input.channel as Channel, date);
  await audit(client, ctx, 'savings.withdraw', 'savings_txn', txn.id, { amountCents: input.amountCents });
  return { id: txn.id as string, status: 'posted' as const, journalSeq: posted };
}

async function postWithdrawal(client: PoolClient, ctx: Ctx, txnId: string, member: Record<string, any>, amountCents: number, channel: Channel, date: string): Promise<number> {
  const entry = await postEntry(client, ctx.orgId, {
    entryDate: date,
    memo: `savings withdrawal ${member.member_no}`,
    sourceType: 'savings',
    sourceId: txnId,
    postedBy: ctx.userId,
    lines: [
      { accountCode: CODES.savings, debitCents: amountCents, memberId: member.id },
      { accountCode: settlementAccount(channel), creditCents: amountCents }
    ]
  });
  await client.query('UPDATE savings_txns SET journal_entry_id = $2 WHERE id = $1', [txnId, entry.id]);
  return entry.seq;
}

export const decisionSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(300).optional() });

export async function decideWithdrawal(client: PoolClient, ctx: Ctx, txnId: string, input: z.infer<typeof decisionSchema>) {
  const txn = (await client.query(`SELECT * FROM savings_txns WHERE id = $1 AND kind = 'withdrawal' FOR UPDATE`, [txnId])).rows[0];
  if (!txn) throw new NotFoundError('That withdrawal was not found.');
  if (txn.status !== 'pending_approval') throw new ConflictError('That withdrawal has already been decided.');
  const settings = await getSettings(client);
  const check = mayCheck(ctx, settings, [txn.requested_by]);
  if (!check.allowed) throw new ForbiddenError('The person who requested a withdrawal cannot approve it.');
  const member = await getMemberRow(client, txn.member_id, true);
  const date = txn.occurred_on as string;

  if (!input.approve) {
    await client.query(`UPDATE savings_txns SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [txnId, ctx.userId, input.note ?? null]);
    await audit(client, ctx, 'savings.withdraw_rejected', 'savings_txn', txnId, { note: input.note ?? null });
    return { id: txnId, status: 'rejected' as const, journalSeq: null };
  }
  const balance = await memberBalance(client, member.id, CODES.savings);
  if (Number(txn.amount_cents) > balance) throw new ConflictError('The savings balance is now lower than this withdrawal; reject it or let the member top up.');
  await client.query(`UPDATE savings_txns SET status = 'posted', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [txnId, ctx.userId, input.note ?? null]);
  const seq = await postWithdrawal(client, ctx, txnId, member, Number(txn.amount_cents), txn.channel as Channel, date);
  await audit(client, ctx, 'savings.withdraw_approved', 'savings_txn', txnId, { selfChecked: check.selfChecked });
  return { id: txnId, status: 'posted' as const, journalSeq: seq };
}

export async function listSavings(client: PoolClient, opts: { memberId?: string; status?: string; limit: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.memberId) {
    params.push(opts.memberId);
    where.push(`t.member_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    where.push(`t.status = $${params.length}`);
  }
  params.push(opts.limit);
  const rows = (await client.query(
    `SELECT t.*, m.member_no, m.full_name FROM savings_txns t JOIN members m ON m.id = t.member_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.created_at DESC LIMIT $${params.length}`,
    params
  )).rows;
  return rows.map((r) => ({
    id: r.id, memberId: r.member_id, memberNo: r.member_no, memberName: r.full_name, product: r.product, kind: r.kind,
    amountCents: Number(r.amount_cents), channel: r.channel, reference: r.reference, status: r.status, occurredOn: r.occurred_on,
    requestedBy: r.requested_by, decidedBy: r.decided_by
  }));
}

/** A member's savings statement: every posted movement with the running balance. */
export async function savingsStatement(client: PoolClient, memberId: string, product: SavingsProduct) {
  const member = await getMemberRow(client, memberId);
  const rows = (await client.query(
    `SELECT t.id, t.kind, t.amount_cents, t.channel, t.reference, t.occurred_on, t.created_at FROM savings_txns t
      WHERE t.member_id = $1 AND t.product = $2 AND t.status = 'posted' ORDER BY t.occurred_on, t.created_at`,
    [memberId, product]
  )).rows;
  let balance = 0;
  const lines = rows.map((r) => {
    const amount = Number(r.amount_cents);
    balance += r.kind === 'deposit' ? amount : -amount;
    return { id: r.id, date: r.occurred_on, kind: r.kind, amountCents: amount, channel: r.channel, reference: r.reference, balanceCents: balance };
  });
  return { member: { id: member.id, memberNo: member.member_no, fullName: member.full_name }, product, lines, closingBalanceCents: balance };
}

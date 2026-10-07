/**
 * Calling a guarantee: when a borrower is in arrears (or the loan was written off), a guarantor's savings are applied to the loan.
 * The call is capped by what the guarantor undertook, by what their savings can cover, and is a repayment through the usual
 * waterfall (or a recovery, on a written-off loan) funded from the guarantor's savings account in the ledger.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { ConflictError, NotFoundError } from '../domain/errors';
import { Ctx, audit } from '../common/context';
import { CODES } from '../ledger/chart';
import { memberBalance } from '../ledger/service';
import { getMemberRow } from '../members/service';
import { moneyText } from '../domain/money';
import { arrearsAsAt } from './schedule';
import { repayLoan } from './service';

export const guaranteeCallSchema = z.object({ guarantorMemberId: z.string().uuid(), amountCents: z.number().int().positive(), note: z.string().trim().max(300).optional() });

export async function callGuarantee(client: PoolClient, ctx: Ctx, loanId: string, input: z.infer<typeof guaranteeCallSchema>) {
  const loan = (await client.query('SELECT id, loan_no, status FROM loans WHERE id = $1', [loanId])).rows[0];
  if (!loan) throw new NotFoundError('That loan was not found.');
  const today = (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
  if (loan.status === 'disbursed') {
    const rows = (await client.query('SELECT * FROM loan_schedule WHERE loan_id = $1', [loanId])).rows.map((r) => ({
      installmentNo: r.installment_no, dueDate: r.due_date as string, principalCents: Number(r.principal_cents), interestCents: Number(r.interest_cents), penaltyCents: Number(r.penalty_cents),
      paidPrincipalCents: Number(r.paid_principal_cents), paidInterestCents: Number(r.paid_interest_cents), paidPenaltyCents: Number(r.paid_penalty_cents)
    }));
    if (arrearsAsAt(today, rows).daysOverdue < 1) throw new ConflictError('A guarantee is called only when the loan is overdue.');
  } else if (loan.status !== 'written_off') {
    throw new ConflictError(`A guarantee cannot be called on a loan that is ${loan.status}.`);
  }
  const guarantor = (await client.query('SELECT guaranteed_cents, released_on FROM loan_guarantors WHERE loan_id = $1 AND guarantor_member_id = $2', [loanId, input.guarantorMemberId])).rows[0];
  if (!guarantor) throw new NotFoundError('That member is not a guarantor of this loan.');
  if (guarantor.released_on) throw new ConflictError('That guarantee was released.');
  // the guarantor's row is locked, like a withdrawal, so a call and a withdrawal cannot both spend the same savings
  const member = await getMemberRow(client, input.guarantorMemberId, true);
  const called = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS n FROM guarantee_calls WHERE loan_id = $1 AND guarantor_member_id = $2', [loanId, input.guarantorMemberId])).rows[0].n);
  const room = Number(guarantor.guaranteed_cents) - called;
  if (input.amountCents > room) throw new ConflictError(`${member.member_no} guaranteed KSh ${moneyText(Number(guarantor.guaranteed_cents))}; KSh ${moneyText(room)} of it can still be called.`);
  const pending = Number((await client.query(`SELECT COALESCE(sum(amount_cents), 0)::bigint AS n FROM savings_txns WHERE member_id = $1 AND kind = 'withdrawal' AND status = 'pending_approval'`, [member.id])).rows[0].n);
  const available = (await memberBalance(client, member.id, CODES.savings)) - pending;
  if (input.amountCents > available) throw new ConflictError(`${member.member_no}'s savings available are KSh ${moneyText(Math.max(0, available))}, less than the call.`);

  const repayment = await repayLoan(client, ctx, loanId, { amountCents: input.amountCents, channel: 'transfer', reference: null, receivedOn: today }, { accountCode: CODES.savings, memberId: member.id });
  // the member's savings statement is built from savings_txns, so the debit must appear there as well as in the ledger
  const entry = repayment.journalSeq === null ? null : (await client.query('SELECT id FROM journal_entries WHERE seq = $1', [repayment.journalSeq])).rows[0];
  await client.query(
    `INSERT INTO savings_txns (org_id, member_id, product, kind, amount_cents, channel, reference, status, requested_by, occurred_on, journal_entry_id)
     VALUES ($1, $2, 'savings', 'withdrawal', $3, 'transfer', $4, 'posted', $5, $6, $7)`,
    [ctx.orgId, member.id, input.amountCents, `GUARANTEE-${loan.loan_no}`, ctx.userId, today, entry?.id ?? null]
  );
  const call = (await client.query(
    `INSERT INTO guarantee_calls (org_id, loan_id, guarantor_member_id, amount_cents, repayment_id, called_on, called_by, note) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [ctx.orgId, loanId, member.id, input.amountCents, repayment.id, today, ctx.userId, input.note ?? null]
  )).rows[0];
  await audit(client, ctx, 'loan.guarantee_call', 'loan', loanId, { guarantor: member.member_no, amountCents: input.amountCents });
  return { id: call.id as string, repayment, remainingGuaranteeCents: room - input.amountCents };
}

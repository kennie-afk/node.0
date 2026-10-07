/**
 * The loan lifecycle: products, application, appraisal, approval (maker-checker), disbursement, repayment, penalties,
 * write-off and restructure. Every step that moves money ends in ledger.postEntry; the schedule and repayment tables are the
 * borrower-facing record of what the ledger says.
 *
 *   applied -> appraised -> approved -> disbursed -> closed
 *                 \-> rejected (from appraised or approved)       \-> written_off   \-> restructured
 *
 * The person who applied, the person who appraised and the person who approves are three people (strict, the default);
 * a relaxed organisation lets its owner hold more than one role, and every such step is audited.
 */
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { Ctx, audit, getSettings, mayCheck } from '../common/context';
import { CODES, Channel, settlementAccount } from '../ledger/chart';
import { memberBalance, postEntries, postEntry, postingDateFor } from '../ledger/service';
import { withOrg } from '../persistence/pool';
import { moneyText } from '../domain/money';
import { getMemberRow, nextNumber } from '../members/service';
import { likeContains, numberSeq } from '../common/search';
import {
  Installment,
  OwedInstallment,
  addDaysToDay,
  addMonthsToDay,
  allocateRepayment,
  arrearsAsAt,
  buildSchedule,
  daysBetween,
  penaltyFor,
  totals
} from './schedule';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

// ---- products -------------------------------------------------------------------------------------------------

export const productSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    method: z.enum(['flat', 'reducing']),
    annualRateBp: z.number().int().min(0).max(100_000),
    minAmountCents: z.number().int().min(0).default(0),
    maxAmountCents: z.number().int().positive(),
    minTermMonths: z.number().int().min(1).default(1),
    maxTermMonths: z.number().int().min(1).max(360),
    processingFeeBp: z.number().int().min(0).max(5000).default(0),
    insuranceFeeBp: z.number().int().min(0).max(5000).default(0),
    penaltyRateBp: z.number().int().min(0).max(10_000).default(0),
    graceDays: z.number().int().min(0).max(90).default(0),
    maxMultipleOfSavings: z.number().int().min(0).max(100).default(0),
    guarantorsRequired: z.number().int().min(0).max(10).default(0)
  })
  .refine((p) => p.maxAmountCents >= p.minAmountCents, { message: 'the maximum amount is below the minimum' })
  .refine((p) => p.maxTermMonths >= p.minTermMonths, { message: 'the maximum term is below the minimum' });

export type ProductInput = z.infer<typeof productSchema>;

function toProduct(r: Record<string, any>) {
  return {
    id: r.id as string, name: r.name as string, method: r.method as 'flat' | 'reducing', annualRateBp: Number(r.annual_rate_bp),
    minAmountCents: Number(r.min_amount_cents), maxAmountCents: Number(r.max_amount_cents),
    minTermMonths: Number(r.min_term_months), maxTermMonths: Number(r.max_term_months),
    processingFeeBp: Number(r.processing_fee_bp), insuranceFeeBp: Number(r.insurance_fee_bp), penaltyRateBp: Number(r.penalty_rate_bp),
    graceDays: Number(r.grace_days), maxMultipleOfSavings: Number(r.max_multiple_of_savings), guarantorsRequired: Number(r.guarantors_required),
    active: r.active as boolean
  };
}

export async function createProduct(client: PoolClient, ctx: Ctx, input: ProductInput) {
  // a product whose own maximum cannot produce a valid schedule is refused now, not when the first member applies
  buildSchedule({ principalCents: Math.max(input.maxAmountCents, 1), termMonths: input.maxTermMonths, annualRateBp: input.annualRateBp, method: input.method, firstDueDate: '2026-01-31' });
  const row = (await client.query(
    `INSERT INTO loan_products (org_id, name, method, annual_rate_bp, min_amount_cents, max_amount_cents, min_term_months, max_term_months,
        processing_fee_bp, insurance_fee_bp, penalty_rate_bp, grace_days, max_multiple_of_savings, guarantors_required)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [ctx.orgId, input.name, input.method, input.annualRateBp, input.minAmountCents, input.maxAmountCents, input.minTermMonths, input.maxTermMonths,
      input.processingFeeBp, input.insuranceFeeBp, input.penaltyRateBp, input.graceDays, input.maxMultipleOfSavings, input.guarantorsRequired]
  )).rows[0];
  await audit(client, ctx, 'loan_product.create', 'loan_product', row.id, { name: input.name });
  return toProduct(row);
}

export async function listProducts(client: PoolClient, includeInactive = false) {
  const rows = (await client.query(`SELECT * FROM loan_products ${includeInactive ? '' : 'WHERE active'} ORDER BY created_at`)).rows;
  return rows.map(toProduct);
}

export async function setProductActive(client: PoolClient, ctx: Ctx, id: string, active: boolean) {
  const row = (await client.query('UPDATE loan_products SET active = $2 WHERE id = $1 RETURNING *', [id, active])).rows[0];
  if (!row) throw new NotFoundError('That loan product was not found.');
  await audit(client, ctx, 'loan_product.active', 'loan_product', id, { active });
  return toProduct(row);
}

// ---- application ---------------------------------------------------------------------------------------------

export const applySchema = z.object({
  memberId: z.string().uuid(),
  productId: z.string().uuid(),
  principalCents: z.number().int().positive(),
  termMonths: z.number().int().min(1).max(360),
  purpose: z.string().trim().max(300).optional().nullable(),
  guarantors: z.array(z.object({ memberId: z.string().uuid(), guaranteedCents: z.number().int().positive() })).max(10).default([])
});

/** What a member can stand behind: their savings and deposits, less what they already guarantee on open loans. */
async function guaranteeCapacity(client: PoolClient, memberId: string): Promise<number> {
  const security = (await memberBalance(client, memberId, CODES.savings)) + (await memberBalance(client, memberId, CODES.deposits));
  const { rows } = await client.query(
    `SELECT COALESCE(sum(g.guaranteed_cents), 0)::bigint AS n FROM loan_guarantors g JOIN loans l ON l.id = g.loan_id
      WHERE g.guarantor_member_id = $1 AND g.released_on IS NULL AND l.status IN ('applied', 'appraised', 'approved', 'disbursed')`,
    [memberId]
  );
  return security - Number(rows[0].n);
}

export async function applyForLoan(client: PoolClient, ctx: Ctx, input: z.infer<typeof applySchema>) {
  const member = await getMemberRow(client, input.memberId, true);
  if (member.status !== 'active') throw new ConflictError('Only an active member can apply for a loan.');
  const product = (await client.query('SELECT * FROM loan_products WHERE id = $1', [input.productId])).rows[0];
  if (!product || !product.active) throw new NotFoundError('That loan product is not available.');

  const amount = input.principalCents;
  if (amount < Number(product.min_amount_cents) || amount > Number(product.max_amount_cents)) {
    throw new BadRequestError(`This product lends between KSh ${moneyText(Number(product.min_amount_cents))} and KSh ${moneyText(Number(product.max_amount_cents))}.`);
  }
  if (input.termMonths < product.min_term_months || input.termMonths > product.max_term_months) {
    throw new BadRequestError(`This product's term is ${product.min_term_months} to ${product.max_term_months} months.`);
  }
  const inFlight = await client.query(`SELECT loan_no FROM loans WHERE member_id = $1 AND product_id = $2 AND status IN ('applied', 'appraised', 'approved') LIMIT 1`, [member.id, product.id]);
  if (inFlight.rows[0]) throw new ConflictError(`${member.member_no} already has an application in progress (${inFlight.rows[0].loan_no}).`);

  if (product.max_multiple_of_savings > 0) {
    const security = (await memberBalance(client, member.id, CODES.savings)) + (await memberBalance(client, member.id, CODES.deposits));
    const owed = await memberBalance(client, member.id, CODES.loans);
    const limit = security * product.max_multiple_of_savings - owed;
    if (amount > limit) throw new ConflictError(`The loan limit is ${product.max_multiple_of_savings}x savings and deposits, less what is owed: KSh ${moneyText(Math.max(0, limit))} available.`);
  }

  if (input.guarantors.length < product.guarantors_required) throw new BadRequestError(`This product needs ${product.guarantors_required} guarantor(s).`);
  const seen = new Set<string>();
  for (const g of input.guarantors) {
    if (g.memberId === member.id) throw new BadRequestError('A member cannot guarantee their own loan.');
    if (seen.has(g.memberId)) throw new BadRequestError('The same guarantor is listed twice.');
    seen.add(g.memberId);
    const guarantor = await getMemberRow(client, g.memberId, true);
    if (guarantor.status !== 'active') throw new ConflictError(`${guarantor.member_no} is not an active member.`);
    const capacity = await guaranteeCapacity(client, g.memberId);
    if (g.guaranteedCents > capacity) throw new ConflictError(`${guarantor.member_no} can guarantee at most KSh ${moneyText(Math.max(0, capacity))} (their savings and deposits less what they already guarantee).`);
  }

  // refuse now if these terms cannot make a schedule at all
  buildSchedule({ principalCents: amount, termMonths: input.termMonths, annualRateBp: product.annual_rate_bp, method: product.method, firstDueDate: '2026-01-31' });

  const loanNo = await nextNumber(client, ctx.orgId, 'loan', 'L');
  const loan = (await client.query(
    `INSERT INTO loans (org_id, loan_no, member_id, product_id, branch_id, method, annual_rate_bp, principal_cents, term_months,
        processing_fee_bp, insurance_fee_bp, penalty_rate_bp, grace_days, purpose, applied_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id, loan_no`,
    [ctx.orgId, loanNo, member.id, product.id, member.branch_id, product.method, product.annual_rate_bp, amount, input.termMonths,
      product.processing_fee_bp, product.insurance_fee_bp, product.penalty_rate_bp, product.grace_days, input.purpose ?? null, ctx.userId]
  )).rows[0];
  for (const g of input.guarantors) {
    await client.query('INSERT INTO loan_guarantors (org_id, loan_id, guarantor_member_id, guaranteed_cents) VALUES ($1, $2, $3, $4)', [ctx.orgId, loan.id, g.memberId, g.guaranteedCents]);
  }
  await audit(client, ctx, 'loan.apply', 'loan', loan.id, { loanNo, amountCents: amount });
  return { id: loan.id as string, loanNo: loan.loan_no as string };
}

// ---- workflow --------------------------------------------------------------------------------------------------

async function lockLoan(client: PoolClient, id: string): Promise<Record<string, any>> {
  const row = (await client.query('SELECT * FROM loans WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!row) throw new NotFoundError('That loan was not found.');
  return row;
}

export const appraiseSchema = z.object({
  monthlyIncomeCents: z.number().int().min(0),
  monthlyExpensesCents: z.number().int().min(0),
  otherDebtServiceCents: z.number().int().min(0).default(0),
  recommendedCents: z.number().int().positive().optional(),
  recommendation: z.enum(['approve', 'approve_reduced', 'decline']),
  notes: z.string().trim().max(1000).optional()
});

/** The appraiser's working: what the borrower can afford to repay, against the instalment this loan would need. */
export async function appraiseLoan(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof appraiseSchema>) {
  const loan = await lockLoan(client, id);
  if (loan.status !== 'applied') throw new ConflictError(`A loan that is ${loan.status} cannot be appraised.`);
  const settings = await getSettings(client);
  const check = mayCheck(ctx, settings, [loan.applied_by]);
  if (!check.allowed) throw new ForbiddenError('The person who took the application cannot appraise it.');

  const schedule = buildSchedule({ principalCents: Number(loan.principal_cents), termMonths: loan.term_months, annualRateBp: loan.annual_rate_bp, method: loan.method, firstDueDate: '2026-01-31' });
  const biggest = Math.max(...schedule.map((r) => r.principalCents + r.interestCents));
  const disposable = input.monthlyIncomeCents - input.monthlyExpensesCents - input.otherDebtServiceCents;
  const appraisal = {
    ...input,
    largestInstalmentCents: biggest,
    disposableIncomeCents: disposable,
    // an arithmetic fact, not a credit decision: does the largest instalment fit inside what is left each month?
    instalmentFits: biggest <= disposable,
    selfChecked: check.selfChecked
  };
  await client.query(`UPDATE loans SET status = 'appraised', appraised_by = $2, appraised_at = now(), appraisal = $3::jsonb WHERE id = $1`, [id, ctx.userId, JSON.stringify(appraisal)]);
  await audit(client, ctx, 'loan.appraise', 'loan', id, { recommendation: input.recommendation, fits: appraisal.instalmentFits, selfChecked: check.selfChecked });
  return { id, status: 'appraised' as const, appraisal };
}

export const decideSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });

export async function decideLoan(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof decideSchema>) {
  const loan = await lockLoan(client, id);
  if (loan.status !== 'appraised') throw new ConflictError(`A loan that is ${loan.status} cannot be decided; it must be appraised first.`);
  const settings = await getSettings(client);
  const check = mayCheck(ctx, settings, [loan.applied_by, loan.appraised_by]);
  if (!check.allowed) throw new ForbiddenError('The applicant and the appraiser cannot also approve the loan.');
  if (!input.approve && !input.note) throw new BadRequestError('Say why the loan is declined.');
  const status = input.approve ? 'approved' : 'rejected';
  await client.query(`UPDATE loans SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4 WHERE id = $1`, [id, status, ctx.userId, input.note ?? null]);
  await audit(client, ctx, input.approve ? 'loan.approve' : 'loan.reject', 'loan', id, { selfChecked: check.selfChecked, note: input.note ?? null });
  return { id, status };
}

export const disburseSchema = z.object({
  channel: z.enum(['cash', 'mpesa', 'bank', 'transfer']),
  reference: z.string().trim().max(60).optional().nullable(),
  disbursedOn: day.optional(),
  firstDueDate: day.optional()
});

function feeOf(principalCents: number, bp: number): number {
  return Math.round((principalCents * bp) / 10_000);
}

export async function disburseLoan(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof disburseSchema>) {
  const loan = await lockLoan(client, id);
  if (loan.status !== 'approved') throw new ConflictError(`Only an approved loan can be paid out; this one is ${loan.status}.`);
  const settings = await getSettings(client);
  // whoever pays the money out is a different person from whoever approved it, unless an owner of a relaxed organisation
  const check = mayCheck(ctx, settings, [loan.decided_by]);
  if (!check.allowed) throw new ForbiddenError('The person who approved a loan cannot also pay it out.');

  const principal = Number(loan.principal_cents);
  const disbursedOn = input.disbursedOn ?? (await today(client));
  const firstDue = input.firstDueDate ?? addMonthsToDay(disbursedOn, 1);
  if (firstDue <= disbursedOn) throw new BadRequestError('The first instalment must fall after the day the loan is paid out.');
  const schedule = buildSchedule({ principalCents: principal, termMonths: loan.term_months, annualRateBp: loan.annual_rate_bp, method: loan.method, firstDueDate: firstDue });
  const fees = feeOf(principal, loan.processing_fee_bp) + feeOf(principal, loan.insurance_fee_bp);
  if (fees >= principal) throw new ConflictError('The fees would take the whole loan.');

  const lines = [
    { accountCode: CODES.loans, debitCents: principal, memberId: loan.member_id as string, loanId: id },
    { accountCode: settlementAccount(input.channel as Channel), creditCents: principal - fees }
  ] as Array<{ accountCode: string; debitCents?: number; creditCents?: number; memberId?: string; loanId?: string }>;
  if (fees > 0) lines.push({ accountCode: CODES.feeIncome, creditCents: fees, loanId: id });
  const entry = await postEntry(client, ctx.orgId, { entryDate: disbursedOn, memo: `loan ${loan.loan_no} disbursed`, sourceType: 'loan_disbursement', sourceId: id, postedBy: ctx.userId, lines });

  for (const row of schedule) {
    await client.query(
      `INSERT INTO loan_schedule (org_id, loan_id, installment_no, due_date, principal_cents, interest_cents) VALUES ($1, $2, $3, $4, $5, $6)`,
      [ctx.orgId, id, row.installmentNo, row.dueDate, row.principalCents, row.interestCents]
    );
  }
  await client.query(
    `UPDATE loans SET status = 'disbursed', disbursed_by = $2, disbursed_on = $3, disbursed_channel = $4, disbursement_ref = $5, first_due_date = $6 WHERE id = $1`,
    [id, ctx.userId, disbursedOn, input.channel, input.reference ?? null, firstDue]
  );
  await audit(client, ctx, 'loan.disburse', 'loan', id, { amountCents: principal, feesCents: fees, journalSeq: entry.seq, selfChecked: check.selfChecked });
  return { id, status: 'disbursed' as const, journalSeq: entry.seq, feesCents: fees, netPaidCents: principal - fees, totals: totals(schedule), firstDueDate: firstDue };
}

// ---- repayment ---------------------------------------------------------------------------------------------------

export const repaySchema = z.object({
  amountCents: z.number().int().positive(),
  channel: z.enum(['cash', 'mpesa', 'bank', 'transfer']),
  reference: z.string().trim().max(60).optional().nullable(),
  receivedOn: day.optional()
});

function toOwed(r: Record<string, any>): OwedInstallment & { dueDate: string; id: string; accruedOn: string | null } {
  return {
    id: r.id, accruedOn: (r.interest_accrued_on as string | null) ?? null, installmentNo: r.installment_no, dueDate: r.due_date,
    principalCents: Number(r.principal_cents), interestCents: Number(r.interest_cents), penaltyCents: Number(r.penalty_cents),
    paidPrincipalCents: Number(r.paid_principal_cents), paidInterestCents: Number(r.paid_interest_cents), paidPenaltyCents: Number(r.paid_penalty_cents)
  };
}

export interface RepaymentResult {
  id: string;
  duplicate: boolean;
  penaltyCents: number;
  interestCents: number;
  principalCents: number;
  unappliedCents: number;
  recoveryCents: number;
  closed: boolean;
  journalSeq: number | null;
}

/**
 * Applies one payment to one loan. The loan row is locked first, so two payments for the same loan at the same moment are
 * applied one after the other and never both against the same instalment. A repeated external reference (an M-Pesa code
 * delivered twice) returns the first result instead of paying twice.
 */
/** Where a repayment's money comes from when it is not the channel's own settlement account (M-Pesa suspense, a guarantor's savings). */
export interface FundsSource {
  accountCode: string;
  memberId?: string;
}

export async function repayLoan(client: PoolClient, ctx: Ctx, loanId: string, input: z.infer<typeof repaySchema>, funds?: FundsSource): Promise<RepaymentResult> {
  const loan = await lockLoan(client, loanId);
  if (input.reference) {
    const prior = (await client.query('SELECT * FROM loan_repayments WHERE external_ref = $1', [input.reference])).rows[0];
    if (prior) {
      if (prior.loan_id !== loanId) throw new ConflictError('That reference was already used for a different loan.');
      return { id: prior.id, duplicate: true, penaltyCents: Number(prior.penalty_cents), interestCents: Number(prior.interest_cents), principalCents: Number(prior.principal_cents), unappliedCents: Number(prior.unapplied_cents), recoveryCents: Number(prior.recovery_cents), closed: loan.status === 'closed', journalSeq: null };
    }
  }
  if (input.channel === 'mpesa' && !input.reference) throw new BadRequestError('An M-Pesa repayment needs the M-Pesa transaction code.');
  const receivedOn = input.receivedOn ?? (await today(client));
  const settle = funds?.accountCode ?? settlementAccount(input.channel as Channel);
  const fundsMember = funds?.memberId;

  // money arriving on a loan already written off is a recovery: income, not repayment of what is still lent
  if (loan.status === 'written_off') {
    const entry = await postEntry(client, ctx.orgId, {
      entryDate: receivedOn, memo: `recovery on written-off loan ${loan.loan_no}`, sourceType: 'loan_recovery', sourceId: loanId, postedBy: ctx.userId,
      lines: [{ accountCode: settle, debitCents: input.amountCents, memberId: fundsMember }, { accountCode: CODES.recoveries, creditCents: input.amountCents, memberId: loan.member_id, loanId }]
    });
    const row = (await client.query(
      `INSERT INTO loan_repayments (org_id, loan_id, amount_cents, channel, external_ref, recovery_cents, received_on, received_by, journal_entry_id)
       VALUES ($1, $2, $3, $4, $5, $3, $6, $7, $8) RETURNING id`,
      [ctx.orgId, loanId, input.amountCents, input.channel, input.reference ?? null, receivedOn, ctx.userId, entry.id]
    )).rows[0];
    await audit(client, ctx, 'loan.recovery', 'loan', loanId, { amountCents: input.amountCents });
    return { id: row.id, duplicate: false, penaltyCents: 0, interestCents: 0, principalCents: 0, unappliedCents: 0, recoveryCents: input.amountCents, closed: false, journalSeq: entry.seq };
  }
  if (loan.status !== 'disbursed') throw new ConflictError(`A loan that is ${loan.status} cannot take a repayment.`);

  const rows = (await client.query('SELECT * FROM loan_schedule WHERE loan_id = $1 ORDER BY installment_no FOR UPDATE', [loanId])).rows.map(toOwed);
  const allocation = allocateRepayment(input.amountCents, rows);
  for (const line of allocation.lines) {
    await client.query(
      `UPDATE loan_schedule SET paid_penalty_cents = paid_penalty_cents + $3, paid_interest_cents = paid_interest_cents + $4, paid_principal_cents = paid_principal_cents + $5
        WHERE loan_id = $1 AND installment_no = $2`,
      [loanId, line.installmentNo, line.penaltyCents, line.interestCents, line.principalCents]
    );
  }
  const lines: Array<{ accountCode: string; debitCents?: number; creditCents?: number; memberId?: string; loanId?: string }> = [{ accountCode: settle, debitCents: input.amountCents, memberId: fundsMember }];
  if (allocation.principalCents > 0) lines.push({ accountCode: CODES.loans, creditCents: allocation.principalCents, memberId: loan.member_id, loanId });
  // interest on an instalment already accrued clears the receivable; interest paid before it fell due is income on receipt
  const accrued = new Set(rows.filter((r) => r.accruedOn !== null).map((r) => r.installmentNo));
  const interestToReceivable = allocation.lines.filter((l) => accrued.has(l.installmentNo)).reduce((sum, l) => sum + l.interestCents, 0);
  const interestToIncome = allocation.interestCents - interestToReceivable;
  if (interestToReceivable > 0) lines.push({ accountCode: CODES.accruedInterest, creditCents: interestToReceivable, memberId: loan.member_id, loanId });
  if (interestToIncome > 0) lines.push({ accountCode: CODES.interestIncome, creditCents: interestToIncome, loanId });
  if (allocation.penaltyCents > 0) lines.push({ accountCode: CODES.penaltiesReceivable, creditCents: allocation.penaltyCents, memberId: loan.member_id, loanId });
  if (allocation.unappliedCents > 0) lines.push({ accountCode: CODES.unapplied, creditCents: allocation.unappliedCents, memberId: loan.member_id, loanId });
  const entry = await postEntry(client, ctx.orgId, { entryDate: receivedOn, memo: `repayment ${loan.loan_no}${input.reference ? ` (${input.reference})` : ''}`, sourceType: 'loan_repayment', sourceId: loanId, postedBy: ctx.userId, lines });

  const row = (await client.query(
    `INSERT INTO loan_repayments (org_id, loan_id, amount_cents, channel, external_ref, penalty_cents, interest_cents, principal_cents, unapplied_cents, received_on, received_by, journal_entry_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
    [ctx.orgId, loanId, input.amountCents, input.channel, input.reference ?? null, allocation.penaltyCents, allocation.interestCents, allocation.principalCents, allocation.unappliedCents, receivedOn, ctx.userId, entry.id]
  )).rows[0];

  const left = (await client.query(
    `SELECT COALESCE(sum((principal_cents - paid_principal_cents) + (interest_cents - paid_interest_cents) + (penalty_cents - paid_penalty_cents)), 0)::bigint AS n FROM loan_schedule WHERE loan_id = $1`,
    [loanId]
  )).rows[0];
  const closed = Number(left.n) === 0;
  if (closed) {
    await client.query(`UPDATE loans SET status = 'closed', closed_on = $2 WHERE id = $1`, [loanId, receivedOn]);
    // a loan repaid in full no longer needs its guarantors: their exposure is released
    await client.query('UPDATE loan_guarantors SET released_on = $2 WHERE loan_id = $1 AND released_on IS NULL', [loanId, receivedOn]);
  }
  await audit(client, ctx, 'loan.repay', 'loan', loanId, { amountCents: input.amountCents, closed });
  return {
    id: row.id, duplicate: false, penaltyCents: allocation.penaltyCents, interestCents: allocation.interestCents, principalCents: allocation.principalCents,
    unappliedCents: allocation.unappliedCents, recoveryCents: 0, closed, journalSeq: entry.seq
  };
}

// ---- penalties and interest accrual ---------------------------------------------------------------------------------------

export const BATCH_LOANS = 500;

/** The identity background jobs act as; it is also what payments applied by the system are attributed to. */
export const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

export interface PenaltyRunResult {
  asOf: string;
  loansSeen: number;
  charged: number;
  totalCents: number;
  /** loans a repayment held at that moment: left for the next run (or a repeat of this one), never waited for */
  skippedBusy: number;
  batches: number;
}

/**
 * Locks up to a batch of loans without waiting for any a repayment holds. A batch job that queued behind a repayment would
 * make the repayment queue behind the job's other locks, so busy loans are skipped and reported instead.
 */
async function lockBatch(client: PoolClient, ids: string[]): Promise<string[]> {
  const { rows } = await client.query(`SELECT id FROM loans WHERE id = ANY($1::uuid[]) AND status = 'disbursed' ORDER BY id FOR UPDATE SKIP LOCKED`, [ids]);
  return rows.map((r) => r.id as string);
}

/**
 * Charges the month's penalty on every instalment that is overdue beyond its grace days. Safe to run any number of times
 * (daily from the scheduler, or by hand): (loan, instalment, month) is unique, so a repeat adds nothing.
 *
 * It works in transactions of about BATCH_LOANS loans each, never one transaction over the whole book. Within a batch the
 * candidates are found with one query, the journal entries are posted in bulk (one per loan), and the penalty rows and
 * schedule balances are written with one statement each; the loans are locked only for those few statements.
 */
export async function runPenalties(orgId: string, userId: string, asOf: string, opts: { batchSize?: number; client?: PoolClient } = {}): Promise<PenaltyRunResult> {
  const month = asOf.slice(0, 7);
  const size = opts.batchSize ?? BATCH_LOANS;
  const ctx: Ctx = { orgId, userId, role: 'owner', branchId: null };
  // a caller already inside a transaction (sample data) passes its client; everyone else gets one transaction per batch
  const inTxn = <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => (opts.client ? fn(opts.client) : withOrg(orgId, fn));
  const result: PenaltyRunResult = { asOf, loansSeen: 0, charged: 0, totalCents: 0, skippedBusy: 0, batches: 0 };
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const batch = await inTxn(async (client) => {
      const candidates = (await client.query(
        `SELECT l.id FROM loans l
          WHERE l.status = 'disbursed' AND l.penalty_rate_bp > 0 AND l.id > $1
            AND EXISTS (SELECT 1 FROM loan_schedule s WHERE s.loan_id = l.id AND s.due_date + l.grace_days < $2::date
                         AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) > 0)
          ORDER BY l.id LIMIT $3`,
        [after, asOf, size]
      )).rows.map((r) => r.id as string);
      if (candidates.length === 0) return { done: true as const, last: after, seen: 0, charged: 0, total: 0, busy: 0 };
      const locked = await lockBatch(client, candidates);
      const due = locked.length === 0 ? [] : (await client.query(
        `SELECT l.id AS loan_id, l.loan_no, l.member_id, s.installment_no,
                (((s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents)) * l.penalty_rate_bp + 5000) / 10000 AS amount
           FROM loans l JOIN loan_schedule s ON s.loan_id = l.id
          WHERE l.id = ANY($1::uuid[]) AND s.due_date + l.grace_days < $2::date
            AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) > 0
            AND (((s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents)) * l.penalty_rate_bp + 5000) / 10000 > 0
            AND NOT EXISTS (SELECT 1 FROM loan_penalties p WHERE p.loan_id = l.id AND p.installment_no = s.installment_no AND p.period_month = $3)
          ORDER BY l.id, s.installment_no`,
        [locked, asOf, month]
      )).rows;
      let charged = 0;
      let total = 0;
      if (due.length > 0) {
        const byLoan = new Map<string, typeof due>();
        for (const row of due) byLoan.set(row.loan_id, [...(byLoan.get(row.loan_id) ?? []), row]);
        const entryDate = await postingDateFor(client, asOf);
        const loans = [...byLoan.entries()];
        const posted = await postEntries(client, orgId, loans.map(([loanId, rows]) => {
          const sum = rows.reduce((x, r) => x + Number(r.amount), 0);
          return {
            entryDate, memo: `penalty ${rows[0].loan_no} (${month})`, sourceType: 'loan_penalty', sourceId: randomUUID(), postedBy: userId,
            lines: [
              { accountCode: CODES.penaltiesReceivable, debitCents: sum, memberId: rows[0].member_id as string, loanId },
              { accountCode: CODES.penaltyIncome, creditCents: sum, loanId }
            ]
          };
        }));
        const entryOf = new Map(loans.map(([loanId], i) => [loanId, posted[i]!.id]));
        await client.query(
          `INSERT INTO loan_penalties (org_id, loan_id, installment_no, period_month, amount_cents, journal_entry_id, charged_on)
           SELECT $1, t.loan_id, t.installment_no, $2, t.amount, t.entry_id, $3::date
             FROM unnest($4::uuid[], $5::int[], $6::bigint[], $7::uuid[]) AS t(loan_id, installment_no, amount, entry_id)`,
          [orgId, month, asOf, due.map((r) => r.loan_id), due.map((r) => r.installment_no), due.map((r) => Number(r.amount)), due.map((r) => entryOf.get(r.loan_id))]
        );
        await client.query(
          `UPDATE loan_schedule s SET penalty_cents = s.penalty_cents + t.amount
             FROM unnest($1::uuid[], $2::int[], $3::bigint[]) AS t(loan_id, installment_no, amount)
            WHERE s.loan_id = t.loan_id AND s.installment_no = t.installment_no`,
          [due.map((r) => r.loan_id), due.map((r) => r.installment_no), due.map((r) => Number(r.amount))]
        );
        charged = due.length;
        total = due.reduce((x, r) => x + Number(r.amount), 0);
      }
      return { done: candidates.length < size, last: candidates[candidates.length - 1]!, seen: candidates.length, charged, total, busy: candidates.length - locked.length };
    });
    result.batches += 1;
    result.loansSeen += batch.seen;
    result.charged += batch.charged;
    result.totalCents += batch.total;
    result.skippedBusy += batch.busy;
    after = batch.last;
    if (batch.done) break;
  }
  await inTxn(async (client) => {
    await client.query(
      `INSERT INTO penalty_runs (org_id, run_date, loans_seen, charged, total_cents, skipped_busy, finished_at) VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (org_id, run_date) DO UPDATE SET loans_seen = EXCLUDED.loans_seen, charged = penalty_runs.charged + EXCLUDED.charged,
         total_cents = penalty_runs.total_cents + EXCLUDED.total_cents, skipped_busy = EXCLUDED.skipped_busy, finished_at = now()`,
      [orgId, asOf, result.loansSeen, result.charged, result.totalCents, result.skippedBusy]
    );
    await audit(client, ctx, 'loan.penalties_run', 'loan', null, { asOf, charged: result.charged, totalCents: result.totalCents, skippedBusy: result.skippedBusy });
  });
  return result;
}

export interface AccrualRunResult {
  asOf: string;
  installments: number;
  accruedCents: number;
  skippedBusy: number;
  batches: number;
}

/**
 * Books the interest of every instalment that has fallen due (due date on or before asOf) and was not yet accrued: one entry
 * per instalment, dated its due day, debiting accrued interest receivable and crediting interest income. Interest already
 * paid on the instalment before it fell due was recognised on receipt, so only the unpaid part is accrued. Marking the
 * instalment accrued is what makes the run idempotent. A later repayment of that interest clears the receivable, not income.
 */
export async function runInterestAccrual(orgId: string, userId: string, asOf: string, opts: { batchSize?: number; client?: PoolClient } = {}): Promise<AccrualRunResult> {
  const size = opts.batchSize ?? BATCH_LOANS;
  const ctx: Ctx = { orgId, userId, role: 'owner', branchId: null };
  const inTxn = <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => (opts.client ? fn(opts.client) : withOrg(orgId, fn));
  const result: AccrualRunResult = { asOf, installments: 0, accruedCents: 0, skippedBusy: 0, batches: 0 };
  let after = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const batch = await inTxn(async (client) => {
      const candidates = (await client.query(
        `SELECT l.id FROM loans l
          WHERE l.status = 'disbursed' AND l.id > $1
            AND EXISTS (SELECT 1 FROM loan_schedule s WHERE s.loan_id = l.id AND s.interest_accrued_on IS NULL AND s.due_date <= $2::date)
          ORDER BY l.id LIMIT $3`,
        [after, asOf, size]
      )).rows.map((r) => r.id as string);
      if (candidates.length === 0) return { done: true as const, last: after, count: 0, total: 0, busy: 0 };
      const locked = await lockBatch(client, candidates);
      const rows = locked.length === 0 ? [] : (await client.query(
        `SELECT s.id, s.loan_id, s.installment_no, to_char(s.due_date, 'YYYY-MM-DD') AS due, s.interest_cents - s.paid_interest_cents AS amount, l.loan_no, l.member_id
           FROM loan_schedule s JOIN loans l ON l.id = s.loan_id
          WHERE l.id = ANY($1::uuid[]) AND s.interest_accrued_on IS NULL AND s.due_date <= $2::date ORDER BY l.id, s.installment_no FOR UPDATE OF s`,
        [locked, asOf]
      )).rows;
      const owing = rows.filter((r) => Number(r.amount) > 0);
      if (owing.length > 0) {
        const dates = new Map<string, string>();
        for (const d of new Set(owing.map((r) => r.due as string))) dates.set(d, await postingDateFor(client, d));
        await postEntries(client, orgId, owing.map((r) => ({
          entryDate: dates.get(r.due as string)!, memo: `interest accrued ${r.loan_no} instalment ${r.installment_no}`, sourceType: 'interest_accrual', sourceId: r.id as string, postedBy: userId,
          lines: [
            { accountCode: CODES.accruedInterest, debitCents: Number(r.amount), memberId: r.member_id as string, loanId: r.loan_id as string },
            { accountCode: CODES.interestIncome, creditCents: Number(r.amount), loanId: r.loan_id as string }
          ]
        })));
      }
      if (rows.length > 0) await client.query('UPDATE loan_schedule SET interest_accrued_on = $2::date WHERE id = ANY($1::uuid[])', [rows.map((r) => r.id), asOf]);
      return { done: candidates.length < size, last: candidates[candidates.length - 1]!, count: rows.length, total: owing.reduce((x, r) => x + Number(r.amount), 0), busy: candidates.length - locked.length };
    });
    result.batches += 1;
    result.installments += batch.count;
    result.accruedCents += batch.total;
    result.skippedBusy += batch.busy;
    after = batch.last;
    if (batch.done) break;
  }
  await inTxn((client) => audit(client, ctx, 'loan.interest_accrual', 'loan', null, { asOf, installments: result.installments, accruedCents: result.accruedCents }));
  return result;
}

/** Interest accrued and not yet paid on one loan: what a write-off or a restructure must take off the books. */
async function accruedInterestLeft(client: PoolClient, loanId: string): Promise<number> {
  const { rows } = await client.query(`SELECT COALESCE(sum(interest_cents - paid_interest_cents), 0)::bigint AS n FROM loan_schedule WHERE loan_id = $1 AND interest_accrued_on IS NOT NULL`, [loanId]);
  return Number(rows[0].n);
}

// ---- write-off and restructure ------------------------------------------------------------------------------------

export const writeOffSchema = z.object({ note: z.string().trim().min(3).max(500), writtenOffOn: day.optional() });

export async function writeOffLoan(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof writeOffSchema>) {
  const loan = await lockLoan(client, id);
  if (loan.status !== 'disbursed') throw new ConflictError(`Only a loan being repaid can be written off; this one is ${loan.status}.`);
  const date = input.writtenOffOn ?? (await today(client));
  const rows = (await client.query('SELECT * FROM loan_schedule WHERE loan_id = $1 ORDER BY installment_no', [id])).rows.map(toOwed);
  const arrears = arrearsAsAt(date, rows);
  if (arrears.daysOverdue < 1) throw new ConflictError('A loan that is not overdue cannot be written off.');
  const principalLeft = rows.reduce((s, r) => s + (r.principalCents - r.paidPrincipalCents), 0);
  const penaltyLeft = rows.reduce((s, r) => s + (r.penaltyCents - r.paidPenaltyCents), 0);
  const lines: Array<{ accountCode: string; debitCents?: number; creditCents?: number; memberId?: string; loanId?: string }> = [];
  if (principalLeft + penaltyLeft > 0) {
    lines.push({ accountCode: CODES.badDebts, debitCents: principalLeft + penaltyLeft, loanId: id });
    if (principalLeft > 0) lines.push({ accountCode: CODES.loans, creditCents: principalLeft, memberId: loan.member_id, loanId: id });
    if (penaltyLeft > 0) lines.push({ accountCode: CODES.penaltiesReceivable, creditCents: penaltyLeft, memberId: loan.member_id, loanId: id });
  }
  // interest that was accrued but never paid is not collectable either: take it off the receivable against interest income
  const accruedLeft = await accruedInterestLeft(client, id);
  if (accruedLeft > 0) {
    lines.push({ accountCode: CODES.interestIncome, debitCents: accruedLeft, loanId: id });
    lines.push({ accountCode: CODES.accruedInterest, creditCents: accruedLeft, memberId: loan.member_id, loanId: id });
  }
  let seq: number | null = null;
  if (lines.length > 0) seq = (await postEntry(client, ctx.orgId, { entryDate: date, memo: `loan ${loan.loan_no} written off`, sourceType: 'loan_writeoff', sourceId: id, postedBy: ctx.userId, lines })).seq;
  await client.query(`UPDATE loans SET status = 'written_off', written_off_on = $2, decision_note = COALESCE(decision_note || E'\\n', '') || $3 WHERE id = $1`, [id, date, `Write-off: ${input.note}`]);
  await audit(client, ctx, 'loan.writeoff', 'loan', id, { principalCents: principalLeft, penaltyCents: penaltyLeft, accruedInterestReversedCents: accruedLeft, daysOverdue: arrears.daysOverdue, note: input.note });
  return { id, status: 'written_off' as const, writtenOffPrincipalCents: principalLeft, writtenOffPenaltyCents: penaltyLeft, journalSeq: seq };
}

export const restructureSchema = z.object({
  newTermMonths: z.number().int().min(1).max(360),
  newAnnualRateBp: z.number().int().min(0).max(100_000).optional(),
  newMethod: z.enum(['flat', 'reducing']).optional(),
  firstDueDate: day.optional(),
  note: z.string().trim().min(3).max(500)
});

/**
 * Moves the unpaid principal of a loan onto a fresh loan with new terms, with no new money. Overdue interest and
 * unpaid penalties on the old loan are WAIVED (a provisional policy, written to the audit trail): interest that was never
 * received was never recognised, and the penalty receivable is reversed against penalty income.
 */
export async function restructureLoan(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof restructureSchema>) {
  const old = await lockLoan(client, id);
  if (old.status !== 'disbursed') throw new ConflictError(`Only a loan being repaid can be restructured; this one is ${old.status}.`);
  const date = await today(client);
  const rows = (await client.query('SELECT * FROM loan_schedule WHERE loan_id = $1 ORDER BY installment_no FOR UPDATE', [id])).rows.map(toOwed);
  const principalLeft = rows.reduce((s, r) => s + (r.principalCents - r.paidPrincipalCents), 0);
  const penaltyLeft = rows.reduce((s, r) => s + (r.penaltyCents - r.paidPenaltyCents), 0);
  if (principalLeft <= 0) throw new ConflictError('There is no unpaid principal to restructure.');

  const method = input.newMethod ?? old.method;
  const rate = input.newAnnualRateBp ?? old.annual_rate_bp;
  const firstDue = input.firstDueDate ?? addMonthsToDay(date, 1);
  if (firstDue <= date) throw new BadRequestError('The first instalment must be in the future.');
  const schedule: Installment[] = buildSchedule({ principalCents: principalLeft, termMonths: input.newTermMonths, annualRateBp: rate, method, firstDueDate: firstDue });

  const loanNo = await nextNumber(client, ctx.orgId, 'loan', 'L');
  const fresh = (await client.query(
    `INSERT INTO loans (org_id, loan_no, member_id, product_id, branch_id, method, annual_rate_bp, principal_cents, term_months,
        processing_fee_bp, insurance_fee_bp, penalty_rate_bp, grace_days, purpose, status, applied_by, appraised_by, decided_by, decided_at,
        disbursed_by, disbursed_on, disbursed_channel, first_due_date, restructured_from, decision_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0, $10, $11, $12, 'disbursed', $13, $13, $13, now(), $13, $14, 'transfer', $15, $16, $17) RETURNING id`,
    [ctx.orgId, loanNo, old.member_id, old.product_id, old.branch_id, method, rate, principalLeft, input.newTermMonths, old.penalty_rate_bp, old.grace_days,
      `Restructure of ${old.loan_no}`, ctx.userId, date, firstDue, id, `Restructured from ${old.loan_no}: ${input.note}`]
  )).rows[0];
  for (const row of schedule) {
    await client.query('INSERT INTO loan_schedule (org_id, loan_id, installment_no, due_date, principal_cents, interest_cents) VALUES ($1, $2, $3, $4, $5, $6)', [ctx.orgId, fresh.id, row.installmentNo, row.dueDate, row.principalCents, row.interestCents]);
  }

  const lines: Array<{ accountCode: string; debitCents?: number; creditCents?: number; memberId?: string; loanId?: string }> = [
    { accountCode: CODES.loans, debitCents: principalLeft, memberId: old.member_id, loanId: fresh.id },
    { accountCode: CODES.loans, creditCents: principalLeft, memberId: old.member_id, loanId: id }
  ];
  if (penaltyLeft > 0) {
    lines.push({ accountCode: CODES.penaltyIncome, debitCents: penaltyLeft, loanId: id });
    lines.push({ accountCode: CODES.penaltiesReceivable, creditCents: penaltyLeft, memberId: old.member_id, loanId: id });
  }
  const accruedLeft = await accruedInterestLeft(client, id);
  if (accruedLeft > 0) {
    lines.push({ accountCode: CODES.interestIncome, debitCents: accruedLeft, loanId: id });
    lines.push({ accountCode: CODES.accruedInterest, creditCents: accruedLeft, memberId: old.member_id, loanId: id });
  }
  // the guarantors stand behind the new loan as they did the old one
  await client.query(
    `INSERT INTO loan_guarantors (org_id, loan_id, guarantor_member_id, guaranteed_cents) SELECT org_id, $2, guarantor_member_id, guaranteed_cents FROM loan_guarantors WHERE loan_id = $1 AND released_on IS NULL`,
    [id, fresh.id]
  );
  const entry = await postEntry(client, ctx.orgId, { entryDate: date, memo: `restructure ${old.loan_no} -> ${loanNo}`, sourceType: 'loan_restructure', sourceId: fresh.id, postedBy: ctx.userId, lines });
  await client.query(`UPDATE loans SET status = 'restructured', restructured_into = $2, closed_on = $3 WHERE id = $1`, [id, fresh.id, date]);
  await audit(client, ctx, 'loan.restructure', 'loan', id, { into: loanNo, principalCents: principalLeft, penaltyWaivedCents: penaltyLeft, note: input.note });
  return { id: fresh.id as string, loanNo, principalCents: principalLeft, penaltyWaivedCents: penaltyLeft, journalSeq: entry.seq };
}

// ---- reading -----------------------------------------------------------------------------------------------------

function toLoan(r: Record<string, any>) {
  return {
    id: r.id as string, loanNo: r.loan_no as string, memberId: r.member_id as string, memberNo: r.member_no as string | undefined, memberName: r.full_name as string | undefined,
    productId: r.product_id as string, status: r.status as string, method: r.method as string, annualRateBp: Number(r.annual_rate_bp),
    principalCents: Number(r.principal_cents), termMonths: Number(r.term_months), purpose: r.purpose as string | null, createdAt: r.created_at as Date,
    disbursedOn: r.disbursed_on as string | null
  };
}

export async function listLoans(client: PoolClient, opts: { status?: string; memberId?: string; search?: string; limit: number; after?: string }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (opts.status) { params.push(opts.status); where.push(`l.status = $${params.length}`); }
  if (opts.memberId) { params.push(opts.memberId); where.push(`l.member_id = $${params.length}`); }
  if (opts.search) { params.push(likeContains(opts.search)); where.push(`(lower(l.loan_no) LIKE $${params.length} OR lower(m.full_name) LIKE $${params.length} OR lower(m.member_no) LIKE $${params.length})`); }
  if (opts.after) { params.push(numberSeq(opts.after)); where.push(`l.loan_seq < $${params.length}`); }
  params.push(opts.limit + 1);
  const rows = (await client.query(
    `SELECT l.*, m.member_no, m.full_name FROM loans l JOIN members m ON m.id = l.member_id ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY l.loan_seq DESC LIMIT $${params.length}`,
    params
  )).rows;
  const more = rows.length > opts.limit;
  const items = rows.slice(0, opts.limit).map(toLoan);
  return { items, nextCursor: more ? items[items.length - 1]!.loanNo : null };
}

export async function loanDetail(client: PoolClient, id: string, asOf?: string) {
  const row = (await client.query('SELECT l.*, m.member_no, m.full_name FROM loans l JOIN members m ON m.id = l.member_id WHERE l.id = $1', [id])).rows[0];
  if (!row) throw new NotFoundError('That loan was not found.');
  const date = asOf ?? (await today(client));
  const schedule = (await client.query('SELECT * FROM loan_schedule WHERE loan_id = $1 ORDER BY installment_no', [id])).rows.map(toOwed);
  const repayments = (await client.query('SELECT * FROM loan_repayments WHERE loan_id = $1 ORDER BY received_on, created_at', [id])).rows;
  const guarantors = (await client.query(
    `SELECT g.guaranteed_cents, m.id, m.member_no, m.full_name FROM loan_guarantors g JOIN members m ON m.id = g.guarantor_member_id WHERE g.loan_id = $1`, [id]
  )).rows;
  const arrears = row.status === 'disbursed' ? arrearsAsAt(date, schedule) : null;
  const outstandingPrincipal = schedule.reduce((s, r) => s + (r.principalCents - r.paidPrincipalCents), 0);
  return {
    ...toLoan(row),
    appraisal: row.appraisal,
    appliedBy: row.applied_by, appraisedBy: row.appraised_by, decidedBy: row.decided_by, disbursedBy: row.disbursed_by,
    decisionNote: row.decision_note, firstDueDate: row.first_due_date, closedOn: row.closed_on,
    restructuredInto: row.restructured_into, restructuredFrom: row.restructured_from,
    fees: { processingFeeBp: Number(row.processing_fee_bp), insuranceFeeBp: Number(row.insurance_fee_bp) },
    penaltyRateBp: Number(row.penalty_rate_bp), graceDays: Number(row.grace_days),
    outstandingPrincipalCents: row.status === 'disbursed' ? outstandingPrincipal : 0,
    outstandingTotalCents: row.status === 'disbursed' ? schedule.reduce((s, r) => s + (r.principalCents - r.paidPrincipalCents) + (r.interestCents - r.paidInterestCents) + (r.penaltyCents - r.paidPenaltyCents), 0) : 0,
    asOf: date,
    arrears,
    schedule: schedule.map((r) => ({
      installmentNo: r.installmentNo, dueDate: r.dueDate, principalCents: r.principalCents, interestCents: r.interestCents, penaltyCents: r.penaltyCents,
      paidPrincipalCents: r.paidPrincipalCents, paidInterestCents: r.paidInterestCents, paidPenaltyCents: r.paidPenaltyCents,
      overdueDays: r.dueDate < date && (r.principalCents - r.paidPrincipalCents + r.interestCents - r.paidInterestCents + r.penaltyCents - r.paidPenaltyCents) > 0 ? daysBetween(r.dueDate, date) : 0
    })),
    repayments: repayments.map((r) => ({
      id: r.id, amountCents: Number(r.amount_cents), channel: r.channel, reference: r.external_ref, receivedOn: r.received_on,
      penaltyCents: Number(r.penalty_cents), interestCents: Number(r.interest_cents), principalCents: Number(r.principal_cents), unappliedCents: Number(r.unapplied_cents), recoveryCents: Number(r.recovery_cents)
    })),
    guarantors: guarantors.map((g) => ({ memberId: g.id, memberNo: g.member_no, fullName: g.full_name, guaranteedCents: Number(g.guaranteed_cents) }))
  };
}

/** A preview for the application screen: the schedule these terms would produce, before anything is saved. */
export function previewSchedule(input: { principalCents: number; termMonths: number; annualRateBp: number; method: 'flat' | 'reducing'; firstDueDate: string }) {
  const rows = buildSchedule(input);
  return { installments: rows, totals: totals(rows) };
}

/**
 * CSV exports. They are the audit pack's raw material: every figure on a screen can be downloaded and checked in a
 * spreadsheet. Cells that would run as a spreadsheet formula are neutralised (see common/csv.ts).
 */
import { Router } from 'express';
import { authenticate, requirePermission } from './middleware';
import { wrap } from '../common/context';
import { inOrg, queryString } from './helpers';
import { toCsv } from '../common/csv';
import { listPayments } from '../mpesa/service';
import { loanDetail } from '../loans/service';
import { savingsStatement, PRODUCT_ACCOUNT, SavingsProduct } from '../savings/service';
import { arrearsList } from '../reports/portfolio';
import { trialBalance } from '../ledger/service';
import { getReturn } from '../returns/service';
import { BadRequestError, NotFoundError } from '../domain/errors';
import { Response } from 'express';

const router = Router();
const money = (cents: number) => (cents / 100).toFixed(2);

function send(res: Response, filename: string, body: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

router.get('/exports/members.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const rows = await inOrg(req, async (client) => (await client.query('SELECT member_no, full_name, id_number, phone, status, joined_on FROM members ORDER BY member_no')).rows);
  send(res, 'members.csv', toCsv(['member_no', 'name', 'id_number', 'phone', 'status', 'joined_on'], rows.map((r) => [r.member_no, r.full_name, r.id_number, r.phone, r.status, r.joined_on])));
}));

router.get('/exports/loans.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const rows = await inOrg(req, async (client) => (await client.query(
    `SELECT l.loan_no, m.member_no, m.full_name, l.status, l.method, l.annual_rate_bp, l.principal_cents, l.term_months, l.disbursed_on FROM loans l JOIN members m ON m.id = l.member_id ORDER BY l.loan_no`
  )).rows);
  send(res, 'loans.csv', toCsv(['loan_no', 'member_no', 'name', 'status', 'method', 'annual_rate_percent', 'principal', 'term_months', 'disbursed_on'],
    rows.map((r) => [r.loan_no, r.member_no, r.full_name, r.status, r.method, Number(r.annual_rate_bp) / 100, money(Number(r.principal_cents)), r.term_months, r.disbursed_on])));
}));

router.get('/exports/arrears.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const result = await inOrg(req, (client) => arrearsList(client, { minDays: 1, limit: 5000, offset: 0 }));
  send(res, 'arrears.csv', toCsv(['loan_no', 'member_no', 'name', 'phone', 'days_overdue', 'bucket', 'outstanding_principal', 'overdue_principal', 'overdue_interest', 'overdue_penalty'],
    result.items.map((r) => [r.loanNo, r.memberNo, r.memberName, r.phone, r.daysOverdue, r.bucket, money(r.outstandingPrincipalCents), money(r.overduePrincipalCents), money(r.overdueInterestCents), money(r.overduePenaltyCents)])));
}));

router.get('/exports/trial-balance.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const asOf = queryString(req.query.asOf) ?? new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const tb = await inOrg(req, (client) => trialBalance(client, asOf));
  send(res, `trial-balance-${asOf}.csv`, toCsv(['code', 'account', 'type', 'debit', 'credit'], [
    ...tb.rows.map((r) => [r.code, r.name, r.type, money(r.debitCents), money(r.creditCents)]),
    ['', 'TOTAL', '', money(tb.totalDebitCents), money(tb.totalCreditCents)]
  ]));
}));

router.get('/exports/journal.csv', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  const rows = await inOrg(req, async (client) => (await client.query(
    `SELECT e.seq, e.entry_date, e.memo, e.source_type, a.code, a.name, l.debit_cents, l.credit_cents
       FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id ORDER BY e.seq, l.line_no`
  )).rows);
  send(res, 'journal.csv', toCsv(['entry', 'date', 'memo', 'source', 'account_code', 'account', 'debit', 'credit'], rows.map((r) => [r.seq, r.entry_date, r.memo, r.source_type, r.code, r.name, money(Number(r.debit_cents)), money(Number(r.credit_cents))])));
}));

router.get('/exports/mpesa-payments.csv', authenticate, requirePermission('recon'), wrap(async (req, res) => {
  const rows = await inOrg(req, (client) => listPayments(client, { status: queryString(req.query.status), limit: 5000 }));
  send(res, 'mpesa-payments.csv', toCsv(['mpesa_code', 'received_at', 'account_ref', 'amount', 'payer', 'status', 'applied_to', 'note'],
    rows.map((r) => [r.externalRef, r.receivedAt, r.billRef, money(r.amountCents), r.payer, r.status, r.appliedToType, r.note])));
}));

router.get('/exports/member-statement/:id.csv', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const product = queryString(req.query.product) ?? 'savings';
  if (!(product in PRODUCT_ACCOUNT)) throw new BadRequestError('product is savings, shares or deposits');
  const s = await inOrg(req, (client) => savingsStatement(client, String(req.params.id), product as SavingsProduct));
  send(res, `${s.member.memberNo}-${product}.csv`, toCsv(['date', 'kind', 'amount', 'channel', 'reference', 'balance'], s.lines.map((l) => [l.date, l.kind, money(l.amountCents), l.channel, l.reference, money(l.balanceCents)])));
}));

router.get('/exports/loan-statement/:id.csv', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const loan = await inOrg(req, (client) => loanDetail(client, String(req.params.id)));
  if (loan.schedule.length === 0) throw new NotFoundError('That loan has no schedule yet: it has not been paid out.');
  send(res, `${loan.loanNo}-statement.csv`, toCsv(['instalment', 'due_date', 'principal', 'interest', 'penalty', 'paid_principal', 'paid_interest', 'paid_penalty', 'days_overdue'],
    loan.schedule.map((r) => [r.installmentNo, r.dueDate, money(r.principalCents), money(r.interestCents), money(r.penaltyCents), money(r.paidPrincipalCents), money(r.paidInterestCents), money(r.paidPenaltyCents), r.overdueDays])));
}));

router.get('/exports/return/:id.csv', authenticate, requirePermission('returns'), wrap(async (req, res) => {
  const r = await inOrg(req, (client) => getReturn(client, String(req.params.id)));
  const payload = r.payload as { banner: string; title: string; sections: Array<{ title: string; rows: Array<{ label: string; value: number; format: string }> }> };
  const rows: unknown[][] = [[payload.banner, '', ''], [payload.title, `${r.periodStart} to ${r.periodEnd}`, '']];
  for (const section of payload.sections) {
    rows.push([section.title, '', '']);
    for (const row of section.rows) rows.push([row.label, row.format === 'money' ? money(row.value) : row.value, row.format]);
  }
  send(res, 'return.csv', toCsv(['line', 'value', 'format'], rows));
}));

export default router;

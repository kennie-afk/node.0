import { randomUUID } from 'node:crypto';
import { Transaction } from 'sequelize';
import { env } from '../../config/env';
import { objectStore, safeFileName, sha256, tenantKey } from '../../common/object-store';
import { allocate, fromMinor, MAX_MINOR, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, forUpdate, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { dateOnly, iso, nextCounter } from '../finance/chain';
import { postEntry, PostLine, reverseEntry } from '../finance/ledger.service';
import { accountIdByKey, loadSettings } from '../finance/setup.service';
import { resolveCashAccount } from '../banking/accounts.service';
import { checkBudget } from '../budgets/budget.service';
import { getVendor } from './vendors.service';

export type BillStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type BillKind = 'VENDOR_BILL' | 'EXPENSE_CLAIM';

export interface BillLineInput {
  accountId: number;
  fundId: number;
  ministryId?: number | null;
  description?: string | null;
  amountMinor: number;
}

export interface BillInput {
  kind?: BillKind;
  vendorId: number;
  reference?: string | null;
  billDate: string;
  dueDate: string;
  memo?: string | null;
  lines: BillLineInput[];
}

const today = () => new Date().toISOString().slice(0, 10);

function mapBill(r: any) {
  return {
    id: toInt(r.id), billNo: toInt(r.bill_no), kind: r.kind as BillKind, vendorId: toInt(r.vendor_id), vendorName: r.vendor_name as string | undefined,
    reference: r.reference as string | null, billDate: dateOnly(r.bill_date), dueDate: dateOnly(r.due_date), memo: r.memo as string | null,
    status: r.status as BillStatus, total: fromMinor(r.total_minor), totalMinor: toInt(r.total_minor), paid: fromMinor(r.paid_minor), paidMinor: toInt(r.paid_minor),
    outstanding: fromMinor(toInt(r.total_minor) - toInt(r.paid_minor)), createdBy: r.created_by === null ? null : toInt(r.created_by),
    submittedBy: r.submitted_by === null ? null : toInt(r.submitted_by), requiredApprovals: toInt(r.required_approvals),
    journalEntryId: r.journal_entry_id === null ? null : toInt(r.journal_entry_id),
    warnings: (typeof r.warnings === 'string' ? JSON.parse(r.warnings) : r.warnings) as Array<{ accountId: number; fundId: number; message: string }>,
    rejectedReason: r.rejected_reason as string | null, voidReason: r.void_reason as string | null
  };
}

async function loadRow(t: Transaction, churchId: number, id: number, lock = false) {
  const row = await selectOne<any>(t, `SELECT b.*, v.name AS vendor_name FROM bills b JOIN vendors v ON v.church_id = b.church_id AND v.id = b.vendor_id WHERE b.church_id = :churchId AND b.id = :id ${lock ? forUpdate().replace('FOR UPDATE', 'FOR UPDATE OF b') : ''}`, { churchId, id });
  if (!row) throw new NotFoundError(`bill ${id} was not found`);
  return row;
}

async function loadLines(t: Transaction, churchId: number, billId: number) {
  return select<any>(
    t,
    `SELECT l.*, a.code AS account_code, a.name AS account_name, f.code AS fund_code
       FROM bill_lines l JOIN accounts a ON a.church_id = l.church_id AND a.id = l.account_id JOIN funds f ON f.church_id = l.church_id AND f.id = l.fund_id
      WHERE l.church_id = :churchId AND l.bill_id = :billId ORDER BY l.line_no`,
    { churchId, billId }
  );
}

async function validateLines(t: Transaction, churchId: number, lines: BillLineInput[]) {
  if (lines.length === 0) throw new BadRequestError('a bill needs at least one line');
  if (lines.length > 200) throw new BadRequestError('a bill may have at most 200 lines');
  for (const line of lines) {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0 || line.amountMinor > MAX_MINOR) throw new BadRequestError('every line needs a positive amount');
  }
  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const accounts = await select<any>(t, `SELECT id, code, type, is_postable, is_active FROM accounts WHERE church_id = ? AND id IN (${accountIds.map(() => '?').join(',')})`, [churchId, ...accountIds]);
  const byId = new Map(accounts.map((a) => [toInt(a.id), a]));
  for (const id of accountIds) {
    const a = byId.get(id);
    if (!a) throw new BadRequestError(`account ${id} does not exist in this church`);
    if (a.type !== 'EXPENSE' && a.type !== 'ASSET') throw new BadRequestError(`account ${a.code} is ${a.type.toLowerCase()}; bills post to expense (or asset, for purchases) accounts`);
    if (!(a.is_postable === true || a.is_postable === 1) || !(a.is_active === true || a.is_active === 1)) throw new BadRequestError(`account ${a.code} cannot be posted to`);
  }
  const fundIds = [...new Set(lines.map((l) => l.fundId))];
  const funds = await select<any>(t, `SELECT id, code, is_active FROM funds WHERE church_id = ? AND id IN (${fundIds.map(() => '?').join(',')})`, [churchId, ...fundIds]);
  if (funds.length !== fundIds.length) throw new BadRequestError('a fund on the bill does not exist in this church');
  if (funds.some((f) => !(f.is_active === true || f.is_active === 1))) throw new BadRequestError('a fund on the bill is inactive');
  const ministryIds = [...new Set(lines.map((l) => l.ministryId).filter((v): v is number => !!v))];
  if (ministryIds.length) {
    const m = await select<any>(t, `SELECT id FROM ministries WHERE church_id = ? AND id IN (${ministryIds.map(() => '?').join(',')})`, [churchId, ...ministryIds]);
    if (m.length !== ministryIds.length) throw new BadRequestError('a ministry on the bill does not exist in this church');
  }
}

async function writeLines(t: Transaction, churchId: number, billId: number, lines: BillLineInput[]) {
  await exec(t, `DELETE FROM bill_lines WHERE church_id = :churchId AND bill_id = :billId`, { churchId, billId });
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    await exec(
      t,
      `INSERT INTO bill_lines (church_id, bill_id, line_no, account_id, fund_id, ministry_id, description, amount_minor) VALUES (:churchId, :billId, :no, :a, :f, :m, :d, :amount)`,
      { churchId, billId, no: i + 1, a: l.accountId, f: l.fundId, m: l.ministryId ?? null, d: l.description?.slice(0, 255) ?? null, amount: l.amountMinor }
    );
  }
}

async function checkVendorForKind(t: Transaction, churchId: number, kind: BillKind, vendorId: number) {
  const vendor = await getVendor(t, churchId, vendorId);
  if (!vendor.isActive) throw new BadRequestError(`payee "${vendor.name}" is inactive`);
  if (kind === 'EXPENSE_CLAIM' && vendor.kind === 'VENDOR') throw new BadRequestError('an expense claim is paid to a staff member or member, not a vendor');
  return vendor;
}

export async function createBill(t: Transaction, churchId: number, actorId: number, input: BillInput) {
  const kind = input.kind ?? 'VENDOR_BILL';
  await checkVendorForKind(t, churchId, kind, input.vendorId);
  if (input.dueDate < input.billDate) throw new BadRequestError('the due date cannot be before the bill date');
  await validateLines(t, churchId, input.lines);
  if (input.reference) {
    const dup = await selectOne(t, `SELECT bill_no FROM bills WHERE church_id = :churchId AND vendor_id = :v AND reference = :r AND status <> 'VOID'`, { churchId, v: input.vendorId, r: input.reference });
    if (dup) throw new ConflictError(`this payee already has bill #${(dup as any).bill_no} with reference ${input.reference}`);
  }
  const billNo = await nextCounter(t, churchId, 'bill');
  const total = input.lines.reduce((s, l) => s + l.amountMinor, 0);
  await exec(
    t,
    `INSERT INTO bills (church_id, bill_no, kind, vendor_id, reference, bill_date, due_date, memo, total_minor, created_by)
     VALUES (:churchId, :billNo, :kind, :vendorId, :reference, :billDate, :dueDate, :memo, :total, :actorId)`,
    { churchId, billNo, kind, vendorId: input.vendorId, reference: input.reference ?? null, billDate: input.billDate, dueDate: input.dueDate, memo: input.memo ?? null, total, actorId }
  );
  const row = await selectOne<any>(t, `SELECT id FROM bills WHERE church_id = :churchId AND bill_no = :billNo`, { churchId, billNo });
  const id = toInt(row!.id);
  await writeLines(t, churchId, id, input.lines);
  await recordAudit(t, churchId, { action: 'bill.create', entityType: 'bill', entityId: id, actorId, data: { billNo, total: fromMinor(total), kind } });
  return getBill(t, churchId, id);
}

export async function updateBill(t: Transaction, churchId: number, actorId: number, id: number, changes: Partial<BillInput>) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'DRAFT') throw new ConflictError(`a ${String(row.status).toLowerCase()} bill can no longer be edited`);
  const bill = mapBill(row);
  const vendorId = changes.vendorId ?? bill.vendorId;
  await checkVendorForKind(t, churchId, changes.kind ?? bill.kind, vendorId);
  const billDate = changes.billDate ?? bill.billDate;
  const dueDate = changes.dueDate ?? bill.dueDate;
  if (dueDate < billDate) throw new BadRequestError('the due date cannot be before the bill date');
  let total = bill.totalMinor;
  if (changes.lines) {
    await validateLines(t, churchId, changes.lines);
    await writeLines(t, churchId, id, changes.lines);
    total = changes.lines.reduce((s, l) => s + l.amountMinor, 0);
  }
  await exec(t, `UPDATE bills SET kind = :kind, vendor_id = :vendorId, reference = :reference, bill_date = :billDate, due_date = :dueDate, memo = :memo, total_minor = :total, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    kind: changes.kind ?? bill.kind, vendorId, reference: changes.reference === undefined ? bill.reference : changes.reference, billDate, dueDate, memo: changes.memo === undefined ? bill.memo : changes.memo, total, now: new Date(), churchId, id
  });
  await recordAudit(t, churchId, { action: 'bill.update', entityType: 'bill', entityId: id, actorId, data: { total: fromMinor(total) } });
  return getBill(t, churchId, id);
}

export async function deleteBill(t: Transaction, churchId: number, actorId: number, id: number) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'DRAFT') throw new ConflictError('only a draft can be deleted; void anything later');
  await exec(t, `DELETE FROM bills WHERE church_id = :churchId AND id = :id`, { churchId, id });
  await recordAudit(t, churchId, { action: 'bill.delete', entityType: 'bill', entityId: id, actorId, data: { billNo: toInt(row.bill_no) } });
}

/** Advisory budget warnings per account+fund on the bill. Never blocks. */
async function budgetWarnings(t: Transaction, churchId: number, billId: number, billDate: string) {
  const lines = await loadLines(t, churchId, billId);
  const grouped = new Map<string, { accountId: number; fundId: number; amount: number; code: string }>();
  for (const l of lines) {
    const key = `${l.account_id}:${l.fund_id}`;
    const slot = grouped.get(key) ?? { accountId: toInt(l.account_id), fundId: toInt(l.fund_id), amount: 0, code: l.account_code };
    slot.amount += toInt(l.amount_minor);
    grouped.set(key, slot);
  }
  const warnings: Array<{ accountId: number; fundId: number; message: string }> = [];
  for (const g of grouped.values()) {
    const check = await checkBudget(t, churchId, { accountId: g.accountId, fundId: g.fundId, amountMinor: g.amount, date: billDate, excludeBillId: billId });
    if (check.hasBudget && check.warning) warnings.push({ accountId: g.accountId, fundId: g.fundId, message: `${g.code}: ${check.warning}` });
  }
  return warnings;
}

export async function submitBill(t: Transaction, churchId: number, actorId: number, id: number) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'DRAFT') throw new ConflictError(`a ${String(row.status).toLowerCase()} bill cannot be submitted`);
  const settings = await loadSettings(t, churchId);
  const total = toInt(row.total_minor);
  const required = settings.dualApprovalThresholdMinor > 0 && total >= settings.dualApprovalThresholdMinor ? 2 : 1;
  const warnings = await budgetWarnings(t, churchId, id, dateOnly(row.bill_date));
  await exec(t, `UPDATE bills SET status = 'SUBMITTED', submitted_by = :actorId, submitted_at = :now, required_approvals = :required, warnings = :warnings, rejected_reason = NULL, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    actorId, now: new Date(), required, warnings: JSON.stringify(warnings), churchId, id
  });
  await recordAudit(t, churchId, { action: 'bill.submit', entityType: 'bill', entityId: id, actorId, data: { total: fromMinor(total), requiredApprovals: required } });
  // Small spend below the policy threshold is approved on submission; it is recorded as automatic.
  if (settings.approvalThresholdMinor > 0 && total < settings.approvalThresholdMinor) {
    await exec(t, `INSERT INTO bill_approvals (church_id, bill_id, approver_id, auto) VALUES (:churchId, :id, :actorId, :auto)`, { churchId, id, actorId, auto: true });
    await postApproved(t, churchId, actorId, id, undefined);
    await recordAudit(t, churchId, { action: 'bill.auto_approve', entityType: 'bill', entityId: id, actorId, data: { threshold: fromMinor(settings.approvalThresholdMinor) } });
  }
  return getBill(t, churchId, id);
}

async function postApproved(t: Transaction, churchId: number, actorId: number, id: number, postingDate: string | undefined) {
  const row = await loadRow(t, churchId, id);
  const lines = await loadLines(t, churchId, id);
  const ap = await accountIdByKey(t, churchId, 'AP');
  const date = postingDate ?? dateOnly(row.bill_date);
  const entryLines: PostLine[] = lines.map((l) => ({
    accountId: toInt(l.account_id), fundId: toInt(l.fund_id), debit: toInt(l.amount_minor), ministryId: l.ministry_id === null ? null : toInt(l.ministry_id), memo: l.description
  }));
  const perFund = new Map<number, number>();
  for (const l of lines) perFund.set(toInt(l.fund_id), (perFund.get(toInt(l.fund_id)) ?? 0) + toInt(l.amount_minor));
  for (const [fundId, amount] of [...perFund].sort((a, b) => a[0] - b[0])) entryLines.push({ accountId: ap, fundId, credit: amount });
  const posted = await postEntry(
    { entryDate: date, memo: `Bill #${row.bill_no} ${row.vendor_name}${row.reference ? ` ref ${row.reference}` : ''}`.slice(0, 500), sourceType: 'BILL', sourceId: id, actorId, lines: entryLines, idempotencyKey: `bill:${id}` },
    t,
    churchId
  );
  const warnings = await budgetWarnings(t, churchId, id, dateOnly(row.bill_date));
  await exec(t, `UPDATE bills SET status = 'APPROVED', approved_at = :now, posting_date = :date, journal_entry_id = :entry, warnings = :warnings, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    now: new Date(), date, entry: posted.id, warnings: JSON.stringify(warnings), churchId, id
  });
}

/**
 * One approval. The bill row is locked first, so two approvers clicking at the same instant are
 * serialised: each is counted once, and the bill is posted to the ledger exactly once, by
 * whichever approval reaches the required count.
 */
export async function approveBill(t: Transaction, churchId: number, actorId: number, id: number, options: { postingDate?: string } = {}) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'SUBMITTED') throw new ConflictError(row.status === 'DRAFT' ? 'submit the bill before approving it' : `the bill is ${String(row.status).toLowerCase()}, not awaiting approval`);
  const settings = await loadSettings(t, churchId);
  if (settings.requireSeparationOfDuties && (toInt(row.submitted_by) === actorId || (row.created_by !== null && toInt(row.created_by) === actorId))) {
    throw new ConflictError('separation of duties: the person who prepared or submitted a bill cannot approve it');
  }
  if (await selectOne(t, `SELECT id FROM bill_approvals WHERE church_id = :churchId AND bill_id = :id AND approver_id = :actorId`, { churchId, id, actorId })) {
    throw new ConflictError('you have already approved this bill; it needs a different approver');
  }
  await exec(t, `INSERT INTO bill_approvals (church_id, bill_id, approver_id) VALUES (:churchId, :id, :actorId)`, { churchId, id, actorId });
  const count = toInt((await selectOne<any>(t, `SELECT COUNT(*) AS n FROM bill_approvals WHERE church_id = :churchId AND bill_id = :id`, { churchId, id }))?.n);
  const required = toInt(row.required_approvals);
  if (count >= required) await postApproved(t, churchId, actorId, id, options.postingDate);
  await recordAudit(t, churchId, { action: 'bill.approve', entityType: 'bill', entityId: id, actorId, data: { approvals: count, required } });
  return getBill(t, churchId, id);
}

export async function rejectBill(t: Transaction, churchId: number, actorId: number, id: number, reason: string) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'SUBMITTED') throw new ConflictError('only a submitted bill can be sent back');
  await exec(t, `DELETE FROM bill_approvals WHERE church_id = :churchId AND bill_id = :id`, { churchId, id });
  await exec(t, `UPDATE bills SET status = 'DRAFT', rejected_reason = :reason, submitted_by = NULL, submitted_at = NULL, updated_at = :now WHERE church_id = :churchId AND id = :id`, { reason, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'bill.reject', entityType: 'bill', entityId: id, actorId, data: { reason } });
  return getBill(t, churchId, id);
}

async function fundOutstanding(t: Transaction, churchId: number, billId: number): Promise<Map<number, number>> {
  const totals = await select<any>(t, `SELECT fund_id, SUM(amount_minor) AS n FROM bill_lines WHERE church_id = :churchId AND bill_id = :billId GROUP BY fund_id`, { churchId, billId });
  const paid = await select<any>(
    t,
    `SELECT a.fund_id, SUM(a.amount_minor) AS n FROM bill_payment_allocations a JOIN bill_payments p ON p.church_id = a.church_id AND p.id = a.payment_id
      WHERE a.church_id = :churchId AND p.bill_id = :billId AND p.status = 'POSTED' GROUP BY a.fund_id`,
    { churchId, billId }
  );
  const out = new Map<number, number>();
  for (const r of totals) out.set(toInt(r.fund_id), toInt(r.n));
  for (const r of paid) out.set(toInt(r.fund_id), (out.get(toInt(r.fund_id)) ?? 0) - toInt(r.n));
  return out;
}

export interface PayInput {
  amountMinor: number;
  paidDate?: string;
  bankAccountId?: number;
  accountId?: number;
  reference?: string | null;
  idempotencyKey?: string | null;
}

export async function payBill(t: Transaction, churchId: number, actorId: number, id: number, input: PayInput) {
  if (input.idempotencyKey) {
    const prior = await selectOne<any>(t, `SELECT id, bill_id FROM bill_payments WHERE church_id = :churchId AND idempotency_key = :k`, { churchId, k: input.idempotencyKey });
    if (prior) {
      if (toInt(prior.bill_id) !== id) throw new ConflictError('that idempotency key belongs to a payment on a different bill');
      return { replayed: true, payment: await getPayment(t, churchId, toInt(prior.id)), bill: await getBill(t, churchId, id) };
    }
  }
  const row = await loadRow(t, churchId, id, true);
  if (row.status !== 'APPROVED' && row.status !== 'PARTIALLY_PAID') {
    throw new ConflictError(row.status === 'PAID' ? 'the bill is already fully paid' : `a ${String(row.status).toLowerCase()} bill cannot be paid`);
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new BadRequestError('the payment must be a positive amount');
  const outstanding = toInt(row.total_minor) - toInt(row.paid_minor);
  if (input.amountMinor > outstanding) throw new BadRequestError(`overpayment refused: ${fromMinor(input.amountMinor)} is more than the ${fromMinor(outstanding)} still owed`);
  const from = await resolveCashAccount(t, churchId, { bankAccountId: input.bankAccountId, accountId: input.accountId });
  const paidDate = input.paidDate ?? today();
  const ap = await accountIdByKey(t, churchId, 'AP');

  const perFund = await fundOutstanding(t, churchId, id);
  const funds = [...perFund].filter(([, v]) => v > 0).sort((a, b) => a[0] - b[0]);
  const shares = allocate(input.amountMinor, funds.map(([, v]) => v));

  await exec(t, `INSERT INTO bill_payments (church_id, bill_id, paid_date, amount_minor, from_account_id, reference, idempotency_key, created_by) VALUES (:churchId, :id, :paidDate, :amount, :from, :reference, :key, :actorId)`, {
    churchId, id, paidDate, amount: input.amountMinor, from, reference: input.reference ?? null, key: input.idempotencyKey ?? null, actorId
  });
  const payment = await selectOne<any>(t, `SELECT id FROM bill_payments WHERE church_id = :churchId AND bill_id = :id ORDER BY id DESC LIMIT 1`, { churchId, id });
  const paymentId = toInt(payment!.id);
  const lines: PostLine[] = [];
  funds.forEach(([fundId], i) => {
    if (shares[i] <= 0) return;
    lines.push({ accountId: ap, fundId, debit: shares[i] }, { accountId: from, fundId, credit: shares[i] });
  });
  for (let i = 0; i < funds.length; i += 1) {
    if (shares[i] > 0) {
      await exec(t, `INSERT INTO bill_payment_allocations (church_id, payment_id, fund_id, amount_minor) VALUES (:churchId, :paymentId, :fundId, :amount)`, { churchId, paymentId, fundId: funds[i][0], amount: shares[i] });
    }
  }
  const posted = await postEntry(
    { entryDate: paidDate, memo: `Payment of bill #${row.bill_no} ${row.vendor_name}${input.reference ? ` ref ${input.reference}` : ''}`.slice(0, 500), sourceType: 'BILL_PAYMENT', sourceId: paymentId, actorId, lines, idempotencyKey: input.idempotencyKey ? `pay:${input.idempotencyKey}` : `billpay:${paymentId}` },
    t,
    churchId
  );
  await exec(t, `UPDATE bill_payments SET journal_entry_id = :entry WHERE church_id = :churchId AND id = :paymentId`, { entry: posted.id, churchId, paymentId });
  const paid = toInt(row.paid_minor) + input.amountMinor;
  await exec(t, `UPDATE bills SET paid_minor = :paid, status = :status, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    paid, status: paid === toInt(row.total_minor) ? 'PAID' : 'PARTIALLY_PAID', now: new Date(), churchId, id
  });
  await recordAudit(t, churchId, { action: 'bill.pay', entityType: 'bill', entityId: id, actorId, data: { paymentId, amount: fromMinor(input.amountMinor) } });
  return { replayed: false, payment: await getPayment(t, churchId, paymentId), bill: await getBill(t, churchId, id) };
}

async function getPayment(t: Transaction, churchId: number, id: number) {
  const r = await selectOne<any>(t, `SELECT * FROM bill_payments WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!r) throw new NotFoundError(`payment ${id} was not found`);
  return mapPayment(r);
}

const mapPayment = (r: any) => ({
  id: toInt(r.id), billId: toInt(r.bill_id), paidDate: dateOnly(r.paid_date), amount: fromMinor(r.amount_minor), amountMinor: toInt(r.amount_minor), fromAccountId: toInt(r.from_account_id),
  reference: r.reference as string | null, status: r.status as 'POSTED' | 'VOID', journalEntryId: r.journal_entry_id === null ? null : toInt(r.journal_entry_id), voidReason: r.void_reason as string | null
});

export async function voidPayment(t: Transaction, churchId: number, actorId: number, billId: number, paymentId: number, reason: string) {
  const bill = await loadRow(t, churchId, billId, true);
  const p = await selectOne<any>(t, `SELECT * FROM bill_payments WHERE church_id = :churchId AND id = :paymentId AND bill_id = :billId`, { churchId, paymentId, billId });
  if (!p) throw new NotFoundError(`payment ${paymentId} was not found on this bill`);
  if (p.status === 'VOID') throw new ConflictError('the payment is already void');
  await reverseEntry(t, churchId, toInt(p.journal_entry_id), { reason: `void payment ${paymentId}: ${reason}`, date: today(), actorId, allowSourced: true });
  await exec(t, `UPDATE bill_payments SET status = 'VOID', voided_by = :actorId, void_reason = :reason WHERE church_id = :churchId AND id = :paymentId`, { actorId, reason, churchId, paymentId });
  const paid = toInt(bill.paid_minor) - toInt(p.amount_minor);
  await exec(t, `UPDATE bills SET paid_minor = :paid, status = :status, updated_at = :now WHERE church_id = :churchId AND id = :billId`, {
    paid, status: paid === 0 ? 'APPROVED' : 'PARTIALLY_PAID', now: new Date(), churchId, billId
  });
  await recordAudit(t, churchId, { action: 'bill.payment_void', entityType: 'bill', entityId: billId, actorId, data: { paymentId, reason } });
  return getBill(t, churchId, billId);
}

export async function voidBill(t: Transaction, churchId: number, actorId: number, id: number, reason: string) {
  const row = await loadRow(t, churchId, id, true);
  if (row.status === 'VOID') throw new ConflictError('the bill is already void');
  if (row.status === 'PAID' || row.status === 'PARTIALLY_PAID') throw new ConflictError('the bill has payments; void those first');
  const live = await selectOne(t, `SELECT id FROM bill_payments WHERE church_id = :churchId AND bill_id = :id AND status = 'POSTED' LIMIT 1`, { churchId, id });
  if (live) throw new ConflictError('the bill has payments; void those first');
  if (row.status === 'APPROVED' && row.journal_entry_id !== null) {
    await reverseEntry(t, churchId, toInt(row.journal_entry_id), { reason: `void bill #${row.bill_no}: ${reason}`, date: today(), actorId, allowSourced: true });
  }
  await exec(t, `UPDATE bills SET status = 'VOID', void_reason = :reason, voided_by = :actorId, voided_at = :now, updated_at = :now WHERE church_id = :churchId AND id = :id`, { reason, actorId, now: new Date(), churchId, id });
  await recordAudit(t, churchId, { action: 'bill.void', entityType: 'bill', entityId: id, actorId, data: { reason, billNo: toInt(row.bill_no) } });
  return getBill(t, churchId, id);
}

/** What may be attached to a bill, with the leading bytes each type must have so a renamed file is refused. */
export const ATTACHMENT_TYPES: Record<string, (head: Buffer) => boolean> = {
  'application/pdf': (h) => h.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/png': (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  'image/webp': (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
  'text/csv': () => true,
  'text/plain': () => true
};

export interface AttachmentUpload {
  fileName: string;
  contentType: string;
  body: Buffer;
  /** Optional checksum the client computed; a mismatch means the upload was damaged in transit. */
  expectedSha256?: string;
}

/**
 * Stores the file in the object store under a tenant-prefixed key, then records it. The key is made
 * here and never taken from the caller, so one church can never point a row at another's object.
 */
export async function addAttachment(t: Transaction, churchId: number, actorId: number, billId: number, upload: AttachmentUpload) {
  const row = await loadRow(t, churchId, billId);
  if (row.status === 'VOID') throw new ConflictError('a void bill takes no attachments');
  const type = upload.contentType.toLowerCase();
  const check = ATTACHMENT_TYPES[type];
  if (!check) throw new BadRequestError(`${upload.contentType} is not an accepted attachment type (PDF, PNG, JPEG, WebP, CSV or plain text)`);
  if (upload.body.length === 0) throw new BadRequestError('the file is empty');
  if (upload.body.length > env.ATTACHMENT_MAX_BYTES) throw new BadRequestError(`the file is larger than the ${Math.floor(env.ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB limit`);
  if (!check(upload.body.subarray(0, 16))) throw new BadRequestError('the file content does not match its declared type');
  const digest = sha256(upload.body);
  if (upload.expectedSha256 && upload.expectedSha256.toLowerCase() !== digest) throw new BadRequestError('the checksum does not match the uploaded bytes; try again');
  const count = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM bill_attachments WHERE church_id = :churchId AND bill_id = :billId`, { churchId, billId });
  if (toInt(count?.n) >= 20) throw new ConflictError('a bill holds at most 20 attachments');

  const fileName = safeFileName(upload.fileName);
  const key = tenantKey(churchId, 'bills', String(billId), `${randomUUID()}-${fileName}`);
  const store = objectStore();
  await store.put(key, upload.body, type);
  try {
    await exec(t, `INSERT INTO bill_attachments (church_id, bill_id, file_name, content_type, size_bytes, storage_key, sha256, uploaded_by, created_at) VALUES (:churchId, :billId, :fileName, :contentType, :sizeBytes, :key, :digest, :actorId, :now)`, { churchId, billId, fileName, contentType: type, sizeBytes: upload.body.length, key, digest, actorId, now: new Date() });
    await recordAudit(t, churchId, { action: 'bill.attachment.add', entityType: 'bill', entityId: billId, actorId, data: { fileName, sizeBytes: upload.body.length, sha256: digest } });
  } catch (error) {
    await store.delete(key).catch(() => undefined);
    throw error;
  }
  return getBill(t, churchId, billId);
}

/** A short-lived download link for one attachment; the row is looked up by church AND bill, so ids from another church find nothing. */
export async function attachmentLink(t: Transaction, churchId: number, billId: number, attachmentId: number) {
  await loadRow(t, churchId, billId);
  const a = await selectOne<any>(t, `SELECT * FROM bill_attachments WHERE church_id = :churchId AND bill_id = :billId AND id = :attachmentId`, { churchId, billId, attachmentId });
  if (!a) throw new NotFoundError(`attachment ${attachmentId} was not found on this bill`);
  // Belt and braces: a row can only ever hold its own church's prefix, and a doctored one is refused.
  if (!String(a.storage_key).startsWith(`tenants/${churchId}/`)) throw new NotFoundError(`attachment ${attachmentId} was not found on this bill`);
  const ttlSeconds = 300;
  const url = await objectStore().downloadUrl(a.storage_key, { fileName: a.file_name, contentType: a.content_type, ttlSeconds });
  return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(), fileName: a.file_name, sha256: a.sha256 ?? null };
}

export async function removeAttachment(t: Transaction, churchId: number, billId: number, attachmentId: number) {
  const row = await loadRow(t, churchId, billId);
  if (row.status === 'PAID' || row.status === 'VOID') throw new ConflictError('attachments on a settled bill are kept');
  const a = await selectOne<any>(t, `SELECT storage_key FROM bill_attachments WHERE church_id = :churchId AND bill_id = :billId AND id = :attachmentId`, { churchId, billId, attachmentId });
  if (!a) throw new NotFoundError(`attachment ${attachmentId} was not found on this bill`);
  await exec(t, `DELETE FROM bill_attachments WHERE church_id = :churchId AND bill_id = :billId AND id = :attachmentId`, { churchId, billId, attachmentId });
  if (String(a.storage_key).startsWith(`tenants/${churchId}/`)) await objectStore().delete(a.storage_key).catch(() => undefined);
  return getBill(t, churchId, billId);
}

export async function getBill(t: Transaction, churchId: number, id: number) {
  const row = await loadRow(t, churchId, id);
  const [lines, approvals, payments, attachments] = await Promise.all([
    loadLines(t, churchId, id),
    select<any>(t, `SELECT approver_id, approved_at, auto FROM bill_approvals WHERE church_id = :churchId AND bill_id = :id ORDER BY id`, { churchId, id }),
    select<any>(t, `SELECT * FROM bill_payments WHERE church_id = :churchId AND bill_id = :id ORDER BY id`, { churchId, id }),
    select<any>(t, `SELECT * FROM bill_attachments WHERE church_id = :churchId AND bill_id = :id ORDER BY id`, { churchId, id })
  ]);
  return {
    ...mapBill(row),
    lines: lines.map((l) => ({
      lineNo: toInt(l.line_no), accountId: toInt(l.account_id), accountCode: l.account_code, accountName: l.account_name, fundId: toInt(l.fund_id), fundCode: l.fund_code,
      ministryId: l.ministry_id === null ? null : toInt(l.ministry_id), description: l.description, amount: fromMinor(l.amount_minor)
    })),
    approvals: approvals.map((a) => ({ approverId: toInt(a.approver_id), approvedAt: iso(a.approved_at), auto: a.auto === true || a.auto === 1 })),
    payments: payments.map(mapPayment),
    attachments: attachments.map((a) => ({ id: toInt(a.id), fileName: a.file_name, contentType: a.content_type, sizeBytes: toInt(a.size_bytes), sha256: a.sha256 ?? null, createdAt: iso(a.created_at) }))
  };
}

export async function listBills(t: Transaction, churchId: number, f: { status?: string; vendorId?: number; kind?: string; from?: string; to?: string; q?: string; overdue?: boolean; limit: number; cursor?: string }) {
  const where = ['b.church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.status) { where.push('b.status = ?'); params.push(f.status); }
  if (f.vendorId) { where.push('b.vendor_id = ?'); params.push(f.vendorId); }
  if (f.kind) { where.push('b.kind = ?'); params.push(f.kind); }
  if (f.from) { where.push('b.bill_date >= ?'); params.push(f.from); }
  if (f.to) { where.push('b.bill_date <= ?'); params.push(f.to); }
  if (f.q) { where.push('(LOWER(v.name) LIKE ? OR LOWER(COALESCE(b.reference, \'\')) LIKE ? OR LOWER(COALESCE(b.memo, \'\')) LIKE ?)'); const like = `%${f.q.toLowerCase().replace(/[%_]/g, '')}%`; params.push(like, like, like); }
  if (f.overdue) { where.push(`b.status IN ('APPROVED','PARTIALLY_PAID') AND b.due_date < ?`); params.push(today()); }
  const cursor = decodeCursor<{ d: string; id: number }>(f.cursor);
  if (cursor) { where.push('(b.bill_date < ? OR (b.bill_date = ? AND b.id < ?))'); params.push(cursor.d, cursor.d, cursor.id); }
  const rows = await select<any>(t, `SELECT b.*, v.name AS vendor_name FROM bills b JOIN vendors v ON v.church_id = b.church_id AND v.id = b.vendor_id WHERE ${where.join(' AND ')} ORDER BY b.bill_date DESC, b.id DESC LIMIT ?`, [...params, f.limit + 1]);
  return toKeysetPage(rows.map(mapBill), f.limit, (b) => ({ d: b.billDate, id: b.id }));
}

/** Who is owed what, bucketed by how late it is, as of a date. */
export async function agingReport(t: Transaction, churchId: number, asOf: string) {
  const rows = await select<any>(
    t,
    `SELECT b.id, b.bill_no, b.vendor_id, v.name AS vendor_name, b.due_date, (b.total_minor - b.paid_minor) AS owed
       FROM bills b JOIN vendors v ON v.church_id = b.church_id AND v.id = b.vendor_id
      WHERE b.church_id = :churchId AND b.status IN ('APPROVED','PARTIALLY_PAID') AND b.bill_date <= :asOf ORDER BY v.name, b.due_date`,
    { churchId, asOf }
  );
  const buckets = ['current', 'days1to30', 'days31to60', 'days61to90', 'over90'] as const;
  const blank = () => Object.fromEntries([...buckets, 'total'].map((b) => [b, 0])) as Record<string, number>;
  const byVendor = new Map<number, { vendorId: number; vendor: string; sums: Record<string, number>; bills: any[] }>();
  const totals = blank();
  for (const r of rows) {
    const late = Math.round((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dateOnly(r.due_date)}T00:00:00Z`)) / 86_400_000);
    const bucket = late <= 0 ? 'current' : late <= 30 ? 'days1to30' : late <= 60 ? 'days31to60' : late <= 90 ? 'days61to90' : 'over90';
    const owed = toInt(r.owed);
    const slot = byVendor.get(toInt(r.vendor_id)) ?? { vendorId: toInt(r.vendor_id), vendor: r.vendor_name, sums: blank(), bills: [] as any[] };
    slot.sums[bucket] += owed;
    slot.sums.total += owed;
    slot.bills.push({ billId: toInt(r.id), billNo: toInt(r.bill_no), dueDate: dateOnly(r.due_date), daysOverdue: Math.max(late, 0), owed: fromMinor(owed), bucket });
    byVendor.set(slot.vendorId, slot);
    totals[bucket] += owed;
    totals.total += owed;
  }
  const fmt = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fromMinor(v)]));
  return { asOf, vendors: [...byVendor.values()].map((v) => ({ vendorId: v.vendorId, vendor: v.vendor, ...fmt(v.sums), bills: v.bills })), totals: fmt(totals) };
}

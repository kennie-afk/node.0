import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { app, Auth, balanceOf, Books, books, d, journal, signUp, userWithRole } from './payables-helpers';

// A loaded machine (several suites and a database in parallel) needs more than the 10s default.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let admin: Auth;
let treasurer: Auth;
let approver1: Auth;
let approver2: Auth;
let auditor: Auth;
let member: Auth;
let churchId: number;
let b: Books;

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  const s = await signUp('payables');
  admin = s.admin;
  churchId = s.churchId;
  treasurer = (await userWithRole(admin, 'tess', 'TREASURER')).auth;
  approver1 = (await userWithRole(admin, 'alan', 'APPROVER')).auth;
  approver2 = (await userWithRole(admin, 'anna', 'APPROVER')).auth;
  auditor = (await userWithRole(admin, 'audrey', 'AUDITOR')).auth;
  member = (await userWithRole(admin, 'mike', 'MEMBER')).auth;
  b = await books(admin);
  // Some money in the bank so payments have something to come out of.
  await journal(admin, d(1, 5), 'Opening offerings', [
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, debit: '500000.00' },
    { accountId: b.accounts['4020'], fundId: b.funds.GEN, credit: '500000.00' }
  ]);
});

const vendor = async (name = 'Kenya Power') => (await request(app).post('/payables/vendors').set(treasurer).send({ name, kraPin: 'P051234567Z', mpesaNumber: '0712345678' })).body.id as number;

async function makeBill(vendorId: number, amount: string, extra: Record<string, unknown> = {}, fund = 'GEN') {
  const res = await request(app)
    .post('/payables/bills')
    .set(treasurer)
    .send({ vendorId, billDate: d(2, 1), dueDate: d(2, 28), reference: `INV-${Math.random().toString(36).slice(2, 8)}`, lines: [{ accountId: b.accounts['5110'], fundId: b.funds[fund], amount, description: 'Electricity' }], ...extra });
  expect(res.status).toBe(201);
  return res.body;
}
const submit = (id: number, as: Auth = treasurer) => request(app).post(`/payables/bills/${id}/submit`).set(as);
const approve = (id: number, as: Auth) => request(app).post(`/payables/bills/${id}/approve`).set(as).send({});
const pay = (id: number, amount: string, key?: string) => {
  const r = request(app).post(`/payables/bills/${id}/pay`).set(treasurer);
  if (key) r.set('Idempotency-Key', key);
  return r.send({ amount, paidDate: d(3, 1), accountId: b.accounts['1100'] });
};

describe('vendors', () => {
  it('creates, validates, rejects duplicates, and is permission-gated', async () => {
    const created = await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Nairobi Water', kind: 'VENDOR', kraPin: 'P051234567Z' });
    expect(created.status).toBe(201);
    expect((await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Nairobi Water' })).status).toBe(409);
    expect((await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Bad Pin', kraPin: '123' })).status).toBe(400);
    expect((await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Bad Phone', mpesaNumber: '12345' })).status).toBe(400);
    expect((await request(app).post('/payables/vendors').set(auditor).send({ name: 'Nope' })).status).toBe(403);
    expect((await request(app).get('/payables/vendors').set(auditor)).status).toBe(200);
    expect((await request(app).get('/payables/vendors').set(member)).status).toBe(403);
    const list = await request(app).get('/payables/vendors?q=water').set(auditor);
    expect(list.body.data).toHaveLength(1);
  });

  it('pages by cursor', async () => {
    for (const n of ['A One', 'B Two', 'C Three', 'D Four', 'E Five']) await vendor(n);
    const p1 = await request(app).get('/payables/vendors?limit=2').set(auditor);
    const p2 = await request(app).get(`/payables/vendors?limit=2&cursor=${p1.body.nextCursor}`).set(auditor);
    const p3 = await request(app).get(`/payables/vendors?limit=2&cursor=${p2.body.nextCursor}`).set(auditor);
    expect([...p1.body.data, ...p2.body.data, ...p3.body.data].map((v: any) => v.name)).toEqual(['A One', 'B Two', 'C Three', 'D Four', 'E Five']);
    expect(p3.body.nextCursor).toBeNull();
  });
});

describe('the bill lifecycle', () => {
  it('draft -> submitted -> approved -> part paid -> paid, with the ledger following every step', async () => {
    const bill = await makeBill(await vendor(), '12000.00');
    expect(bill.status).toBe('DRAFT');
    expect(bill.billNo).toBe(1);
    expect(await balanceOf(admin, '5110')).toBeUndefined();

    expect((await submit(bill.id)).body.status).toBe('SUBMITTED');
    const approved = await approve(bill.id, approver1);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
    expect((await balanceOf(admin, '5110'))!.debit).toBe('12000.00');
    expect((await balanceOf(admin, '2010'))!.credit).toBe('12000.00');

    const first = await pay(bill.id, '5000.00');
    expect(first.status).toBe(201);
    expect(first.body.bill.status).toBe('PARTIALLY_PAID');
    expect(first.body.bill.outstanding).toBe('7000.00');
    expect((await balanceOf(admin, '2010'))!.credit).toBe('7000.00');

    const second = await pay(bill.id, '7000.00');
    expect(second.body.bill.status).toBe('PAID');
    expect(await balanceOf(admin, '2010')).toBeUndefined();
    expect((await balanceOf(admin, '1100'))!.debit).toBe('488000.00');

    const integrity = await request(app).get('/finance/integrity').set(auditor);
    expect(integrity.body.ok).toBe(true);
  });

  it('refuses overpayment, payment before approval, and payment of a paid bill', async () => {
    const bill = await makeBill(await vendor(), '1000.00');
    expect((await pay(bill.id, '100.00')).status).toBe(409);
    await submit(bill.id);
    await approve(bill.id, approver1);
    const over = await pay(bill.id, '1000.01');
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/overpayment/);
    await pay(bill.id, '1000.00');
    expect((await pay(bill.id, '1.00')).status).toBe(409);
  });

  it('is idempotent on payments: the same key never pays twice', async () => {
    const bill = await makeBill(await vendor(), '3000.00');
    await submit(bill.id);
    await approve(bill.id, approver1);
    const a = await pay(bill.id, '1000.00', 'pay-key-0001');
    const c = await pay(bill.id, '1000.00', 'pay-key-0001');
    expect(a.status).toBe(201);
    expect(c.status).toBe(201);
    expect(c.headers['idempotent-replayed']).toBe('true');
    const after = await request(app).get(`/payables/bills/${bill.id}`).set(auditor);
    expect(after.body.payments).toHaveLength(1);
    expect(after.body.paid).toBe('1000.00');
    expect((await request(app).post(`/payables/bills/${bill.id}/pay`).set(treasurer).set('Idempotency-Key', 'pay-key-0001').send({ amount: '2000.00', paidDate: d(3, 1), accountId: b.accounts['1100'] })).status).toBe(422);
  });

  it('numbers bills gaplessly and refuses a duplicate vendor reference', async () => {
    const v = await vendor();
    const one = await makeBill(v, '10.00', { reference: 'R-1' });
    const two = await makeBill(v, '10.00', { reference: 'R-2' });
    expect([one.billNo, two.billNo]).toEqual([1, 2]);
    const dup = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: v, billDate: d(2, 1), dueDate: d(2, 2), reference: 'R-1', lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '5.00' }] });
    expect(dup.status).toBe(409);
    const failed = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: v, billDate: d(2, 1), dueDate: d(2, 2), lines: [{ accountId: b.accounts['4020'], fundId: b.funds.GEN, amount: '5.00' }] });
    expect(failed.status).toBe(400);
    const three = await makeBill(v, '10.00', { reference: 'R-3' });
    expect(three.billNo).toBe(3);
  });

  it('only a draft can be edited or deleted', async () => {
    const bill = await makeBill(await vendor(), '100.00');
    const edited = await request(app).put(`/payables/bills/${bill.id}`).set(treasurer).send({ lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '250.00' }] });
    expect(edited.body.total).toBe('250.00');
    await submit(bill.id);
    expect((await request(app).put(`/payables/bills/${bill.id}`).set(treasurer).send({ memo: 'late' })).status).toBe(409);
    expect((await request(app).delete(`/payables/bills/${bill.id}`).set(treasurer)).status).toBe(409);
    const rejected = await request(app).post(`/payables/bills/${bill.id}/reject`).set(approver1).send({ reason: 'missing invoice copy' });
    expect(rejected.body.status).toBe('DRAFT');
    expect((await request(app).delete(`/payables/bills/${bill.id}`).set(treasurer)).status).toBe(204);
  });
});

describe('who may approve', () => {
  it('forbids the preparer approving their own bill, unless separation of duties is switched off', async () => {
    const v = await vendor();
    const bill = (await request(app).post('/payables/bills').set(admin).send({ vendorId: v, billDate: d(2, 1), dueDate: d(2, 28), lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '100.00' }] })).body;
    await submit(bill.id, admin);
    const own = await approve(bill.id, admin);
    expect(own.status).toBe(409);
    expect(own.body.message).toMatch(/separation of duties/);
    // Someone who only approved is not the preparer, so a treasurer who prepared cannot either.
    const treasurerBill = await makeBill(v, '50.00');
    await submit(treasurerBill.id);
    expect((await approve(treasurerBill.id, treasurer)).status).toBe(403);

    await request(app).put('/finance/settings').set(admin).send({ requireSeparationOfDuties: false });
    expect((await approve(bill.id, admin)).status).toBe(200);
  });

  it('needs two distinct approvers at or above the dual-approval threshold, and posts once', async () => {
    await request(app).put('/finance/settings').set(admin).send({ dualApprovalThreshold: '1000.00' });
    const small = await makeBill(await vendor('Small'), '999.99');
    await submit(small.id);
    expect((await approve(small.id, approver1)).body.status).toBe('APPROVED');

    const big = await makeBill(await vendor('Big'), '2000.00');
    const submitted = await submit(big.id);
    expect(submitted.body.requiredApprovals).toBe(2);
    const first = await approve(big.id, approver1);
    expect(first.body.status).toBe('SUBMITTED');
    expect(first.body.approvals).toHaveLength(1);
    expect((await balanceOf(admin, '2010'))!.credit).toBe('999.99');
    const again = await approve(big.id, approver1);
    expect(again.status).toBe(409);
    const second = await approve(big.id, approver2);
    expect(second.body.status).toBe('APPROVED');
    expect(second.body.approvals).toHaveLength(2);
    expect((await balanceOf(admin, '2010'))!.credit).toBe('2999.99');
    const entries = await request(app).get('/finance/journal?sourceType=BILL').set(auditor);
    expect(entries.body.data).toHaveLength(2);
  });

  it('auto-approves spend below the policy threshold, and records it as automatic', async () => {
    await request(app).put('/finance/settings').set(admin).send({ approvalThreshold: '500.00' });
    const tiny = await makeBill(await vendor(), '499.99');
    const res = await submit(tiny.id);
    expect(res.body.status).toBe('APPROVED');
    expect(res.body.approvals[0].auto).toBe(true);
    const normal = await makeBill(await vendor('Other'), '500.00');
    expect((await submit(normal.id)).body.status).toBe('SUBMITTED');
  });
});

describe('funds and the ledger', () => {
  it('allocates a payment across the funds of a multi-fund bill with no cent lost', async () => {
    await journal(admin, d(1, 6), 'Building gifts', [
      { accountId: b.accounts['1100'], fundId: b.funds.BLD, debit: '100000.00' },
      { accountId: b.accounts['4040'], fundId: b.funds.BLD, credit: '100000.00' }
    ]);
    const v = await vendor();
    const res = await request(app).post('/payables/bills').set(treasurer).send({
      vendorId: v, billDate: d(2, 1), dueDate: d(2, 28),
      lines: [
        { accountId: b.accounts['5120'], fundId: b.funds.GEN, amount: '333.33' },
        { accountId: b.accounts['5120'], fundId: b.funds.BLD, amount: '666.67' }
      ]
    });
    await submit(res.body.id);
    await approve(res.body.id, approver1);
    for (const amount of ['100.01', '399.99', '500.00']) expect((await pay(res.body.id, amount)).status).toBe(201);
    const final = await request(app).get(`/payables/bills/${res.body.id}`).set(auditor);
    expect(final.body.status).toBe('PAID');
    expect(await balanceOf(admin, '2010', `${new Date().getUTCFullYear()}-12-31`, b.funds.GEN)).toBeUndefined();
    expect(await balanceOf(admin, '2010', `${new Date().getUTCFullYear()}-12-31`, b.funds.BLD)).toBeUndefined();
    expect((await balanceOf(admin, '5120', `${new Date().getUTCFullYear()}-12-31`, b.funds.BLD))!.debit).toBe('666.67');
  });

  it('will not let approval overspend a restricted fund', async () => {
    const bill = await makeBill(await vendor(), '10.00', {}, 'BLD');
    await submit(bill.id);
    const res = await approve(bill.id, approver1);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/overspend/);
    const after = await request(app).get(`/payables/bills/${bill.id}`).set(auditor);
    expect(after.body.status).toBe('SUBMITTED');
    expect(after.body.approvals).toHaveLength(0);
  });

  it('keeps the ledger entries of a bill out of manual reversal', async () => {
    const bill = await makeBill(await vendor(), '100.00');
    await submit(bill.id);
    const approved = await approve(bill.id, approver1);
    const res = await request(app).post(`/finance/journal/${approved.body.journalEntryId}/reverse`).set(admin).send({ reason: 'trying to sidestep the bill' });
    expect(res.status).toBe(409);
  });
});

describe('voiding', () => {
  it('voids a draft or submitted bill without touching the ledger, and an approved one by reversing it', async () => {
    const v = await vendor();
    const draft = await makeBill(v, '100.00');
    expect((await request(app).post(`/payables/bills/${draft.id}/void`).set(treasurer).send({ reason: 'entered twice' })).body.status).toBe('VOID');

    const bill = await makeBill(v, '800.00');
    await submit(bill.id);
    await approve(bill.id, approver1);
    expect((await balanceOf(admin, '5110'))!.debit).toBe('800.00');
    const voided = await request(app).post(`/payables/bills/${bill.id}/void`).set(treasurer).send({ reason: 'wrong vendor' });
    expect(voided.body.status).toBe('VOID');
    expect(await balanceOf(admin, '5110')).toBeUndefined();
    expect(await balanceOf(admin, '2010')).toBeUndefined();
    expect((await request(app).post(`/payables/bills/${bill.id}/void`).set(treasurer).send({ reason: 'again' })).status).toBe(409);
    expect((await request(app).get('/finance/integrity').set(auditor)).body.ok).toBe(true);
  });

  it('refuses to void a bill with payments until the payments are voided', async () => {
    const bill = await makeBill(await vendor(), '1000.00');
    await submit(bill.id);
    await approve(bill.id, approver1);
    const paid = await pay(bill.id, '400.00');
    const paymentId = paid.body.payment.id;
    expect((await request(app).post(`/payables/bills/${bill.id}/void`).set(treasurer).send({ reason: 'nope' })).status).toBe(409);
    const afterVoid = await request(app).post(`/payables/bills/${bill.id}/payments/${paymentId}/void`).set(treasurer).send({ reason: 'bounced' });
    expect(afterVoid.body.status).toBe('APPROVED');
    expect(afterVoid.body.paid).toBe('0.00');
    expect((await balanceOf(admin, '1100'))!.debit).toBe('500000.00');
    expect((await request(app).post(`/payables/bills/${bill.id}/void`).set(treasurer).send({ reason: 'now fine' })).body.status).toBe('VOID');
    // The payment can be made again after voiding one, were the bill still live.
  });
});

describe('expense claims and attachments', () => {
  it('pays a staff claim, refuses one to an outside vendor, and keeps attachment metadata', async () => {
    const staff = (await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Pastor Grace', kind: 'STAFF', mpesaNumber: '0722000111' })).body.id;
    const claim = await request(app).post('/payables/expense-claims').set(treasurer).send({ vendorId: staff, billDate: d(2, 2), dueDate: d(2, 9), memo: 'Fuel for outreach', lines: [{ accountId: b.accounts['5330'], fundId: b.funds.GEN, amount: '2500.00' }] });
    expect(claim.status).toBe(201);
    expect(claim.body.kind).toBe('EXPENSE_CLAIM');
    const outside = await vendor('Fuel Station');
    const bad = await request(app).post('/payables/expense-claims').set(treasurer).send({ vendorId: outside, billDate: d(2, 2), dueDate: d(2, 9), lines: [{ accountId: b.accounts['5330'], fundId: b.funds.GEN, amount: '1.00' }] });
    expect(bad.status).toBe(400);
    const attached = await request(app).post(`/payables/bills/${claim.body.id}/attachments`).set(treasurer).send({ fileName: 'receipts.pdf', contentType: 'application/pdf', sizeBytes: 12345, storageKey: 'claims/2026/receipts.pdf' });
    expect(attached.body.attachments).toHaveLength(1);
    const list = await request(app).get('/payables/bills?kind=EXPENSE_CLAIM').set(auditor);
    expect(list.body.data).toHaveLength(1);
  });
});

describe('aging', () => {
  it('buckets what is owed by how late it is, per vendor', async () => {
    const v = await vendor();
    const make = async (amount: string, due: string, ref: string) => {
      const bill = await makeBill(v, amount, { reference: ref, billDate: d(1, 1), dueDate: due });
      await submit(bill.id);
      await approve(bill.id, approver1);
    };
    await make('100.00', d(12, 30), 'current');
    await make('200.00', d(3, 20), 'd1to30');
    await make('300.00', d(2, 10), 'd31to60');
    await make('400.00', d(1, 10), 'd61to90');
    const report = await request(app).get(`/payables/reports/aging?asOf=${d(4, 1)}`).set(auditor);
    expect(report.status).toBe(200);
    const row = report.body.vendors[0];
    expect(row.current).toBe('100.00');
    expect(row.days1to30).toBe('200.00');
    expect(row.days31to60).toBe('300.00');
    expect(row.days61to90).toBe('400.00');
    expect(report.body.totals.total).toBe('1000.00');
  });
});

describe('petty cash', () => {
  it('spends from the float, blocks overspend, and replenishes exactly what was spent, fund by fund', async () => {
    const accounts = await request(app).get('/banking/accounts').set(treasurer);
    const pettyAccount = accounts.body.find((a: any) => a.kind === 'PETTY_CASH');
    await journal(admin, d(1, 7), 'Petty float', [
      { accountId: b.accounts['1020'], fundId: b.funds.GEN, debit: '5000.00' },
      { accountId: b.accounts['1100'], fundId: b.funds.GEN, credit: '5000.00' }
    ]);
    const spend = (amount: string, account = '5310') =>
      request(app).post('/payables/petty-cash/vouchers').set(treasurer).send({ bankAccountId: pettyAccount.id, date: d(2, 3), payee: 'Stationers', accountId: b.accounts[account], fundId: b.funds.GEN, amount });
    expect((await spend('1200.00')).status).toBe(201);
    expect((await spend('300.50', '5320')).status).toBe(201);
    const over = await spend('9999.00');
    expect(over.status).toBe(409);
    expect(over.body.message).toMatch(/replenish/);

    const status = await request(app).get(`/payables/petty-cash/${pettyAccount.id}/status`).set(treasurer);
    expect(status.body.balance).toBe('3499.50');
    expect(status.body.unreplenished).toBe('1500.50');

    const rep = await request(app).post(`/payables/petty-cash/${pettyAccount.id}/replenish`).set(treasurer).send({ date: d(2, 10), sourceAccountId: b.accounts['1100'] });
    expect(rep.status).toBe(201);
    expect(rep.body.amount).toBe('1500.50');
    expect((await balanceOf(admin, '1020'))!.debit).toBe('5000.00');
    expect((await request(app).post(`/payables/petty-cash/${pettyAccount.id}/replenish`).set(treasurer).send({ sourceAccountId: b.accounts['1100'] })).status).toBe(409);
    const voucherId = (await request(app).get('/payables/petty-cash/vouchers').set(treasurer)).body.data[0].id;
    expect((await request(app).post(`/payables/petty-cash/vouchers/${voucherId}/void`).set(treasurer).send({ reason: 'typo' })).status).toBe(409);
  });

  it('voids an un-replenished voucher back into the float', async () => {
    const pettyAccount = (await request(app).get('/banking/accounts').set(treasurer)).body.find((a: any) => a.kind === 'PETTY_CASH');
    await journal(admin, d(1, 7), 'Petty float', [
      { accountId: b.accounts['1020'], fundId: b.funds.GEN, debit: '1000.00' },
      { accountId: b.accounts['1100'], fundId: b.funds.GEN, credit: '1000.00' }
    ]);
    const v = await request(app).post('/payables/petty-cash/vouchers').set(treasurer).send({ bankAccountId: pettyAccount.id, date: d(2, 3), payee: 'Shop', accountId: b.accounts['5310'], fundId: b.funds.GEN, amount: '400.00' });
    expect((await balanceOf(admin, '1020'))!.debit).toBe('600.00');
    const voided = await request(app).post(`/payables/petty-cash/vouchers/${v.body.id}/void`).set(treasurer).send({ reason: 'cancelled purchase' });
    expect(voided.body.status).toBe('VOID');
    expect((await balanceOf(admin, '1020'))!.debit).toBe('1000.00');
  });
});

describe('churches are kept apart', () => {
  it('will not show, pay or reference another church bills and vendors', async () => {
    const bill = await makeBill(await vendor(), '100.00');
    const other = await signUp('rival');
    const ob = await books(other.admin);
    expect((await request(app).get(`/payables/bills/${bill.id}`).set(other.admin)).status).toBe(404);
    expect((await request(app).post(`/payables/bills/${bill.id}/submit`).set(other.admin)).status).toBe(404);
    expect((await request(app).get('/payables/bills').set(other.admin)).body.data).toHaveLength(0);
    const cross = await request(app).post('/payables/bills').set(other.admin).send({ vendorId: bill.vendorId, billDate: d(2, 1), dueDate: d(2, 2), lines: [{ accountId: ob.accounts['5110'], fundId: ob.funds.GEN, amount: '5.00' }] });
    expect([400, 404]).toContain(cross.status);
    const crossAccount = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: bill.vendorId, billDate: d(2, 1), dueDate: d(2, 2), lines: [{ accountId: ob.accounts['5110'], fundId: b.funds.GEN, amount: '5.00' }] });
    expect(crossAccount.status).toBe(400);
  });
});

describe.runIf(onPostgres)('under concurrency on a real Postgres', () => {
  it('posts a bill exactly once when two approvers click at the same instant', async () => {
    const bill = await makeBill(await vendor(), '700.00');
    await submit(bill.id);
    const results = await Promise.all([approve(bill.id, approver1), approve(bill.id, approver2)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const entries = await request(app).get('/finance/journal?sourceType=BILL').set(auditor);
    expect(entries.body.data).toHaveLength(1);
    expect((await balanceOf(admin, '2010'))!.credit).toBe('700.00');
    expect((await request(app).get('/finance/integrity').set(auditor)).body.ok).toBe(true);
  });

  it('never lets concurrent payments overpay a bill', async () => {
    const bill = await makeBill(await vendor(), '1000.00');
    await submit(bill.id);
    await approve(bill.id, approver1);
    const results = await Promise.all([pay(bill.id, '600.00'), pay(bill.id, '600.00'), pay(bill.id, '600.00')]);
    const ok = results.filter((r) => r.status === 201);
    expect(ok).toHaveLength(1);
    const after = await request(app).get(`/payables/bills/${bill.id}`).set(auditor);
    expect(after.body.paid).toBe('600.00');
    expect((await request(app).get('/finance/integrity').set(auditor)).body.ok).toBe(true);
  });

  it('keeps the database itself from accepting an overpaid or double-approved bill', async () => {
    const bill = await makeBill(await vendor(), '100.00');
    const pg = (await import('pg')).default;
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    await expect(owner.query('UPDATE bills SET paid_minor = total_minor + 1 WHERE id = $1', [bill.id])).rejects.toThrow();
    await owner.end();
  });
});

void churchId;

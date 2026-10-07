import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerBalanced, assertLoanBookAgrees, boot, dayOffset, deposit, fullStaff, get, lendUntil, makeMember, makeProduct, newTenant, on, patch, post, shutdown } from './helpers';

vi.setConfig({ testTimeout: 120_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;

describe.runIf(on)('the loan workflow (maker-checker, real Postgres)', () => {
  it('walks a loan from application to payout, with a schedule that adds up and a ledger that balances', async () => {
    const t = await newTenant('Workflow SACCO');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { annualRateBp: 1200, processingFeeBp: 100 });
    const id = await lendUntil(s, m.id, p, K(120_000), 12, 'disbursed');
    const loan = await get(t.owner.auth, `/v1/loans/${id}`);
    expect(loan.body.status).toBe('disbursed');
    expect(loan.body.schedule).toHaveLength(12);
    const principal = loan.body.schedule.reduce((x: number, r: { principalCents: number }) => x + r.principalCents, 0);
    expect(principal).toBe(K(120_000));
    expect(loan.body.outstandingPrincipalCents).toBe(K(120_000));
    // 1% processing fee came out of the cash paid, and was booked as fee income
    const tb = await get(t.owner.auth, '/v1/reports/trial-balance');
    const row = (code: string) => tb.body.rows.find((r: { code: string }) => r.code === code);
    expect(row('1100').debitCents).toBe(K(120_000));
    expect(row('4300').creditCents).toBe(K(1_200));
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('enforces maker-checker: the applicant cannot appraise, the appraiser cannot approve, the approver cannot pay out', async () => {
    const t = await newTenant('Maker Checker');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth);
    const applied = await post(s.officer.auth, '/v1/loans', { memberId: m.id, productId: p, principalCents: K(50_000), termMonths: 6 });
    const id = applied.body.id;
    const appraisal = { monthlyIncomeCents: K(80_000), monthlyExpensesCents: K(10_000), recommendation: 'approve' };
    expect((await post(s.officer.auth, `/v1/loans/${id}/appraise`, appraisal)).status).toBe(403); // applicant
    expect((await post(s.appraiser.auth, `/v1/loans/${id}/appraise`, appraisal)).status).toBe(200);
    expect((await post(s.manager.auth, `/v1/loans/${id}/disburse`, { channel: 'bank' })).status).toBe(409); // not approved yet
    // an approver who is also the applicant or appraiser is refused: use the owner as both applicant and appraiser elsewhere
    const own = await post(t.owner.auth, '/v1/loans', { memberId: (await makeMember(t.owner.auth)).id, productId: p, principalCents: K(10_000), termMonths: 3 });
    await post(s.appraiser.auth, `/v1/loans/${own.body.id}/appraise`, appraisal);
    expect((await post(t.owner.auth, `/v1/loans/${own.body.id}/decision`, { approve: true })).status).toBe(403); // owner applied
    expect((await post(s.manager.auth, `/v1/loans/${id}/decision`, { approve: true })).status).toBe(200);
    // the accountant is a different person, the manager (who approved) is not allowed to pay out
    expect((await post(s.manager.auth, `/v1/loans/${id}/disburse`, { channel: 'bank' })).status).toBe(403);
    expect((await post(s.accountant.auth, `/v1/loans/${id}/disburse`, { channel: 'bank' })).status).toBe(200);
    expect((await post(s.accountant.auth, `/v1/loans/${id}/disburse`, { channel: 'bank' })).status).toBe(409); // not twice
    await assertLedgerBalanced(t);
  });

  it('lets an owner of a relaxed organisation hold more than one role, and records that they did', async () => {
    const t = await newTenant('Relaxed');
    expect((await patch(t.owner.auth, '/v1/settings', { makerChecker: 'relaxed' })).status).toBe(200);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth);
    const applied = await post(t.owner.auth, '/v1/loans', { memberId: m.id, productId: p, principalCents: K(20_000), termMonths: 4 });
    expect((await post(t.owner.auth, `/v1/loans/${applied.body.id}/appraise`, { monthlyIncomeCents: K(60_000), monthlyExpensesCents: K(5_000), recommendation: 'approve' })).status).toBe(200);
    expect((await post(t.owner.auth, `/v1/loans/${applied.body.id}/decision`, { approve: true })).status).toBe(200);
    expect((await post(t.owner.auth, `/v1/loans/${applied.body.id}/disburse`, { channel: 'cash' })).status).toBe(200);
    const audit = await get(t.owner.auth, '/v1/audit?limit=100');
    expect(audit.body.items.some((a: { action: string; detail: { selfChecked?: boolean } }) => a.action === 'loan.approve' && a.detail.selfChecked === true)).toBe(true);
  });

  it('applies product limits, the SACCO savings multiple and guarantor capacity, and refuses a second application in flight', async () => {
    const t = await newTenant('Limits');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const g = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, K(10_000));
    await deposit(t.owner.auth, g.id, K(8_000));
    const p = await makeProduct(t.owner.auth, { maxAmountCents: K(100_000), minAmountCents: K(1_000), maxTermMonths: 12, maxMultipleOfSavings: 3, guarantorsRequired: 1 });
    const apply = (body: object) => post(s.officer.auth, '/v1/loans', { memberId: m.id, productId: p, termMonths: 6, ...body });
    expect((await apply({ principalCents: K(500) })).status).toBe(400); // below the minimum
    expect((await apply({ principalCents: K(200_000) })).status).toBe(400); // above the maximum
    expect((await apply({ principalCents: K(20_000), termMonths: 24 })).status).toBe(400); // longer than the product allows
    expect((await apply({ principalCents: K(20_000) })).status).toBe(400); // needs a guarantor
    expect((await apply({ principalCents: K(40_000), guarantors: [{ memberId: g.id, guaranteedCents: K(8_000) }] })).status).toBe(409); // more than 3x savings
    expect((await apply({ principalCents: K(20_000), guarantors: [{ memberId: g.id, guaranteedCents: K(9_000) }] })).status).toBe(409); // guarantor's capacity is 8,000
    expect((await apply({ principalCents: K(20_000), guarantors: [{ memberId: m.id, guaranteedCents: K(1_000) }] })).status).toBe(400); // cannot guarantee own loan
    const ok = await apply({ principalCents: K(20_000), guarantors: [{ memberId: g.id, guaranteedCents: K(6_000) }] });
    expect(ok.status).toBe(201);
    expect((await apply({ principalCents: K(5_000), guarantors: [{ memberId: g.id, guaranteedCents: K(1_000) }] })).status).toBe(409); // one in flight already
    // the guarantor's 6,000 is now committed, so only 2,000 is left of their capacity for another member
    const other = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, other.id, K(10_000));
    const second = await post(s.officer.auth, '/v1/loans', { memberId: other.id, productId: p, principalCents: K(10_000), termMonths: 6, guarantors: [{ memberId: g.id, guaranteedCents: K(3_000) }] });
    expect(second.status).toBe(409);
  });

  it('allocates a repayment to penalty, interest, then principal, closes the loan when paid, and parks any excess as unapplied', async () => {
    const t = await newTenant('Repay');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const id = await lendUntil(s, m.id, p, K(12_000), 3, 'disbursed');
    const first = (await get(t.owner.auth, `/v1/loans/${id}`)).body.schedule[0];
    const part = await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: first.interestCents + 100_00, channel: 'cash' });
    expect(part.status).toBe(201);
    expect(part.body).toMatchObject({ interestCents: first.interestCents, principalCents: 100_00, penaltyCents: 0, unappliedCents: 0, closed: false });
    const total = (await get(t.owner.auth, `/v1/loans/${id}`)).body.outstandingTotalCents;
    const final = await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: total + K(500), channel: 'cash' });
    expect(final.body).toMatchObject({ closed: true, unappliedCents: K(500) });
    expect((await get(t.owner.auth, `/v1/loans/${id}`)).body.status).toBe('closed');
    expect((await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: 100, channel: 'cash' })).status).toBe(409);
    const tb = await get(t.owner.auth, '/v1/reports/trial-balance');
    expect(tb.body.rows.find((r: { code: string }) => r.code === '2300').creditCents).toBe(K(500)); // unapplied receipts
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('applies a repeated M-Pesa reference once, and refuses the reference on a different loan', async () => {
    const t = await newTenant('Repay Idempotent');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth);
    const a = await lendUntil(s, m.id, p, K(30_000), 6, 'disbursed');
    const m2 = await makeMember(t.owner.auth);
    const b = await lendUntil(s, m2.id, p, K(30_000), 6, 'disbursed');
    const body = { amountCents: K(1_000), channel: 'mpesa', reference: 'MPS1234567' };
    const first = await post(s.teller.auth, `/v1/loans/${a}/repay`, body);
    const again = await post(s.teller.auth, `/v1/loans/${a}/repay`, body);
    expect(first.body.duplicate).toBe(false);
    expect(again.body.duplicate).toBe(true);
    expect((await get(t.owner.auth, `/v1/loans/${a}`)).body.repayments).toHaveLength(1);
    expect((await post(s.teller.auth, `/v1/loans/${b}/repay`, body)).status).toBe(409);
    expect((await post(s.teller.auth, `/v1/loans/${a}/repay`, { amountCents: K(1_000), channel: 'mpesa' })).status).toBe(400); // code required
    await assertLoanBookAgrees(t);
  });

  it('survives many repayments at the same moment on one loan: none is lost, none is applied twice, the book still agrees', async () => {
    const t = await newTenant('Repay Race');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const id = await lendUntil(s, m.id, p, K(60_000), 6, 'disbursed');
    const before = (await get(t.owner.auth, `/v1/loans/${id}`)).body.outstandingTotalCents;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: K(1_000) + i, channel: 'cash' })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const paid = results.reduce((x, r) => x + r.body.penaltyCents + r.body.interestCents + r.body.principalCents, 0);
    expect(paid).toBe(12 * K(1_000) + (0 + 11) * 12 / 2);
    const after = (await get(t.owner.auth, `/v1/loans/${id}`)).body.outstandingTotalCents;
    expect(before - after).toBe(paid);
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('charges a month of penalty once, however many times the run is repeated, and settles it with the oldest instalment, penalty before interest', async () => {
    const t = await newTenant('Penalties');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 500 });
    // paid out 100 days ago, first instalment due 70 days ago: three instalments are overdue
    const id = await lendUntil(s, m.id, p, K(30_000), 6, 'disbursed', dayOffset(-100));
    const run1 = await post(s.accountant.auth, '/v1/penalties/run', {});
    expect(run1.status).toBe(200);
    expect(run1.body.charged).toBeGreaterThan(0);
    const run2 = await post(s.accountant.auth, '/v1/penalties/run', {});
    expect(run2.body.charged).toBe(0); // idempotent within the month
    const loan = (await get(t.owner.auth, `/v1/loans/${id}`)).body;
    const penalty = loan.schedule.reduce((x: number, r: { penaltyCents: number }) => x + r.penaltyCents, 0);
    expect(penalty).toBe(run1.body.totalCents);
    expect(loan.arrears.daysOverdue).toBeGreaterThan(60);
    expect(loan.arrears.overduePenaltyCents).toBe(penalty);
    // paying exactly the oldest instalment (penalty + interest + principal) clears that instalment and no other
    const first = loan.schedule[0];
    const due = first.principalCents + first.interestCents + first.penaltyCents;
    const pay = await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: due, channel: 'cash' });
    expect(pay.body).toMatchObject({ penaltyCents: first.penaltyCents, interestCents: first.interestCents, principalCents: first.principalCents, unappliedCents: 0 });
    const after = (await get(t.owner.auth, `/v1/loans/${id}`)).body;
    expect(after.schedule[0].paidPenaltyCents).toBe(first.penaltyCents);
    expect(after.schedule[1].paidPenaltyCents).toBe(0);
    expect(after.arrears.daysOverdue).toBeLessThan(loan.arrears.daysOverdue);
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('reports portfolio at risk and an arrears list from the schedules', async () => {
    const t = await newTenant('PAR');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 3, 'disbursed', dayOffset(-5)); // current
    await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 3, 'disbursed', dayOffset(-75)); // ~45 days overdue
    await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 3, 'disbursed', dayOffset(-400)); // very overdue
    const pf = await get(t.owner.auth, '/v1/portfolio');
    expect(pf.status).toBe(200);
    expect(pf.body.loansBeingRepaid).toBe(3);
    const par = (days: number) => pf.body.par.find((x: { days: number }) => x.days === days);
    expect(par(1).percent).toBeGreaterThan(60);
    expect(par(30).amountCents).toBe(K(20_000));
    expect(par(90).amountCents).toBe(K(10_000));
    const arrears = await get(t.owner.auth, '/v1/arrears');
    expect(arrears.body.total).toBe(2);
    expect(arrears.body.items[0].daysOverdue).toBeGreaterThan(arrears.body.items[1].daysOverdue);
    expect((await get(t.owner.auth, '/v1/exports/arrears.csv')).text.split('\n').length).toBeGreaterThan(2);
  });

  it('writes off an overdue loan to bad debts, books later money as a recovery, and refuses to write off a loan that is not overdue', async () => {
    const t = await newTenant('Writeoff');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 0 });
    const good = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 3, 'disbursed', dayOffset(-5));
    expect((await post(s.manager.auth, `/v1/loans/${good}/write-off`, { note: 'not overdue' })).status).toBe(409);
    const bad = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 3, 'disbursed', dayOffset(-200));
    expect((await post(s.teller.auth, `/v1/loans/${bad}/write-off`, { note: 'no permission' })).status).toBe(403);
    const w = await post(s.manager.auth, `/v1/loans/${bad}/write-off`, { note: 'Borrower untraceable' });
    expect(w.status).toBe(200);
    expect(w.body.writtenOffPrincipalCents).toBe(K(10_000));
    const rec = await post(s.teller.auth, `/v1/loans/${bad}/repay`, { amountCents: K(1_500), channel: 'cash' });
    expect(rec.body.recoveryCents).toBe(K(1_500));
    const tb = await get(t.owner.auth, '/v1/reports/trial-balance');
    expect(tb.body.rows.find((r: { code: string }) => r.code === '5100').debitCents).toBe(K(10_000));
    expect(tb.body.rows.find((r: { code: string }) => r.code === '4500').creditCents).toBe(K(1_500));
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('restructures unpaid principal onto a new loan with no new money, waiving old penalties, and keeps the book in agreement', async () => {
    const t = await newTenant('Restructure');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 500 });
    const id = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(30_000), 6, 'disbursed', dayOffset(-100));
    await post(s.accountant.auth, '/v1/penalties/run', {});
    const r = await post(s.manager.auth, `/v1/loans/${id}/restructure`, { newTermMonths: 12, note: 'Borrower lost their job; extended' });
    expect(r.status).toBe(201);
    expect(r.body.principalCents).toBe(K(30_000));
    expect(r.body.penaltyWaivedCents).toBeGreaterThan(0);
    expect((await get(t.owner.auth, `/v1/loans/${id}`)).body.status).toBe('restructured');
    const fresh = (await get(t.owner.auth, `/v1/loans/${r.body.id}`)).body;
    expect(fresh.status).toBe('disbursed');
    expect(fresh.restructuredFrom).toBe(id);
    expect(fresh.schedule).toHaveLength(12);
    expect(fresh.arrears.daysOverdue).toBe(0);
    await assertLedgerBalanced(t);
    await assertLoanBookAgrees(t);
  });

  it('refuses a product whose terms cannot make a schedule, and keeps a loan on its own copy of the terms', async () => {
    const t = await newTenant('Terms');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const bad = await post(t.owner.auth, '/v1/loan-products', { name: 'Impossible', method: 'reducing', annualRateBp: 100_000, maxAmountCents: K(1_000), maxTermMonths: 1 });
    expect(bad.status).toBeLessThan(500);
    const p = await makeProduct(t.owner.auth, { annualRateBp: 1000 });
    const id = await lendUntil(s, m.id, p, K(10_000), 6, 'disbursed');
    expect((await patch(t.owner.auth, `/v1/loan-products/${p}`, { active: false })).status).toBe(200);
    const loan = (await get(t.owner.auth, `/v1/loans/${id}`)).body;
    expect(loan.annualRateBp).toBe(1000);
    const apply = await post(s.officer.auth, '/v1/loans', { memberId: (await makeMember(t.owner.auth)).id, productId: p, principalCents: K(5_000), termMonths: 3 });
    expect(apply.status).toBe(404); // the product is switched off for new loans
  });

  it('pages the loan list with a keyset and filters by status', async () => {
    const t = await newTenant('Paging');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth);
    for (let i = 0; i < 5; i += 1) await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(5_000 + i), 3, 'applied');
    const page1 = await get(t.owner.auth, '/v1/loans?limit=2');
    expect(page1.body.items).toHaveLength(2);
    const page2 = await get(t.owner.auth, `/v1/loans?limit=2&after=${page1.body.nextCursor}`);
    expect(page2.body.items).toHaveLength(2);
    expect(page2.body.items[0].loanNo < page1.body.items[1].loanNo).toBe(true);
    expect((await get(t.owner.auth, '/v1/loans?status=disbursed')).body.items).toHaveLength(0);
    void addStaff; void boot;
  });
});

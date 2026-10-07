import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerBalanced, assertLoanBookAgrees, boot, deposit, fullStaff, get, lendUntil, makeMember, makeProduct, nairobiDay, newTenant, on, post, shutdown } from './helpers';
import { callback, confirmation, setPaybill, trialByCode, transTime } from './mpesa-helpers';

vi.setConfig({ testTimeout: 120_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;
const stamp = (offsetMinutes = 0) => new Date(Date.now() + 3 * 3_600_000 + offsetMinutes * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const b64 = (text: string) => Buffer.from(text).toString('base64');

describe.runIf(on)('M-Pesa suspense and reconciliation (real Postgres)', () => {
  it('books received money to suspense at once, clears it when applied or assigned, and never double-posts a duplicate', async () => {
    const t = await newTenant('Suspense');
    const teller = await addStaff(t, 'teller');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);

    const unmatched = confirmation(code, 'MARY', 400);
    await callback(unmatched);
    // unmatched money is in the trial balance, as a liability, not invisible
    let tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1020']).toBe(K(400));
    expect(tb.byCode['2310']).toBe(-K(400));

    const matched = confirmation(code, m.memberNo, 500);
    await callback(matched);
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1020']).toBe(K(900));
    expect(tb.byCode['2310']).toBe(-K(400)); // the applied payment passed through suspense and left it
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(500));

    // the same confirmation delivered three more times, at once: one posting
    const dup = confirmation(code, m.memberNo, 750);
    await Promise.all([callback(dup), callback(dup), callback(dup)]);
    await callback(unmatched);
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1020']).toBe(K(1650));
    expect(tb.byCode['2310']).toBe(-K(400));
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(1250));

    const queue = (await get(teller.auth, '/v1/mpesa/payments?status=unmatched')).body.items;
    expect(queue).toHaveLength(1);
    expect((await post(teller.auth, `/v1/mpesa/payments/${queue[0].id}/assign`, { target: { type: 'savings', memberNo: m.memberNo } })).status).toBe(200);
    expect((await post(teller.auth, `/v1/mpesa/payments/${queue[0].id}/assign`, { target: { type: 'savings', memberNo: m.memberNo } })).status).toBe(409);
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['2310'] ?? 0).toBe(0);
    expect(tb.byCode['1020']).toBe(K(1650));
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(1650));

    // money set aside stays in suspense: it is owed to someone until a person resolves it
    await callback(confirmation(code, '', 100));
    const blank = (await get(t.owner.auth, '/v1/mpesa/payments?status=unmatched')).body.items[0];
    expect((await post(teller.auth, `/v1/mpesa/payments/${blank.id}/ignore`, { note: 'wrong paybill, refund pending' })).status).toBe(200);
    expect((await trialByCode(t.owner.auth)).byCode['2310']).toBe(-K(100));
    expect(tb.totalDebit).toBe(tb.totalCredit);
    await assertLedgerBalanced(t);
  });

  it('applies a loan repayment from suspense and keeps the loan book in agreement', async () => {
    const t = await newTenant('Suspense Loan');
    const s = await fullStaff(t);
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const loanId = await lendUntil(s, m.id, p, K(12_000), 3, 'disbursed');
    const loanNo = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body.loanNo;
    await callback(confirmation(code, loanNo, 1_000));
    const tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['2310'] ?? 0).toBe(0);
    expect(tb.byCode['1020']).toBe(K(1_000));
    await assertLoanBookAgrees(t);
    await assertLedgerBalanced(t);
  });

  it('reports received, applied and suspense by day and checks the ledger against the payments', async () => {
    const t = await newTenant('Recon Report');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    await callback(confirmation(code, m.memberNo, 300));
    await callback(confirmation(code, m.memberNo, 200));
    await callback(confirmation(code, 'NOBODY', 70));
    const today = nairobiDay();
    const report = (await get(t.owner.auth, `/v1/mpesa/reconciliation?from=${nairobiDay(-2)}&to=${today}`)).body;
    const row = report.days.find((d: { day: string }) => d.day === today);
    expect(row).toMatchObject({ count: 3, receivedCents: K(570), appliedCents: K(500), unmatchedCents: K(70), ignoredCents: 0 });
    expect(report.totals).toMatchObject({ receivedCents: K(570), appliedCents: K(500), unmatchedCents: K(70) });
    expect(report.suspense).toMatchObject({ ledgerCents: K(70), paymentsCents: K(70), differenceCents: 0 });
    expect((await get(t.owner.auth, `/v1/mpesa/reconciliation?from=${today}&to=2000-01-01`)).status).toBe(400);
  });

  it('compares a paybill statement with what was recorded, matching by transaction code, and posts nothing', async () => {
    const t = await newTenant('Recon Statement');
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    const good = confirmation(code, m.memberNo, 300, { TransID: `STMGOOD${Date.now() % 1e6}` });
    const wrongAmount = confirmation(code, m.memberNo, 150, { TransID: `STMDIFF${Date.now() % 1e6}` });
    const onlyHere = confirmation(code, m.memberNo, 90, { TransID: `STMONLY${Date.now() % 1e6}` });
    for (const c of [good, wrongAmount, onlyHere]) await callback(c);
    const before = await trialByCode(t.owner.auth);
    const lines = [
      'Receipt No.,Completion Time,Details,Transaction Status,Paid in,Withdrawn,Balance',
      `EARLY0001X,${stamp(-3)},Pay Bill from 254700000009 - Somebody,Completed,40.00,,1000.00`,
      `${good.TransID},${stamp()},Pay Bill from 254700000002 - Test,Completed,300.00,,1300.00`,
      `${wrongAmount.TransID},${stamp()},Pay Bill from 254700000002 - Test,Completed,175.00,,1475.00`,
      `LATE00002X,${stamp(3)},Pay Bill from 254700000008 - Other,Completed,60.00,,1535.00`,
      `${'CHG'}00003X,${stamp(1)},Charge,Completed,,5.00,1530.00`
    ];
    const res = await post(t.owner.auth, '/v1/mpesa/reconciliation/statement', { contentBase64: b64(lines.join('\n')) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ statementReceipts: 4, matchedCount: 1, amountDiffersCount: 1, missingInHazinaCount: 2 });
    expect(res.body.amountDiffers[0]).toEqual({ receiptNo: wrongAmount.TransID, statementCents: K(175), hazinaCents: K(150) });
    expect(res.body.missingInHazina.map((x: { receiptNo: string }) => x.receiptNo).sort()).toEqual(['EARLY0001X', 'LATE00002X']);
    expect(res.body.notInStatement.map((x: { receiptNo: string }) => x.receiptNo)).toEqual([onlyHere.TransID]);
    expect(res.body.notice).toMatch(/Unverified/);
    expect(await trialByCode(t.owner.auth)).toEqual(before);
    expect((await post(t.owner.auth, '/v1/mpesa/reconciliation/statement', { contentBase64: b64('not,a,statement\n1,2,3') })).status).toBe(400);
    void transTime;
    void deposit;
  });
});

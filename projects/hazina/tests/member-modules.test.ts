import { afterAll, describe, expect, it, vi } from 'vitest';
import { assertLedgerBalanced, assertLoanBookAgrees, boot, deposit, fullStaff, get, lendUntil, makeMember, makeProduct, nairobiDay, newTenant, on, post, shutdown } from './helpers';
import { trialByCode } from './mpesa-helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;
type Detail = { outstandingTotalCents: number; schedule: Array<{ penaltyCents: number }> };

describe.runIf(on)('savings interest and share dividends (real Postgres)', () => {
  it('credits each member their share of the declared rate once per period, and the statement agrees with the ledger', async () => {
    const t = await newTenant('Dividends');
    const a = await makeMember(t.owner.auth, 'Alpha');
    const b = await makeMember(t.owner.auth, 'Beta');
    const c = await makeMember(t.owner.auth, 'Gamma');
    await deposit(t.owner.auth, a.id, K(10_000));
    await deposit(t.owner.auth, b.id, K(20_000));
    expect((await post(t.owner.auth, '/v1/savings/deposit', { memberId: a.id, product: 'shares', amountCents: K(4_000), channel: 'cash' })).status).toBe(201);
    const periodEnd = nairobiDay();

    const run = await post(t.owner.auth, '/v1/dividends/run', { kind: 'savings_interest', periodEnd, rateBp: 500 });
    expect(run.status).toBe(201);
    expect(run.body).toMatchObject({ duplicate: false, members: 2, totalCents: K(500) + K(1_000) });
    expect((await get(t.owner.auth, `/v1/members/${a.id}`)).body.balances.savingsCents).toBe(K(10_000) + K(500));
    expect((await get(t.owner.auth, `/v1/members/${b.id}`)).body.balances.savingsCents).toBe(K(20_000) + K(1_000));
    expect((await get(t.owner.auth, `/v1/members/${c.id}`)).body.balances.savingsCents).toBe(0);
    // the member's statement is built from savings transactions: it must show the credit and agree with the ledger
    const st = (await get(t.owner.auth, `/v1/members/${a.id}/savings-statement`)).body;
    expect(st.closingBalanceCents).toBe(K(10_500));
    expect(st.lines.some((l: { reference: string }) => l.reference === `INT-${periodEnd}`)).toBe(true);

    // a repeat for the same period posts nothing
    const again = await post(t.owner.auth, '/v1/dividends/run', { kind: 'savings_interest', periodEnd, rateBp: 500 });
    expect(again.body).toMatchObject({ duplicate: true, members: 2, totalCents: K(1_500) });
    expect((await get(t.owner.auth, `/v1/members/${a.id}`)).body.balances.savingsCents).toBe(K(10_500));

    const div = await post(t.owner.auth, '/v1/dividends/run', { kind: 'share_dividend', periodEnd, rateBp: 1000 });
    expect(div.body).toMatchObject({ members: 1, totalCents: K(400) });
    const tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['5500']).toBe(K(1_500));
    expect(tb.byCode['3300']).toBe(K(400));
    expect(tb.totalDebit).toBe(tb.totalCredit);
    expect((await post(t.owner.auth, '/v1/dividends/run', { kind: 'savings_interest', periodEnd: nairobiDay(5), rateBp: 500 })).status).toBe(400);
    expect((await get(t.owner.auth, '/v1/dividends')).body).toHaveLength(2);
    await assertLedgerBalanced(t);
  });

  it('is refused for a lender, which holds no member savings', async () => {
    const t = await newTenant('No Dividends', 'lender');
    expect((await post(t.owner.auth, '/v1/dividends/run', { kind: 'savings_interest', periodEnd: nairobiDay(), rateBp: 500 })).status).toBe(409);
  });
});

describe.runIf(on)('guarantors: call on default, release on repayment (real Postgres)', () => {
  it('applies a guarantor\'s savings to an overdue loan within what they guaranteed, and refuses the rest', async () => {
    const t = await newTenant('Guarantee Call');
    const s = await fullStaff(t);
    const borrower = await makeMember(t.owner.auth, 'Borrower');
    const g = await makeMember(t.owner.auth, 'Guarantor');
    const stranger = await makeMember(t.owner.auth, 'Stranger');
    await deposit(t.owner.auth, g.id, K(20_000));
    await deposit(t.owner.auth, stranger.id, K(20_000));
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, guarantorsRequired: 1, penaltyRateBp: 0 });
    const loanId = await lendUntil(s, borrower.id, p, K(9_000), 3, 'disbursed', nairobiDay(-70), { guarantors: [{ memberId: g.id, guaranteedCents: K(5_000) }] });
    const fresh = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(3_000), 3, 'disbursed', nairobiDay(), { guarantors: [{ memberId: g.id, guaranteedCents: K(1_000) }] });

    const call = (id: string, who: string, cents: number) => post(s.manager.auth, `/v1/loans/${id}/guarantee-calls`, { guarantorMemberId: who, amountCents: cents });
    expect((await call(fresh, g.id, K(100))).status).toBe(409); // not overdue
    expect((await call(loanId, stranger.id, K(100))).status).toBe(404); // not a guarantor of this loan
    expect((await call(loanId, g.id, K(5_001))).status).toBe(409); // more than guaranteed
    expect((await post(s.teller.auth, `/v1/loans/${loanId}/guarantee-calls`, { guarantorMemberId: g.id, amountCents: K(100) })).status).toBe(403);

    const before = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body as Detail;
    const ok = await call(loanId, g.id, K(3_000));
    expect(ok.status).toBe(201);
    expect(ok.body.remainingGuaranteeCents).toBe(K(2_000));
    const after = (await get(t.owner.auth, `/v1/loans/${loanId}`)).body as Detail;
    expect(before.outstandingTotalCents - after.outstandingTotalCents).toBe(K(3_000));
    expect((await get(t.owner.auth, `/v1/members/${g.id}`)).body.balances.savingsCents).toBe(K(17_000));
    const st = (await get(t.owner.auth, `/v1/members/${g.id}/savings-statement`)).body;
    expect(st.closingBalanceCents).toBe(K(17_000)); // the statement and the ledger agree
    expect((await call(loanId, g.id, K(2_001))).status).toBe(409); // only 2,000 of the guarantee is left
    await assertLoanBookAgrees(t);
    await assertLedgerBalanced(t);
  });

  it('releases the guarantee when the loan is repaid in full, freeing the guarantor\'s capacity, and carries it over a restructure', async () => {
    const t = await newTenant('Guarantee Release');
    const s = await fullStaff(t);
    const { pool } = await boot();
    const g = await makeMember(t.owner.auth, 'Guarantor');
    await deposit(t.owner.auth, g.id, K(10_000));
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, guarantorsRequired: 1, penaltyRateBp: 0 });
    const l1 = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(8_000), 3, 'disbursed', undefined, { guarantors: [{ memberId: g.id, guaranteedCents: K(10_000) }] });
    // all of g's capacity is committed to l1
    const another = await post(s.officer.auth, '/v1/loans', { memberId: (await makeMember(t.owner.auth)).id, productId: p, principalCents: K(1_000), termMonths: 3, guarantors: [{ memberId: g.id, guaranteedCents: K(500) }] });
    expect(another.status).toBe(409);

    const detail = (await get(t.owner.auth, `/v1/loans/${l1}`)).body as Detail;
    expect((await post(s.teller.auth, `/v1/loans/${l1}/repay`, { amountCents: detail.outstandingTotalCents, channel: 'cash' })).body.closed).toBe(true);
    const released = await pool.withOrg(t.orgId, async (c) => (await c.query('SELECT released_on FROM loan_guarantors WHERE loan_id = $1', [l1])).rows[0].released_on);
    expect(released).not.toBeNull();
    const second = await post(s.officer.auth, '/v1/loans', { memberId: (await makeMember(t.owner.auth)).id, productId: p, principalCents: K(1_000), termMonths: 3, guarantors: [{ memberId: g.id, guaranteedCents: K(10_000) }] });
    expect(second.status).toBe(201);
    await assertLedgerBalanced(t);
  });

  it('carries the guarantors of a restructured loan over to the new loan', async () => {
    const t = await newTenant('Guarantee Restructure');
    const s = await fullStaff(t);
    const { pool } = await boot();
    const g = await makeMember(t.owner.auth, 'Guarantor');
    await deposit(t.owner.auth, g.id, K(10_000));
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, guarantorsRequired: 1, penaltyRateBp: 0 });
    const old = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(6_000), 6, 'disbursed', nairobiDay(-75), { guarantors: [{ memberId: g.id, guaranteedCents: K(4_000) }] });
    const re = await post(s.manager.auth, `/v1/loans/${old}/restructure`, { newTermMonths: 12, note: 'hardship' });
    expect(re.status).toBe(201);
    const held = await pool.withOrg(t.orgId, async (c) => (await c.query('SELECT guaranteed_cents FROM loan_guarantors WHERE loan_id = $1 AND released_on IS NULL', [re.body.id])).rows);
    expect(held).toHaveLength(1);
    expect(Number(held[0].guaranteed_cents)).toBe(K(4_000));
  });
});

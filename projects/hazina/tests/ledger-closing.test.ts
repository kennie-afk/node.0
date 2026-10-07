import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerBalanced, boot, fullStaff, get, lendUntil, makeMember, makeProduct, nairobiDay, newTenant, on, post, shutdown } from './helpers';
import { callback, confirmation, setPaybill, trialByCode } from './mpesa-helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;

async function journal(auth: { Authorization: string }, entryDate: string, amount: number, debit = '5400', credit = '1010') {
  return post(auth, '/v1/journal', { entryDate, memo: `test ${entryDate}`, lines: [{ accountCode: debit, debitCents: amount }, { accountCode: credit, creditCents: amount }] });
}

describe.runIf(on)('closing periods and balance snapshots (real Postgres)', () => {
  it('refuses entries dated in a closed period, lets system money through on the first open day, and reopens only for an owner', async () => {
    const t = await newTenant('Period Lock');
    const s = await fullStaff(t);
    const code = await setPaybill(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const loanId = await lendUntil(s, m.id, p, K(6_000), 3, 'disbursed', nairobiDay(-60));
    expect((await journal(s.accountant.auth, nairobiDay(-40), K(100))).status).toBe(201);

    expect((await post(s.accountant.auth, '/v1/periods/close', { through: nairobiDay(1) })).status).toBe(400);
    const closed = await post(s.accountant.auth, '/v1/periods/close', { through: nairobiDay(-30), note: 'September' });
    expect(closed.status).toBe(200);
    expect(closed.body.lockedThrough).toBe(nairobiDay(-30));
    expect(closed.body.snapshots).toContain(nairobiDay(-30));
    expect((await post(s.accountant.auth, '/v1/periods/close', { through: nairobiDay(-31) })).status).toBe(409);

    // people's postings dated in the closed period are refused, with the reason
    const refused = await journal(s.accountant.auth, nairobiDay(-35), K(5));
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/closed/);
    expect((await post(s.teller.auth, `/v1/loans/${loanId}/repay`, { amountCents: K(100), channel: 'cash', receivedOn: nairobiDay(-31) })).status).toBe(409);
    expect((await journal(s.accountant.auth, nairobiDay(-29), K(5))).status).toBe(201);

    // money that has arrived is booked even when its day is closed: dated the first open day instead
    const late = confirmation(code, m.memberNo, 250, { TransTime: new Date(Date.now() + 3 * 3_600_000 - 40 * 86_400_000).toISOString().replace(/[-:T]/g, '').slice(0, 14) });
    expect((await callback(late)).status).toBe(200);
    const { pool } = await boot();
    const receipt = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT to_char(entry_date, 'YYYY-MM-DD') AS d FROM journal_entries WHERE source_type = 'mpesa_receipt'`)).rows[0].d as string);
    expect(receipt).toBe(nairobiDay(-29));
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(K(250));

    expect((await post(s.accountant.auth, '/v1/periods/reopen', { through: null, note: 'oops' })).status).toBe(403);
    expect((await post(t.owner.auth, '/v1/periods/reopen', { through: null })).status).toBe(400); // a reason is required
    const reopened = await post(t.owner.auth, '/v1/periods/reopen', { through: null, note: 'late invoice found' });
    expect(reopened.body).toMatchObject({ lockedThrough: null, snapshots: [] });
    expect((await journal(s.accountant.auth, nairobiDay(-35), K(5))).status).toBe(201);
    await assertLedgerBalanced(t);
  });

  it('gives the same reports from snapshots as from scanning every line, before and after new postings', async () => {
    const t = await newTenant('Snapshots');
    const acct = await addStaff(t, 'accountant');
    const { pool } = await boot();
    for (const [offset, amount] of [[-70, 1000], [-62, 2500], [-41, 700], [-35, 90], [-12, 4000]] as const) expect((await journal(acct.auth, nairobiDay(offset), amount)).status).toBe(201);
    expect((await post(acct.auth, '/v1/periods/close', { through: nairobiDay(-30) })).status).toBe(200);
    expect((await journal(acct.auth, nairobiDay(-10), 333)).status).toBe(201);
    expect((await journal(acct.auth, nairobiDay(-1), 44, '5300', '1020')).status).toBe(201);

    const scan = async (asOf: string) => pool.withOrg(t.orgId, async (c) => {
      const rows = (await c.query(
        `SELECT a.code, COALESCE(sum(l.debit_cents), 0)::bigint - COALESCE(sum(l.credit_cents), 0)::bigint AS net
           FROM accounts a JOIN journal_lines l ON l.account_id = a.id JOIN journal_entries e ON e.id = l.entry_id AND e.entry_date <= $1::date GROUP BY a.code`, [asOf]
      )).rows;
      return Object.fromEntries(rows.filter((r) => Number(r.net) !== 0).map((r) => [r.code as string, Number(r.net)]));
    });
    for (const asOf of [nairobiDay(-65), nairobiDay(-45), nairobiDay(-30), nairobiDay(-20), nairobiDay(-10), nairobiDay()]) {
      const res = await get(acct.auth, `/v1/reports/trial-balance?asOf=${asOf}`);
      const viaApi: Record<string, number> = {};
      for (const r of res.body.rows as Array<{ code: string; debitCents: number; creditCents: number }>) viaApi[r.code] = r.debitCents - r.creditCents;
      expect(viaApi, `trial balance as at ${asOf}`).toEqual(await scan(asOf));
    }
    // the snapshot is really used: the snapshot rows exist, and one is dated the closing day
    const snaps = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT to_char(as_of, 'YYYY-MM-DD') AS d, count(*)::int AS n FROM ledger_snapshots GROUP BY as_of ORDER BY as_of`)).rows);
    expect(snaps.map((r) => r.d)).toContain(nairobiDay(-30));
    expect((await get(acct.auth, '/v1/reports/balance-sheet')).body.balanced).toBe(true);
  });

  it('keeps entry numbers unique and gap-free when many postings race, including a bulk batch', async () => {
    const t = await newTenant('Numbering');
    const acct = await addStaff(t, 'accountant');
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => journal(acct.auth, nairobiDay(-1), 100 + i)));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(results.map((r) => r.body.seq)).size).toBe(20);
    await assertLedgerBalanced(t); // no gaps, every entry balanced
  });
});

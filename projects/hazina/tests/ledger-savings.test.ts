import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerBalanced, boot, dayOffset, deposit, get, makeMember, newTenant, on, patch, post, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });
afterAll(shutdown);

describe.runIf(on)('the ledger (real Postgres, restricted application role)', () => {
  it('refuses an unbalanced entry at commit even when the service is bypassed', async () => {
    const t = await newTenant('Ledger Guard');
    const { pool } = await boot();
    const accounts = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT id, code FROM accounts WHERE code IN ('1010', '2100')`)).rows);
    const cash = accounts.find((a) => a.code === '1010')!.id;
    const savings = accounts.find((a) => a.code === '2100')!.id;
    const attempt = pool.withOrg(t.orgId, async (c) => {
      const e = (await c.query(`INSERT INTO journal_entries (org_id, seq, entry_date, memo, source_type, line_count, total_cents) VALUES ($1, 1, current_date, 'raw', 'test', 2, 1000) RETURNING id`, [t.orgId])).rows[0];
      await c.query(`INSERT INTO journal_lines (org_id, entry_id, line_no, account_id, debit_cents) VALUES ($1, $2, 1, $3, 1000)`, [t.orgId, e.id, cash]);
      await c.query(`INSERT INTO journal_lines (org_id, entry_id, line_no, account_id, credit_cents) VALUES ($1, $2, 2, $3, 999)`, [t.orgId, e.id, savings]);
    });
    await expect(attempt).rejects.toThrow(/not balanced/);
  });

  it('refuses a line added to an entry after it was written, and refuses to edit or delete history', async () => {
    const t = await newTenant('Ledger History');
    const m = await makeMember(t.owner.auth);
    expect((await deposit(t.owner.auth, m.id, 5_000_00)).status).toBe(201);
    const { pool } = await boot();
    const entry = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT id FROM journal_entries ORDER BY seq DESC LIMIT 1`)).rows[0]);
    const acct = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT id FROM accounts WHERE code = '1010'`)).rows[0]);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`INSERT INTO journal_lines (org_id, entry_id, line_no, account_id, debit_cents) VALUES ($1, $2, 9, $3, 1)`, [t.orgId, entry.id, acct.id]))).rejects.toThrow(/history is not edited|declared/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE journal_lines SET debit_cents = debit_cents + 1`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM journal_entries`))).rejects.toThrow(/permission denied/);
    await assertLedgerBalanced(t);
  });

  it('numbers entries without gaps even when many are posted at the same moment', async () => {
    const t = await newTenant('Ledger Concurrency');
    const members = await Promise.all(Array.from({ length: 8 }, () => makeMember(t.owner.auth)));
    const results = await Promise.all(members.flatMap((m) => [1, 2, 3].map(() => deposit(t.owner.auth, m.id, 1_000_00))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    await assertLedgerBalanced(t); // balanced, and numbered 1..N with no gap
    const tb = await get(t.owner.auth, '/v1/reports/trial-balance');
    expect(tb.body.totalDebitCents).toBe(tb.body.totalCreditCents);
    expect(tb.body.totalDebitCents).toBe(24 * 1_000_00);
  });

  it('keeps the balance sheet balanced after a mix of postings, and the income statement honest', async () => {
    const t = await newTenant('Statements');
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 10_000_00);
    await deposit(t.owner.auth, m.id, 2_000_00, 'shares');
    const entry = await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'Office rent', lines: [{ accountCode: '5300', debitCents: 3_000_00 }, { accountCode: '1010', creditCents: 3_000_00 }] });
    expect(entry.status).toBe(201);
    const bs = await get(t.owner.auth, '/v1/reports/balance-sheet');
    expect(bs.body.balanced).toBe(true);
    expect(bs.body.totalAssetsCents).toBe(9_000_00);
    expect(bs.body.surplusToDateCents).toBe(-3_000_00);
    const is = await get(t.owner.auth, '/v1/reports/income-statement');
    expect(is.body.totalExpensesCents).toBe(3_000_00);
    expect(is.body.surplusCents).toBe(-3_000_00);
  });

  it('validates manual journals: balanced, dated, reversible once, and only manual ones', async () => {
    const t = await newTenant('Journals');
    const bad = await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'Unbalanced', lines: [{ accountCode: '5300', debitCents: 100 }, { accountCode: '1010', creditCents: 99 }] });
    expect(bad.status).toBe(400);
    expect((await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(3), memo: 'Future', lines: [{ accountCode: '5300', debitCents: 100 }, { accountCode: '1010', creditCents: 100 }] })).status).toBe(400);
    expect((await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'Both sides', lines: [{ accountCode: '5300', debitCents: 100, creditCents: 100 }, { accountCode: '1010', creditCents: 0, debitCents: 0 }] })).status).toBe(400);
    expect((await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'No such account', lines: [{ accountCode: '9999', debitCents: 100 }, { accountCode: '1010', creditCents: 100 }] })).status).toBe(404);
    const ok = await post(t.owner.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'Stationery', lines: [{ accountCode: '5400', debitCents: 500_00 }, { accountCode: '1010', creditCents: 500_00 }] });
    expect(ok.status).toBe(201);
    const list = await get(t.owner.auth, '/v1/journal');
    const entryId = list.body.items[0].id;
    expect((await post(t.owner.auth, `/v1/journal/${entryId}/reverse`, { memo: 'Posted by mistake' })).status).toBe(201);
    expect((await post(t.owner.auth, `/v1/journal/${entryId}/reverse`, { memo: 'Again' })).status).toBe(409); // once only (unique index)
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 100_00);
    const sys = (await get(t.owner.auth, '/v1/journal?source=savings')).body.items[0].id;
    expect((await post(t.owner.auth, `/v1/journal/${sys}/reverse`, { memo: 'Not allowed' })).status).toBe(409);
    await assertLedgerBalanced(t);
  });

  it('lets an auditor read the books and nothing else', async () => {
    const t = await newTenant('Audit Access');
    const auditor = await addStaff(t, 'auditor');
    expect((await get(auditor.auth, '/v1/reports/trial-balance')).status).toBe(200);
    expect((await get(auditor.auth, '/v1/journal')).status).toBe(200);
    expect((await post(auditor.auth, '/v1/members', { fullName: 'Nope Nope' })).status).toBe(403);
    expect((await post(auditor.auth, '/v1/journal', { entryDate: dayOffset(0), memo: 'No', lines: [] })).status).toBe(403);
  });
});

describe.runIf(on)('savings, shares and deposits', () => {
  it('posts deposits to the right accounts and keeps a running statement', async () => {
    const t = await newTenant('Savings Posts');
    const m = await makeMember(t.owner.auth);
    expect((await deposit(t.owner.auth, m.id, 1_000_00)).status).toBe(201);
    expect((await deposit(t.owner.auth, m.id, 500_00, 'shares')).status).toBe(201);
    expect((await deposit(t.owner.auth, m.id, 2_500_00, 'deposits')).status).toBe(201);
    const profile = await get(t.owner.auth, `/v1/members/${m.id}`);
    expect(profile.body.balances).toMatchObject({ savingsCents: 1_000_00, sharesCents: 500_00, depositsCents: 2_500_00 });
    const st = await get(t.owner.auth, `/v1/members/${m.id}/savings-statement?product=savings`);
    expect(st.body.closingBalanceCents).toBe(1_000_00);
    await assertLedgerBalanced(t);
  });

  it('refuses savings, shares and deposits for a lender: it is a non-deposit-taking credit provider', async () => {
    const t = await newTenant('Lender Ltd', 'lender');
    const m = await makeMember(t.owner.auth);
    const res = await deposit(t.owner.auth, m.id, 1_000_00);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/non-deposit-taking/);
    const chart = await get(t.owner.auth, '/v1/accounts');
    expect(chart.body.some((a: { code: string }) => a.code === '2100')).toBe(false);
  });

  it('requires the M-Pesa code, and refuses the same code twice', async () => {
    const t = await newTenant('Savings Mpesa');
    const m = await makeMember(t.owner.auth);
    expect((await post(t.owner.auth, '/v1/savings/deposit', { memberId: m.id, product: 'savings', amountCents: 500_00, channel: 'mpesa' })).status).toBe(400);
    const body = { memberId: m.id, product: 'savings', amountCents: 500_00, channel: 'mpesa', reference: 'QWE123RTY4' };
    expect((await post(t.owner.auth, '/v1/savings/deposit', body)).status).toBe(201);
    expect((await post(t.owner.auth, '/v1/savings/deposit', body)).status).toBe(409);
  });

  it('refuses to overdraw, and two withdrawals at the same moment cannot both pass the balance check', async () => {
    const t = await newTenant('Savings Race');
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 1_000_00);
    const one = { memberId: m.id, amountCents: 600_00, channel: 'cash' };
    expect((await post(t.owner.auth, '/v1/savings/withdraw', { ...one, amountCents: 2_000_00 })).status).toBe(409);
    const results = await Promise.all([post(t.owner.auth, '/v1/savings/withdraw', one), post(t.owner.auth, '/v1/savings/withdraw', one), post(t.owner.auth, '/v1/savings/withdraw', one)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const profile = await get(t.owner.auth, `/v1/members/${m.id}`);
    expect(profile.body.balances.savingsCents).toBe(400_00);
    await assertLedgerBalanced(t);
  });

  it('needs a second person to approve a large withdrawal, and only then does the ledger move', async () => {
    const t = await newTenant('Savings Approval');
    const teller = await addStaff(t, 'teller');
    const manager = await addStaff(t, 'manager');
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 200_000_00);
    const asked = await post(teller.auth, '/v1/savings/withdraw', { memberId: m.id, amountCents: 60_000_00, channel: 'bank' });
    expect(asked.status).toBe(201);
    expect(asked.body.status).toBe('pending_approval');
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(200_000_00);
    // the teller may not approve (no permission), and neither may the requester
    expect((await post(teller.auth, `/v1/savings/${asked.body.id}/decision`, { approve: true })).status).toBe(403);
    const approved = await post(manager.auth, `/v1/savings/${asked.body.id}/decision`, { approve: true });
    expect(approved.status).toBe(200);
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(140_000_00);
    expect((await post(manager.auth, `/v1/savings/${asked.body.id}/decision`, { approve: true })).status).toBe(409);
    await assertLedgerBalanced(t);
  });

  it('does not let the person who asked approve their own large withdrawal, unless an owner is allowed under relaxed rules', async () => {
    const t = await newTenant('Savings Self Approval');
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 300_000_00);
    const asked = await post(t.owner.auth, '/v1/savings/withdraw', { memberId: m.id, amountCents: 80_000_00, channel: 'bank' });
    expect(asked.body.status).toBe('pending_approval');
    expect((await post(t.owner.auth, `/v1/savings/${asked.body.id}/decision`, { approve: true })).status).toBe(403);
    expect((await patch(t.owner.auth, '/v1/settings', { makerChecker: 'relaxed' })).status).toBe(200);
    expect((await post(t.owner.auth, `/v1/savings/${asked.body.id}/decision`, { approve: true })).status).toBe(200);
  });

  it('can reject a pending withdrawal, which never touches the ledger', async () => {
    const t = await newTenant('Savings Reject');
    const manager = await addStaff(t, 'manager');
    const m = await makeMember(t.owner.auth);
    await deposit(t.owner.auth, m.id, 300_000_00);
    const asked = await post(t.owner.auth, '/v1/savings/withdraw', { memberId: m.id, amountCents: 90_000_00, channel: 'bank' });
    expect((await post(manager.auth, `/v1/savings/${asked.body.id}/decision`, { approve: false, note: 'Not now' })).body.status).toBe('rejected');
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).body.balances.savingsCents).toBe(300_000_00);
  });
});

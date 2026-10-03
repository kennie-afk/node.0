import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, assertLedgerBalanced, boot, deposit, fullStaff, get, lendUntil, makeMember, makeProduct, newTenant, nextPhone, on, patch, post, shutdown, signIn } from './helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;
const CSV = (rows: string[]) => Buffer.from(['name,id number,phone,savings,shares,deposits', ...rows].join('\n')).toString('base64');

describe.runIf(on)('tenant isolation (real Postgres, RLS on, restricted application role)', () => {
  it('keeps one organisation blind to another through the API', async () => {
    const a = await newTenant('Org A');
    const b = await newTenant('Org B');
    const sa = await fullStaff(a);
    const mA = await makeMember(a.owner.auth, 'Alpha');
    await deposit(a.owner.auth, mA.id, K(5_000));
    const pA = await makeProduct(a.owner.auth);
    const loanA = await lendUntil(sa, mA.id, pA, K(10_000), 3, 'disbursed');
    const mB = await makeMember(b.owner.auth, 'Beta');

    // reads: B cannot see A's rows by id, and A's rows do not appear in B's lists
    expect((await get(b.owner.auth, `/v1/members/${mA.id}`)).status).toBe(404);
    expect((await get(b.owner.auth, `/v1/loans/${loanA}`)).status).toBe(404);
    expect((await get(b.owner.auth, '/v1/members')).body.items.map((x: { id: string }) => x.id)).toEqual([mB.id]);
    expect((await get(b.owner.auth, '/v1/loans')).body.items).toHaveLength(0);
    expect((await get(b.owner.auth, '/v1/journal')).body.items).toHaveLength(0);
    expect((await get(b.owner.auth, '/v1/reports/trial-balance')).body.rows).toHaveLength(0);
    expect((await get(b.owner.auth, '/v1/loan-products')).body).toHaveLength(0);

    // writes and references: B cannot act on A's member, product or loan
    expect((await deposit(b.owner.auth, mA.id, K(100))).status).toBe(404);
    expect((await post(b.owner.auth, '/v1/loans', { memberId: mB.id, productId: pA, principalCents: K(1_000), termMonths: 3 })).status).toBe(404);
    expect((await post(b.owner.auth, `/v1/loans/${loanA}/repay`, { amountCents: 100, channel: 'cash' })).status).toBe(404);
    expect((await patch(b.owner.auth, `/v1/members/${mA.id}`, { fullName: 'Hijacked Name' })).status).toBe(404);
    const g = await post(b.owner.auth, '/v1/loans', { memberId: mB.id, productId: await makeProduct(b.owner.auth), principalCents: K(1_000), termMonths: 3, guarantors: [{ memberId: mA.id, guaranteedCents: K(500) }] });
    expect(g.status).toBe(404); // a guarantor from another organisation does not exist for B

    // and A still has everything
    expect((await get(a.owner.auth, `/v1/members/${mA.id}`)).body.balances.savingsCents).toBe(K(5_000));
    await assertLedgerBalanced(a);
  });

  it('shows the restricted role no rows at all without a tenant, and refuses to write another tenant\'s id', async () => {
    const a = await newTenant('Raw A');
    const b = await newTenant('Raw B');
    const m = await makeMember(a.owner.auth);
    await deposit(a.owner.auth, m.id, K(100));
    const { pool } = await boot();
    const tables = (await pool.pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
         JOIN pg_attribute x ON x.attrelid = c.oid AND x.attname = 'org_id' AND NOT x.attisdropped WHERE c.relkind = 'r' ORDER BY 1`
    )).rows.map((r) => r.relname as string);
    expect(tables.length).toBeGreaterThan(20);
    for (const table of tables) {
      const count = Number((await pool.pool.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n);
      expect(count, `${table} must be invisible with no tenant bound`).toBe(0);
    }
    // bound to B, A's member is invisible and a row claiming A's org is refused
    await expect(pool.withOrg(b.orgId, (c) => c.query(`INSERT INTO members (org_id, member_no, full_name) VALUES ($1, 'MX', 'Smuggled')`, [a.orgId]))).rejects.toThrow(/row-level security/);
    expect(await pool.withOrg(b.orgId, async (c) => Number((await c.query(`SELECT count(*)::int AS n FROM members WHERE id = $1`, [m.id])).rows[0].n))).toBe(0);
    // the startup guard accepts this connection (non-superuser, no BYPASSRLS, every org_id table protected)
    await expect(pool.assertRlsIsEffective()).resolves.toBeUndefined();
  });

  it('keeps a person from one organisation out of another with a valid token for the wrong place', async () => {
    const a = await newTenant('Token A');
    const b = await newTenant('Token B');
    const m = await makeMember(a.owner.auth);
    // A's token only ever carries A's org id; there is no header or body field that can name another
    const res = await request((await boot()).app).get(`/v1/members/${m.id}`).set(b.owner.auth).set('x-org-id', a.orgId);
    expect(res.status).toBe(404);
    const body = await post(b.owner.auth, '/v1/members', { fullName: 'Spoof Spoof', orgId: a.orgId, org_id: a.orgId });
    expect(body.status).toBe(201);
    expect((await get(a.owner.auth, '/v1/members')).body.items.map((x: { fullName: string }) => x.fullName)).not.toContain('Spoof Spoof');
  });
});

describe.runIf(on)('billing (provisional prices) and sample organisations', () => {
  it('goes trial, invoice, mock payment, active; and suspends read-only without losing anything or refusing M-Pesa money', async () => {
    const t = await newTenant('Billing Flow');
    const m = await makeMember(t.owner.auth);
    const view = await get(t.owner.auth, '/v1/billing');
    expect(view.body).toMatchObject({ status: 'trial', kind: 'sacco', writesAllowed: true });
    expect(view.body.quote.amountCents).toBe(K(3_500));

    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    // 3 days before the trial ends an invoice is issued
    await pool.withMigrator((c) => c.query(`UPDATE subscriptions SET trial_ends_at = now() + interval '2 days' WHERE org_id = $1`, [t.orgId]));
    await billing.runBillingCycle();
    await billing.runBillingCycle(); // idempotent: one invoice per period
    const invoiced = await get(t.owner.auth, '/v1/billing');
    expect(invoiced.body.invoices).toHaveLength(1);
    expect(invoiced.body.invoices[0].number).toMatch(/^HZ-\d{4}-\d{6}$/);
    expect(invoiced.body.outstandingCents).toBe(K(3_500));

    const paid = await post(t.owner.auth, '/v1/billing/mock-payment', {});
    expect(paid.status).toBe(201);
    expect(paid.body.billing.invoices[0].status).toBe('paid');
    expect(paid.body.billing.outstandingCents).toBe(0);

    // a long time later with nothing paid: read-only
    await pool.withMigrator((c) => c.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '60 days', current_period_end = now() - interval '45 days' WHERE org_id = $1`, [t.orgId]));
    expect((await get(t.owner.auth, '/v1/billing')).body.status).toBe('suspended');
    const blocked = await post(t.owner.auth, '/v1/members', { fullName: 'Late Joiner' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('subscription-suspended');
    expect((await get(t.owner.auth, `/v1/members/${m.id}`)).status).toBe(200); // reads still work, nothing deleted

    // money that arrives by M-Pesa while suspended is still recorded
    const code = String(700_000 + Math.floor(Math.random() * 200_000));
    await pool.withMigrator((c) => c.query(`UPDATE branches SET paybill_number = $2 WHERE id = $1`, [t.branchId, code]));
    const { ingestConfirmation } = await import('../src/mpesa/service');
    await ingestConfirmation({ TransID: `SUSP${Date.now()}`, TransTime: new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14), TransAmount: 100, BusinessShortCode: code, BillRefNumber: 'M99999', MSISDN: '254700000002' });
    expect((await get(t.owner.auth, '/v1/mpesa/payments')).body).toHaveLength(1);

    // the periodic job has issued the next invoice by now; paying it reopens the account at once
    await billing.runBillingCycle();
    expect((await post(t.owner.auth, '/v1/billing/mock-payment', {})).status).toBe(201);
    expect((await post(t.owner.auth, '/v1/members', { fullName: 'Back Again' })).status).toBe(201);
  });

  it('bills a lender on its own tier', async () => {
    const t = await newTenant('Lender Billing', 'lender');
    await makeMember(t.owner.auth);
    expect((await get(t.owner.auth, '/v1/billing')).body.quote).toMatchObject({ planCode: 'lender', amountCents: K(10_000) });
  });

  it('builds a sample organisation through the real services: balanced, never billed, with work waiting', async () => {
    const { provisioning } = await boot();
    const phone = nextPhone();
    const made = await provisioning.provisionOrganisation({ businessName: 'Sample SACCO', ownerName: 'Visitor', ownerPhone: phone, kind: 'sacco', sample: true });
    const login = await signIn(phone, made.pin);
    const auth = login.person!.auth;
    const t = { orgId: made.orgId, branchId: made.branchId, kind: 'sacco' as const, owner: { ...login.person!, id: made.ownerId } };
    expect((await get(auth, '/v1/members?limit=100')).body.items.length).toBe(24);
    await assertLedgerBalanced(t);
    const pf = (await get(auth, '/v1/portfolio')).body;
    expect(pf.loansBeingRepaid).toBe(5);
    expect(pf.par.find((x: { days: number }) => x.days === 1).percent).toBeGreaterThan(30);
    expect(pf.buckets.find((b: { bucket: string }) => b.bucket === '180+').loans).toBe(1);
    expect((await get(auth, '/v1/loans?status=applied')).body.items).toHaveLength(1);
    expect((await get(auth, '/v1/loans?status=appraised')).body.items).toHaveLength(1);
    expect((await get(auth, '/v1/loans?status=approved')).body.items).toHaveLength(1);
    expect((await get(auth, '/v1/savings?status=pending_approval')).body).toHaveLength(1);
    expect((await get(auth, '/v1/mpesa/payments?status=unmatched')).body).toHaveLength(3);
    const bs = (await get(auth, '/v1/reports/balance-sheet')).body;
    expect(bs.balanced).toBe(true);
    const billing = await import('../src/billing/service');
    const cycle = await billing.runBillingCycle();
    void cycle;
    expect((await get(auth, '/v1/billing')).body.invoices).toHaveLength(0); // a sample is never invoiced
    const checklist = (await get(auth, '/v1/onboarding')).body;
    expect(checklist.isSample).toBe(true);

    const lender = await provisioning.provisionOrganisation({ businessName: 'Sample Lender', ownerName: 'Visitor', ownerPhone: nextPhone(), kind: 'lender', sample: true });
    const lp = await signIn(lender.phone, lender.pin);
    const members = (await get(lp.person!.auth, '/v1/members?limit=100')).body.items;
    expect(members).toHaveLength(16);
    const intake = await get(lp.person!.auth, `/v1/members/${members[6].id}/intake`);
    expect(intake.body.statements[0].status).toBe('parsed');
    expect(intake.body.checks.map((c: { kind: string }) => c.kind).sort()).toEqual(["national_id", "payslip"]);
    expect((await get(lp.person!.auth, '/v1/accounts')).body.some((a: { code: string }) => a.code === '2100')).toBe(false);
  });
});

describe.runIf(on)('signup (self-serve)', () => {
  it('verifies a phone, lets the owner choose a PIN, and opens a working organisation of the chosen kind', async () => {
    const { app } = await boot();
    const phone = nextPhone();
    const start = await request(app).post('/v1/signup').send({ businessName: 'Umoja SACCO', contactName: 'Mama Umoja', phone, kind: 'sacco', expectedMembers: 300 });
    expect(start.status).toBe(201);
    const { recentMessages } = await import('../src/notify/provider');
    const code = (await recentMessages(10)).find((m) => m.purpose === 'signup-code' && m.body.length > 0)!.body.match(/\b(\d{6})\b/)![1];
    expect((await request(app).post('/v1/signup/verify').send({ id: start.body.id, code: '000000', pin: '123456' })).status).toBe(401);
    const verify = await request(app).post('/v1/signup/verify').send({ id: start.body.id, code, pin: '482913' });
    expect(verify.status).toBe(201);
    const auth = { Authorization: `Bearer ${verify.body.token}` };
    expect((await get(auth, '/v1/settings')).body.organisation).toMatchObject({ kind: 'sacco', name: 'Umoja SACCO' });
    expect((await get(auth, '/v1/billing')).body.status).toBe('trial');
    expect((await signIn(phone, '482913')).status).toBe(200);
    expect((await request(app).post('/v1/signup/verify').send({ id: start.body.id, code, pin: '482913' })).status).toBe(409); // used once
  });

  it('opens a lender when asked, and a sample organisation when asked to try first', async () => {
    const { app } = await boot();
    const { recentMessages } = await import('../src/notify/provider');
    const open = async (body: object) => {
      const phone = nextPhone();
      const start = await request(app).post('/v1/signup').send({ businessName: 'Pesa Fasta Ltd', contactName: 'Owner Person', phone, ...body });
      const code = (await recentMessages(10)).find((m) => m.to === phone)!.body.match(/\b(\d{6})\b/)![1];
      return request(app).post('/v1/signup/verify').send({ id: start.body.id, code, pin: '135790' });
    };
    const lender = await open({ kind: 'lender' });
    expect((await get({ Authorization: `Bearer ${lender.body.token}` }, '/v1/settings')).body.organisation.kind).toBe('lender');
    const sample = await open({ kind: 'sacco', sample: true });
    const auth = { Authorization: `Bearer ${sample.body.token}` };
    expect((await get(auth, '/v1/settings')).body.organisation.isDemo).toBe(true);
    expect((await get(auth, '/v1/members?limit=5')).body.items).toHaveLength(5);
  });

  it('limits signup per phone number, not per address: two different phones from the same address each get their allowance', async () => {
    const { app } = await boot();
    const phoneA = nextPhone();
    const phoneB = nextPhone();
    const send = (phone: string) => request(app).post('/v1/signup').send({ businessName: 'Rate Test', contactName: 'Rate Tester', phone, kind: 'sacco' });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await send(phoneA)).status);
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses[5]).toBe(429);
    expect((await send(phoneB)).status).toBe(201); // the same address, a different person
  });
});

describe.runIf(on)('team, settings and imports', () => {
  it('lets a manager add staff below them, never another manager; and a disabled person is locked out within seconds', async () => {
    const t = await newTenant('Team Rules');
    const manager = await addStaff(t, 'manager');
    const res = await post(manager.auth, '/v1/team', { displayName: 'Another Manager', phone: nextPhone(), role: 'manager', branchId: t.branchId });
    expect([401, 403]).toContain(res.status);
    const ok = await post(manager.auth, '/v1/team', { displayName: 'New Teller', phone: nextPhone(), role: 'teller', branchId: t.branchId });
    expect(ok.status).toBe(201);
    const teller = (await signIn(ok.body.phone, ok.body.pin)).person!;
    expect((await get(teller.auth, '/v1/members')).status).toBe(200);
    expect((await patch(manager.auth, `/v1/team/${ok.body.id}`, { status: 'disabled' })).status).toBe(200);
    expect((await get(teller.auth, '/v1/members')).status).toBe(401);
    expect((await signIn(ok.body.phone, ok.body.pin)).status).toBe(401);
  });

  it('lets only the owner change settings, and validates them', async () => {
    const t = await newTenant('Settings Rules');
    const manager = await addStaff(t, 'manager');
    expect((await patch(manager.auth, '/v1/settings', { makerChecker: 'relaxed' })).status).toBe(403);
    expect((await patch(t.owner.auth, '/v1/settings', { capacityShareBp: 5 })).status).toBe(400);
    expect((await patch(t.owner.auth, '/v1/settings', { withdrawalApprovalCents: 0 })).body.withdrawalApprovalCents).toBe(0);
  });

  it('imports a member book with opening balances all-or-nothing, and posts them against opening balance equity', async () => {
    const t = await newTenant('Import');
    const res = await post(t.owner.auth, '/v1/members/import', { contentBase64: CSV(['Wanjiku Mwangi,31000001,0712000001,5000,1000,2000', 'Otieno Juma,31000002,0712000002,3000.50,500,0', 'Achieng Awino,31000003,0712000003,,,']) });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(3);
    expect(res.body.openingBalanceCents).toBe(K(5_000) + K(1_000) + K(2_000) + 300_050 + K(500));
    const tb = (await get(t.owner.auth, '/v1/reports/trial-balance')).body;
    expect(tb.rows.find((r: { code: string }) => r.code === '3400').debitCents).toBe(res.body.openingBalanceCents);
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    await assertLedgerBalanced(t);
    // one bad row (a repeated ID number) stops everything, and nothing at all is imported
    const before = (await get(t.owner.auth, '/v1/members?limit=100')).body.items.length;
    const bad = await post(t.owner.auth, '/v1/members/import', { contentBase64: CSV(['New Person,31000009,0712000009,100,0,0', 'Clash Person,31000001,0712000010,100,0,0']) });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/Row 3.*Nothing was imported/);
    expect((await get(t.owner.auth, '/v1/members?limit=100')).body.items.length).toBe(before);
    const lender = await newTenant('Import Lender', 'lender');
    expect((await post(lender.owner.auth, '/v1/members/import', { contentBase64: CSV(['A Person,31000050,0712000050,100,0,0']) })).status).toBe(400);
  });

  it('refuses a duplicate ID number and exports the member and loan books as CSV', async () => {
    const t = await newTenant('Members');
    const body = { fullName: 'Same Person', idNumber: '40000001' };
    expect((await post(t.owner.auth, '/v1/members', body)).status).toBe(201);
    expect((await post(t.owner.auth, '/v1/members', body)).status).toBe(409);
    const csv = await get(t.owner.auth, '/v1/exports/members.csv');
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\n')[0]).toBe('member_no,name,id_number,phone,status,joined_on');
    const evil = await post(t.owner.auth, '/v1/members', { fullName: '=HYPERLINK("http://x")' });
    expect(evil.status).toBe(201);
    expect((await get(t.owner.auth, '/v1/exports/members.csv')).text).toContain("'=HYPERLINK");
  });
});

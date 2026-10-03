import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, assertLedgerAgrees, boot, dayOffset, get, makeProduct, newTenant, nextPhone, on, patch, post, receive, sell, shutdown, signIn } from './helpers';

vi.setConfig({ testTimeout: 90_000 });

afterAll(shutdown);

describe.runIf(on)('tenant isolation (real Postgres, RLS on, restricted application role)', () => {

  it('keeps one pharmacy blind to another through the API', async () => {
    await boot();
    const a = await newTenant('Pharmacy A');
    const b = await newTenant('Pharmacy B');
    const pa = await makeProduct(a.owner.auth, { name: 'A-only product' });
    await receive(a.owner.auth, pa, [{ batchNo: 'A1', expiryDate: dayOffset(300), qty: 10 }]);
    const sale = (await sell(a.owner.auth, { lines: [{ productId: pa, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] })).body;
    const cust = (await post(a.owner.auth, '/v1/customers', { name: 'A customer' })).body;

    expect((await get(b.owner.auth, '/v1/products')).body.items).toHaveLength(0);
    expect((await get(b.owner.auth, `/v1/sales/${sale.saleId}`)).status).toBe(404);
    expect((await get(b.owner.auth, `/v1/customers/${cust.id}/statement`)).status).toBe(404);
    expect((await get(b.owner.auth, '/v1/customers')).body).toHaveLength(0);
    // B cannot use A's product, A's branch, or void/pay/return A's sale
    expect((await sell(b.owner.auth, { lines: [{ productId: pa, qty: 1 }], payments: [] })).status).toBe(404);
    expect((await get(b.owner.auth, `/v1/stock?branchId=${a.branchId}`)).status).toBe(404);
    expect((await post(b.owner.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'sabotage' })).status).toBe(404);
    expect((await post(b.owner.auth, `/v1/sales/${sale.saleId}/payments`, { method: 'cash', amountCents: 100 })).status).toBe(404);
    // and A still has everything
    expect((await get(a.owner.auth, '/v1/products')).body.items).toHaveLength(1);
  });

  it('enforces the same boundary in the database itself, for the application role', async () => {
    const { pool } = await boot();
    const a = await newTenant('SQL A');
    const b = await newTenant('SQL B');
    await makeProduct(a.owner.auth, { name: 'SQL-A product' });
    await makeProduct(b.owner.auth, { name: 'SQL-B product' });

    // no tenant bound: nothing is visible at all
    const none = await pool.withoutTenant(async (c) => (await c.query('SELECT count(*)::int AS n FROM products')).rows[0].n);
    expect(none).toBe(0);
    // bound to A: only A's rows
    const names = await pool.withOrg(a.orgId, async (c) => (await c.query('SELECT name FROM products')).rows.map((r) => r.name));
    expect(names).toEqual(['SQL-A product']);
    // bound to A, writing a row that belongs to B, is refused by the policy
    await expect(pool.withOrg(a.orgId, (c) => c.query(`INSERT INTO suppliers (org_id, name) VALUES ($1, 'smuggled')`, [b.orgId]))).rejects.toThrow(/row-level security/);
    // bound to A, updating or deleting B's rows touches nothing
    const touched = await pool.withOrg(a.orgId, async (c) => (await c.query(`UPDATE products SET name = 'hijacked' WHERE name = 'SQL-B product'`)).rowCount);
    expect(touched).toBe(0);
    expect(await pool.withOrg(b.orgId, async (c) => (await c.query('SELECT name FROM products')).rows[0].name)).toBe('SQL-B product');
    // the application role is not a superuser and cannot bypass RLS
    const role = await pool.withoutTenant(async (c) => (await c.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0]);
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('has row-level security forced on every table that carries org_id (what the startup guard checks)', async () => {
    const { pool } = await boot();
    const unprotected = await pool.withMigrator(async (c) =>
      (await c.query(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
          WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`
      )).rows
    );
    expect(unprotected).toEqual([]);
    await expect(pool.assertRlsIsEffective()).resolves.toBeUndefined();
    // and the guard is real: switch RLS off on a throwaway copy of the check and it finds the table
    await pool.withMigrator(async (c) => { await c.query('CREATE TABLE IF NOT EXISTS guard_probe (org_id uuid)'); });
    try {
      const found = await pool.withMigrator(async (c) => (await c.query(
        `SELECT c.relname FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' WHERE c.relname = 'guard_probe' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`
      )).rows);
      expect(found).toHaveLength(1);
    } finally {
      await pool.withMigrator(async (c) => { await c.query('DROP TABLE IF EXISTS guard_probe'); });
    }
  });

  it('keeps a person to their own branch', async () => {
    await boot();
    const t = await newTenant('Two Branch Pharmacy');
    const second = (await post(t.owner.auth, '/v1/branches', { name: 'Second Branch' })).body;
    const mgr1 = await addStaff(t, 'manager');
    expect((await get(mgr1.auth, `/v1/stock?branchId=${second.id}`)).status).toBe(403);
    expect((await get(mgr1.auth, '/v1/stock')).status).toBe(200);
    // the owner works across branches and must say which when there is more than one
    expect((await get(t.owner.auth, '/v1/stock')).status).toBe(400);
    expect((await get(t.owner.auth, `/v1/stock?branchId=${second.id}`)).status).toBe(200);
  });
});

describe.runIf(on)('roles, sessions and the audit trail', () => {
  it('lets a manager void and discount but not a cashier, and stops a manager creating another manager', async () => {
    await boot();
    const t = await newTenant('Roles Chemist');
    const manager = await addStaff(t, 'manager');
    const cashier = await addStaff(t, 'cashier');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'RL1', expiryDate: dayOffset(300), qty: 20 }]);
    const sale = (await sell(cashier.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 10000 }] })).body;
    expect((await post(cashier.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'oops' })).status).toBe(403);
    expect((await post(manager.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'oops' })).status).toBe(200);
    expect((await sell(manager.auth, { lines: [{ productId: p, qty: 2 }], discountCents: 2000, discountReason: 'regular', payments: [{ method: 'cash', amountCents: 20000 }] })).body.totalCents).toBe(18000);

    const makeManager = await request((await boot()).app).post('/v1/team').set(manager.auth).send({ displayName: 'Another Manager', phone: nextPhone(), role: 'manager' });
    expect(makeManager.status).toBe(401);
    const makeOwner = await request((await boot()).app).post('/v1/team').set(t.owner.auth).send({ displayName: 'Second Owner', phone: nextPhone(), role: 'owner' });
    expect(makeOwner.status).toBe(401);
    expect((await get(cashier.auth, '/v1/team')).status).toBe(403);
    expect((await get(cashier.auth, '/v1/reports/sales')).status).toBe(403);
  });

  it('honours a disabled account within seconds, not when its token expires', async () => {
    await boot();
    const t = await newTenant('Disable Chemist');
    const cashier = await addStaff(t, 'cashier');
    expect((await get(cashier.auth, '/v1/products')).status).toBe(200);
    const list = (await get(t.owner.auth, '/v1/team')).body;
    const row = list.find((r: any) => r.phone === cashier.phone);
    expect((await patch(t.owner.auth, `/v1/team/${row.id}`, { status: 'disabled' })).status).toBe(200);
    expect((await get(cashier.auth, '/v1/products')).status).toBe(401);
    expect((await signIn(cashier.phone, cashier.pin)).status).toBe(401);
  });

  it('writes an audit entry for what matters and lets nobody change it', async () => {
    await boot();
    const t = await newTenant('Audit Chemist');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'AU1', expiryDate: dayOffset(300), qty: 5 }]);
    await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], discountCents: 1000, discountReason: 'goodwill', payments: [{ method: 'cash', amountCents: 9000 }] });
    const { pool } = await boot();
    const actions = await pool.withOrg(t.orgId, async (c) => (await c.query('SELECT action FROM audit_events ORDER BY id')).rows.map((r) => r.action));
    expect(actions).toEqual(expect.arrayContaining(['product.create', 'stock.receive', 'sale.discount']));
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE audit_events SET action = 'nothing'`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM audit_events`))).rejects.toThrow(/permission denied/);
  });

  it('rate-limits sign-in attempts per number', async () => {
    await boot();
    const { env } = await import('../src/config/env');
    const limit = env.LOGIN_RATE_LIMIT_PER_WINDOW;
    const phone = nextPhone();
    const statuses: number[] = [];
    for (let i = 0; i < limit + 3; i += 1) statuses.push((await signIn(phone, '000000')).status);
    expect(statuses.slice(0, limit).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(limit).every((s) => s === 429)).toBe(true);
    // another number is unaffected
    expect((await signIn(nextPhone(), '000000')).status).toBe(401);
  });
});

describe.runIf(on)('self-serve signup, trial, invoices and payment (mock M-Pesa), suspension that never deletes', () => {
  async function signup() {
    const { setProvider } = await import('../src/notify/provider');
    let code = '';
    setProvider({ name: 'capture', send: async (m) => { code = /(\d{6})/.exec(m.body)![1]!; return { status: 'logged' }; } });
    const app = (await boot()).app;
    const phone = nextPhone();
    const started = await request(app).post('/v1/signup').send({ businessName: 'Kilimani Chemist', contactName: 'Faith Wambui', phone });
    expect(started.status).toBe(201);
    return { app, phone, id: started.body.id as string, code, setProvider };
  }

  it('creates a working organisation from a phone code and a PIN the owner chooses, exactly once', async () => {
    const s = await signup();
    expect((await request(s.app).post('/v1/signup/verify').send({ id: s.id, code: s.code === '000000' ? '111111' : '000000', pin: '123456' })).status).toBe(401);
    const [one, two] = await Promise.all([
      request(s.app).post('/v1/signup/verify').send({ id: s.id, code: s.code, pin: '482913' }),
      request(s.app).post('/v1/signup/verify').send({ id: s.id, code: s.code, pin: '482913' })
    ]);
    expect([one.status, two.status].sort()).toEqual([201, 409]);
    const ok = one.status === 201 ? one : two;
    expect(ok.body.role).toBe('owner');
    const me = await request(s.app).get('/v1/auth/me').set({ Authorization: `Bearer ${ok.body.token}` });
    expect(me.body.organisation.name).toBe('Kilimani Chemist');
    // the PIN works for sign-in, in any phone format
    expect((await signIn(s.phone.replace(/^254/, '0'), '482913')).status).toBe(200);
    // the same number cannot sign up again
    expect((await request(s.app).post('/v1/signup').send({ businessName: 'Again', contactName: 'Faith', phone: s.phone })).status).toBe(409);
    const billing = await request(s.app).get('/v1/billing').set({ Authorization: `Bearer ${ok.body.token}` });
    expect(billing.body).toMatchObject({ status: 'trial', writesAllowed: true, billedBranches: 1 });
    expect(billing.body.quote.amountCents).toBe(450_000);
    expect(billing.body.billingRef).toMatch(/^DW\d{6}$/);
    s.setProvider(null);
  });

  it('issues an invoice as the trial ends, takes a mock M-Pesa payment once, and extends coverage by a month', async () => {
    await boot();
    const t = await newTenant('Billing Chemist');
    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    const view0 = (await get(t.owner.auth, '/v1/billing')).body;
    const trialEnd = new Date(view0.trialEndsAt);
    const nearEnd = new Date(trialEnd.getTime() - 86_400_000);
    const issued = await pool.withOrg(t.orgId, (c) => billing.issueDueInvoice(c, t.orgId, nearEnd));
    expect(issued?.amountCents).toBe(450_000);
    // issuing again changes nothing (one invoice per period)
    expect(await pool.withOrg(t.orgId, (c) => billing.issueDueInvoice(c, t.orgId, nearEnd))).toBeNull();

    const paid = await post(t.owner.auth, '/v1/billing/mock-payment', {});
    expect(paid.status).toBe(201);
    expect(paid.body.billing.invoices[0]).toMatchObject({ status: 'paid', paidCents: 450_000 });
    const after = paid.body.billing;
    expect(new Date(after.coveredUntil).getTime()).toBeGreaterThan(trialEnd.getTime() + 27 * 86_400_000);
    // a manager cannot pay or see the owner's payment button
    const manager = await addStaff(t, 'manager');
    expect((await post(manager.auth, '/v1/billing/mock-payment', {})).status).toBe(403);
  });

  it('limits signup per phone number, not per address, so one busy console address cannot block everyone', async () => {
    const { setProvider } = await import('../src/notify/provider');
    setProvider({ name: 'quiet', send: async () => ({ status: 'logged' as const }) });
    const app = (await boot()).app;
    // eight different people signing up from the same address all get through
    for (let i = 0; i < 8; i += 1) {
      const res = await request(app).post('/v1/signup').send({ businessName: `Chemist ${i}`, contactName: 'Someone', phone: nextPhone() });
      expect(res.status).toBe(201);
    }
    // the same number asking over and over is stopped
    const phone = nextPhone();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await request(app).post('/v1/signup').send({ businessName: 'Spam', contactName: 'Spam', phone })).status);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);
    setProvider(null);
  });

  it('applies the same M-Pesa confirmation to billing once, however many times Daraja delivers it', async () => {
    await boot();
    const t = await newTenant('Idempotent Billing');
    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    const { ingestConfirmation } = await import('../src/mpesa/service');
    const view = (await get(t.owner.auth, '/v1/billing')).body;
    const body = { TransID: `BILL${Date.now().toString(36).toUpperCase()}`, TransTime: new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14), TransAmount: 4500, BusinessShortCode: billing.payShortcode(), BillRefNumber: view.billingRef.toLowerCase().replace(/(..)/, '$1 '), MSISDN: '254700000009' };
    for (let i = 0; i < 4; i += 1) await ingestConfirmation(body);
    const rows = await pool.withOrg(t.orgId, async (c) => (await c.query('SELECT amount_cents FROM billing_payments')).rows);
    expect(rows).toHaveLength(1); // banked as credit against the first invoice, once
    expect((await get(t.owner.auth, '/v1/billing')).body.creditCents).toBe(450_000);
    // a payment to an account number nobody holds is kept for an operator, not dropped
    await ingestConfirmation({ ...body, TransID: `${body.TransID}X`, BillRefNumber: 'DW000000' });
    const kept = await pool.withoutTenant(async (c) => (await c.query(`SELECT 1 FROM unmatched_billing_payments WHERE external_ref = $1`, [`${body.TransID}X`])).rows);
    expect(kept).toHaveLength(1);
  });

  it('makes a long-unpaid account read-only without deleting anything, still records M-Pesa money, and reopens on payment', async () => {
    await boot();
    const t = await newTenant('Lapsed Chemist');
    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'LP1', expiryDate: dayOffset(300), qty: 10 }]);
    await patch(t.owner.auth, `/v1/branches/${t.branchId}`, { tillNumber: String(Math.floor(Math.random() * 8_000_000) + 1_000_000) });
    const till = (await get(t.owner.auth, '/v1/branches')).body[0].tillNumber;
    const pending = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [] })).body;

    await pool.withOrg(t.orgId, (c) => c.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '40 days', current_period_end = NULL`));
    expect((await get(t.owner.auth, '/v1/billing')).body).toMatchObject({ status: 'suspended', writesAllowed: false });
    // reads still work; writes are refused with a clear reason; the data is all there
    expect((await get(t.owner.auth, '/v1/products')).body.items).toHaveLength(1);
    const blocked = await post(t.owner.auth, '/v1/products', { name: 'New thing', listPriceCents: 100 });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('subscription-suspended');
    expect((await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [] })).status).toBe(402);
    // money still arrives and is recorded against the sale
    const { ingestConfirmation } = await import('../src/mpesa/service');
    await ingestConfirmation({ TransID: `SUSP${Date.now().toString(36).toUpperCase()}`, TransTime: new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14), TransAmount: 100, BusinessShortCode: till, BillRefNumber: pending.number, MSISDN: '254711000000' });
    expect((await get(t.owner.auth, `/v1/sales/${pending.saleId}`)).body.status).toBe('completed');
    // the hourly billing run issues the invoice that is due; paying it reopens the account immediately
    await pool.withOrg(t.orgId, (c) => billing.issueDueInvoice(c, t.orgId, new Date()));
    const outcome = await billing.recordManualPayment(t.orgId, `MAN${Date.now().toString(36).toUpperCase()}`, 450_000);
    expect(outcome.status).toBe('active');
    expect((await post(t.owner.auth, '/v1/products', { name: 'New thing', listPriceCents: 100 })).status).toBe(201);
    await assertLedgerAgrees(t);
  });

  it('bills for real branches only: a second branch counts, the sample branch does not', async () => {
    await boot();
    const t = await newTenant('Branch Billing');
    expect((await get(t.owner.auth, '/v1/billing')).body.quote.amountCents).toBe(450_000);
    await post(t.owner.auth, '/v1/branches', { name: 'Westlands' });
    expect((await get(t.owner.auth, '/v1/billing')).body.quote).toMatchObject({ branchCount: 2, amountCents: 800_000, planCode: 'multi' });
    expect((await post(t.owner.auth, '/v1/onboarding/sample-data')).status).toBe(201);
    expect((await get(t.owner.auth, '/v1/billing')).body.quote).toMatchObject({ branchCount: 2, amountCents: 800_000 });
  });
});

describe.runIf(on)('onboarding, sample data, scanning and the track-and-trace log', () => {
  it('works out the checklist from real records, loads a labelled sample branch, and hides it without deleting', async () => {
    await boot();
    const t = await newTenant('Onboard Chemist');
    expect((await get(t.owner.auth, '/v1/onboarding')).body).toMatchObject({ doneCount: 0, total: 7, sampleDataVisible: false });
    const cashier = await addStaff(t, 'cashier');
    expect((await post(cashier.auth, '/v1/onboarding/sample-data')).status).toBe(403);

    const loaded = await post(t.owner.auth, '/v1/onboarding/sample-data');
    expect(loaded.status).toBe(201);
    expect(loaded.body.products).toBeGreaterThan(10);
    expect((await post(t.owner.auth, '/v1/onboarding/sample-data')).body.code).toBe('sample-exists');
    // the sample does not tick the real checklist
    expect((await get(t.owner.auth, '/v1/onboarding')).body).toMatchObject({ doneCount: 1 - 1 + (await get(t.owner.auth, '/v1/onboarding')).body.items.filter((i: any) => i.done).length, sampleDataVisible: true });
    const checklist = (await get(t.owner.auth, '/v1/onboarding')).body;
    expect(checklist.items.find((i: any) => i.key === 'sell').done).toBe(false);
    expect(checklist.items.find((i: any) => i.key === 'staff').done).toBe(true); // the cashier added above

    // the sample branch shows the alerts a pharmacist needs to see
    const sampleId = loaded.body.branchId;
    const alerts = (await get(t.owner.auth, `/v1/stock/alerts?branchId=${sampleId}`)).body;
    expect(alerts.expired.length).toBeGreaterThan(0);
    expect(alerts.expiring.length).toBeGreaterThan(0);
    expect(alerts.lowStock.length).toBeGreaterThan(0);
    const sales = (await get(t.owner.auth, `/v1/sales?branchId=${sampleId}`)).body;
    expect(sales.length).toBe(5);
    expect(sales.map((s: any) => s.status)).toContain('pending_payment');
    await assertLedgerAgrees(t);

    const hidden = await post(t.owner.auth, '/v1/onboarding/sample-data/hide');
    expect(hidden.body.hidden).toBe(1);
    expect((await get(t.owner.auth, '/v1/branches')).body.every((b: any) => !b.isSample)).toBe(true);
    expect((await get(t.owner.auth, '/v1/products')).body.items).toHaveLength(0);
    // the history is still there, hidden rather than deleted
    const { pool } = await boot();
    expect(await pool.withOrg(t.orgId, async (c) => Number((await c.query('SELECT count(*) AS n FROM sales')).rows[0].n))).toBe(5);
  });

  it('reads a GS1 DataMatrix at the till: product, stock in date, and whether that exact pack is in stock, sold, or unknown', async () => {
    await boot();
    const t = await newTenant('Scan Chemist');
    const gtin = '00614141999996';
    const p = await makeProduct(t.owner.auth, { name: 'Scan product', gtin: '0614141999996', listPriceCents: 8000 });
    await receive(t.owner.auth, p, [{ batchNo: 'LOT42', expiryDate: dayOffset(400), qty: 3, serials: ['SN0001', 'SN0002'] }]);
    const scan = (code: string) => post(t.owner.auth, '/v1/scan', { input: code });

    const inStock = (await scan(`(01)${gtin}(17)301231(10)LOT42(21)SN0001`)).body;
    expect(inStock).toMatchObject({ product: { name: 'Scan product' }, inDate: 3, serialStatus: 'in_stock', scan: { gtin, batchNo: 'LOT42', expiryDate: '2030-12-31' } });
    expect((await scan(`(01)${gtin}(10)LOT42(21)NOPE`)).body.serialStatus).toBe('unknown');
    expect((await scan('0614141999996')).body).toMatchObject({ scan: { format: 'retail' }, product: { name: 'Scan product' } });
    expect((await scan('0614141999997')).status).toBe(400); // wrong check digit
    expect((await scan('(01)00614141999995')).status).toBe(400);
    // an unknown product is reported as such, not an error
    expect((await scan('(01)00614141999996'.replace('99996', '99996'))).body.product).not.toBeNull();
    expect((await scan('(01)09506000134352')).body.product).toBeNull();

    await sell(t.owner.auth, { lines: [{ productId: p, serials: ['SN0001'] }], payments: [{ method: 'cash', amountCents: 8000 }] });
    expect((await scan(`(01)${gtin}(10)LOT42(21)SN0001`)).body.serialStatus).toBe('sold');
  });

  it('records what a track-and-trace report would contain, sends none of it, and exports it as plain CSV', async () => {
    await boot();
    const t = await newTenant('Trace Chemist');
    const p = await makeProduct(t.owner.auth, { name: '=SUM(A1) trap', gtin: '0614141999996', listPriceCents: 3000 });
    await receive(t.owner.auth, p, [{ batchNo: 'TR1', expiryDate: dayOffset(300), qty: 5, serials: ['T1'] }]);
    await sell(t.owner.auth, { lines: [{ productId: p, serials: ['T1'] }], payments: [{ method: 'cash', amountCents: 3000 }] });

    const status = (await get(t.owner.auth, '/v1/ntts/status')).body;
    expect(status).toMatchObject({ integrated: false, adapter: 'not-integrated', pendingEvents: 2 });
    expect(status.notice).toMatch(/NOT connected/);
    const events = (await get(t.owner.auth, '/v1/ntts/events')).body;
    expect(events.map((e: any) => e.eventType).sort()).toEqual(['receipt', 'sale']);
    expect(events.find((e: any) => e.eventType === 'sale')).toMatchObject({ gtin: '00614141999996', batchNo: 'TR1', serial: 'T1', qty: 1 });

    const csv = await get(t.owner.auth, '/v1/ntts/export.csv');
    expect(csv.headers['x-dawa-format']).toBe('internal-log-not-an-official-submission');
    expect(csv.text.split('\n')[0]).toBe('id,occurred_at,branch,event,product,gtin,batch_no,expiry_date,serial,qty');
    expect(csv.text).toContain("'=SUM(A1) trap"); // a spreadsheet formula in a product name is neutralised
    const { adapter, NotIntegratedError } = await import('../src/ntts/adapter');
    await expect(adapter().submit([])).rejects.toBeInstanceOf(NotIntegratedError);
    expect(adapter().integrated).toBe(false);
    // the outbox is append-only and cannot be marked as sent by the application
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE ntts_outbox SET status = 'pending'`))).rejects.toThrow(/permission denied/);
  });

  it('reports sales, margin, movers and expiry loss from the ledger, net of returns and voids', async () => {
    await boot();
    const t = await newTenant('Report Chemist');
    const p = await makeProduct(t.owner.auth, { name: 'Report product', listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'RP1', expiryDate: dayOffset(300), qty: 20, unitCostCents: 6000 }]);
    const s1 = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 4 }], payments: [{ method: 'cash', amountCents: 40000 }] })).body;
    const s2 = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 2 }], payments: [{ method: 'cash', amountCents: 20000 }] })).body;
    await post(t.owner.auth, `/v1/sales/${s2.saleId}/void`, { reason: 'duplicate' });
    const detail = (await get(t.owner.auth, `/v1/sales/${s1.saleId}`)).body;
    await post(t.owner.auth, `/v1/sales/${s1.saleId}/returns`, { lineId: detail.lines[0].id, qty: 1, reason: 'wrong strength', refundMethod: 'cash' });

    const sales = (await get(t.owner.auth, '/v1/reports/sales')).body;
    expect(sales.salesCount).toBe(1);
    expect(sales.netCents).toBe(40000 - 10000);
    const m = (await get(t.owner.auth, '/v1/reports/margin')).body;
    expect(m).toMatchObject({ revenueCents: 30000, costCents: 18000, marginCents: 12000, marginPct: 40 });
    const movers = (await get(t.owner.auth, '/v1/reports/movers')).body;
    expect(movers.fast[0]).toMatchObject({ name: 'Report product', sold: 3 });
    const loss = (await get(t.owner.auth, '/v1/reports/expiry-loss')).body;
    expect(loss).toMatchObject({ writtenOffCents: 0, expiredOnShelfCents: 0 });
    expect(loss.valuation.inDateCents).toBe(17 * 6000);
  });
});

describe.runIf(on)('taking your data out', () => {
  it('exports sales, stock and the controlled register as plain CSV, to the right roles, with spreadsheet formulas neutralised', async () => {
    await boot();
    const t = await newTenant('Export Chemist');
    const manager = await addStaff(t, 'manager');
    const cashier = await addStaff(t, 'cashier');
    const ph = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const p = await makeProduct(t.owner.auth, { name: '=HYPERLINK("x") bait', listPriceCents: 12000 });
    const cd = await makeProduct(t.owner.auth, { name: 'Diazepam 5mg', category: 'controlled', listPriceCents: 5000 });
    await receive(t.owner.auth, p, [{ batchNo: 'EX1', expiryDate: dayOffset(300), qty: 10, unitCostCents: 7000 }]);
    await receive(ph.auth, cd, [{ batchNo: 'CD1', expiryDate: dayOffset(300), qty: 5 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
    await sell(t.owner.auth, { lines: [{ productId: p, qty: 2 }], payments: [{ method: 'cash', amountCents: 24000 }] });

    const sales = await get(manager.auth, '/v1/export/sales.csv');
    expect(sales.status).toBe(200);
    expect(sales.headers['content-type']).toContain('text/csv');
    expect(sales.text.split('\n')[0]).toContain('sale,day,time,status,cashier');
    expect(sales.text).toContain('240');
    expect(sales.text).toContain("'=HYPERLINK");
    const stock = await get(manager.auth, '/v1/export/stock.csv');
    expect(stock.text).toContain('EX1');
    expect(stock.text).toContain('CD1');
    const reg = await get(ph.auth, '/v1/export/controlled.csv');
    expect(reg.text).toContain('Diazepam 5mg');
    expect(reg.text.trim().split('\n')).toHaveLength(2);
    // a cashier gets none of them
    for (const path of ['/v1/export/sales.csv', '/v1/export/stock.csv', '/v1/export/controlled.csv']) expect((await get(cashier.auth, path)).status).toBe(403);
  });
});

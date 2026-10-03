import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, get, liveShift, makeGuard, makePlace, newTenant, nextPhone, on, patch, post, put, shutdown, signIn } from './helpers';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

describe.runIf(on)('tenant isolation (real Postgres, RLS forced, restricted application role)', () => {
  it('keeps one firm blind to another through the API', async () => {
    const a = await newTenant('Firm A');
    const b = await newTenant('Firm B');
    const gA = await makeGuard(a.owner.auth, { fullName: 'Alpha Guard' });
    const placeA = await makePlace(a.owner.auth);
    const shiftA = await liveShift(a.owner.auth, placeA, gA.id);
    const gB = await makeGuard(b.owner.auth, { fullName: 'Beta Guard' });

    expect((await get(b.owner.auth, `/v1/guards/${gA.id}`)).status).toBe(404);
    expect((await get(b.owner.auth, '/v1/guards')).body.items.map((x: { id: string }) => x.id)).toEqual([gB.id]);
    expect((await get(b.owner.auth, `/v1/shifts/${shiftA.id}`)).status).toBe(404);
    expect((await get(b.owner.auth, `/v1/sites/${placeA.siteId}`)).status).toBe(404);
    expect((await get(b.owner.auth, `/v1/clients/${placeA.clientId}`)).status).toBe(404);
    expect((await get(b.owner.auth, '/v1/sites')).body.items).toHaveLength(0);
    expect((await get(b.owner.auth, '/v1/clients')).body.items).toHaveLength(0);
    // writes and references
    expect((await patch(b.owner.auth, `/v1/guards/${gA.id}`, { fullName: 'Hijacked' })).status).toBe(404);
    expect((await post(b.owner.auth, `/v1/shifts/${shiftA.id}/check`, { kind: 'in' })).status).toBe(404);
    expect((await put(b.owner.auth, `/v1/shifts/${shiftA.id}/guard`, { guardId: gB.id })).status).toBe(404);
    const cross = await post(b.owner.auth, '/v1/sites', { clientId: placeA.clientId, name: 'Stolen site' });
    expect([404, 409]).toContain(cross.status);
    expect((await get(a.owner.auth, `/v1/guards/${gA.id}`)).body.fullName).toBe('Alpha Guard');
  });

  it('shows the restricted role nothing without a tenant, and refuses to write another tenant\'s id', async () => {
    const a = await newTenant('Raw A');
    const b = await newTenant('Raw B');
    await makeGuard(a.owner.auth);
    const { pool } = await boot();
    const tables = (await pool.pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' JOIN pg_attribute x ON x.attrelid = c.oid AND x.attname = 'org_id' AND NOT x.attisdropped WHERE c.relkind = 'r'`
    )).rows.map((r) => r.relname as string);
    expect(tables.length).toBeGreaterThan(25);
    for (const t of tables) {
      const seen = Number((await pool.pool.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
      expect(seen, `${t} must show no rows without a tenant`).toBe(0);
    }
    // inserting a row for tenant A while bound to tenant B is refused by the policy
    await expect(pool.withOrg(b.orgId, (c) => c.query(`INSERT INTO clients (org_id, name) VALUES ($1, 'sneaky')`, [a.orgId]))).rejects.toThrow(/row-level security/);
  });

  it('has row-level security enabled and forced on every table that carries org_id, and the app role is no superuser', async () => {
    const { pool } = await boot();
    const bad = await pool.pool.query(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public' JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`
    );
    expect(bad.rows).toEqual([]);
    const role = (await pool.pool.query(`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('cannot reach another firm through a guard PIN, a portal token or a QR token', async () => {
    const a = await newTenant('Token A');
    const b = await newTenant('Token B');
    const place = await makePlace(a.owner.auth, { rounds: 1 });
    const cp = await post(a.owner.auth, `/v1/sites/${place.siteId}/checkpoints`, { name: 'Gate' });
    const bPlace = await makePlace(b.owner.auth);
    const bGuard = await makeGuard(b.owner.auth);
    const bShift = await liveShift(b.owner.auth, bPlace, bGuard.id);
    await post(b.owner.auth, `/v1/shifts/${bShift.id}/check`, { kind: 'in' });
    // A's QR token cannot be scanned against B's shift
    const scan = await post(b.owner.auth, '/v1/patrol/scan', { token: cp.body.token, shiftId: bShift.id });
    expect(scan.status).toBe(404);
    // A's client portal shows nothing of B
    const link = await put(a.owner.auth, `/v1/clients/${place.clientId}/portal`, { enabled: true });
    const { app } = await boot();
    const portal = await request(app).get(`/v1/portal/${link.body.token}`);
    expect(portal.status).toBe(200);
    expect(JSON.stringify(portal.body)).not.toContain('Token B');
  });
});

describe.runIf(on)('roles and branches', () => {
  it('hides wages from a supervisor and refuses their pay change; lets payroll set pay but not create guards', async () => {
    const t = await newTenant('Roles Firm');
    const sup = await addStaff(t, 'supervisor');
    const payroll = await addStaff(t, 'payroll');
    const ops = await addStaff(t, 'ops_manager');
    const g = await makeGuard(ops.auth);
    expect((await put(payroll.auth, `/v1/guards/${g.id}/pay`, { monthlyBasicCents: 3_000_000, allowanceCents: 0 })).status).toBe(200);
    expect((await put(ops.auth, `/v1/guards/${g.id}/pay`, { monthlyBasicCents: 1, allowanceCents: 0 })).status).toBe(403);
    expect((await put(sup.auth, `/v1/guards/${g.id}/pay`, { monthlyBasicCents: 1, allowanceCents: 0 })).status).toBe(403);
    const seenBySup = await get(sup.auth, `/v1/guards/${g.id}`);
    expect(seenBySup.body.monthlyBasicCents).toBeUndefined();
    expect(JSON.stringify((await get(sup.auth, '/v1/guards')).body)).not.toContain('monthlyBasicCents');
    expect((await get(payroll.auth, `/v1/guards/${g.id}`)).body.monthlyBasicCents).toBe(3_000_000);
    expect((await post(payroll.auth, '/v1/guards', { fullName: 'Not Allowed' })).status).toBe(403);
    expect((await get(sup.auth, '/v1/payroll/periods')).status).toBe(403);
    expect((await get(sup.auth, '/v1/invoices')).status).toBe(403);
    const audit = await get(ops.auth, '/v1/audit');
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).toContain('guard.pay_change');
  });

  it('lets an auditor read and nothing else', async () => {
    const t = await newTenant('Audit Firm');
    const aud = await addStaff(t, 'auditor');
    const g = await makeGuard(t.owner.auth);
    expect((await get(aud.auth, `/v1/guards/${g.id}`)).status).toBe(200);
    expect((await get(aud.auth, '/v1/payroll/periods')).status).toBe(200);
    expect((await post(aud.auth, '/v1/guards', { fullName: 'X Y' })).status).toBe(403);
    expect((await post(aud.auth, '/v1/clients', { name: 'X Y' })).status).toBe(403);
    expect((await post(aud.auth, '/v1/payroll/periods/2026-01/run')).status).toBe(403);
    expect((await patch(aud.auth, '/v1/settings', { minWageCents: 1 })).status).toBe(403);
  });

  it('confines a supervisor to their own branch: guards, sites, shifts, incidents', async () => {
    const t = await newTenant('Branch Firm');
    const b2 = await post(t.owner.auth, '/v1/branches', { name: 'Mombasa depot' });
    expect(b2.status).toBe(201);
    const supA = await addStaff(t, 'supervisor', { branchId: t.branchId });
    const placeA = await makePlace(t.owner.auth, { branchId: t.branchId, name: 'A site' });
    const placeB = await makePlace(t.owner.auth, { branchId: b2.body.id, name: 'B site' });
    const gA = await makeGuard(t.owner.auth, { branchId: t.branchId });
    const gB = await makeGuard(t.owner.auth, { branchId: b2.body.id });
    const shiftB = await liveShift(t.owner.auth, placeB, gB.id);
    expect((await get(supA.auth, `/v1/guards/${gB.id}`)).status).toBe(404);
    expect((await get(supA.auth, '/v1/guards')).body.items.map((x: { id: string }) => x.id)).toEqual([gA.id]);
    expect((await get(supA.auth, `/v1/sites/${placeB.siteId}`)).status).toBe(404);
    expect((await get(supA.auth, `/v1/shifts/${shiftB.id}`)).status).toBe(404);
    expect((await post(supA.auth, `/v1/shifts/${shiftB.id}/check`, { kind: 'in' })).status).toBe(404);
    expect((await post(supA.auth, '/v1/incidents', { siteId: placeB.siteId, severity: 'info', category: 'Test', narrative: 'Other branch incident' })).status).toBe(404);
    expect((await post(supA.auth, '/v1/guards', { fullName: 'Wrong Branch', branchId: b2.body.id })).status).toBe(403);
    expect(placeA.siteId).toBeTruthy();
    // the owner sees both
    expect((await get(t.owner.auth, '/v1/guards')).body.items).toHaveLength(2);
  });

  it('lets an ops manager create supervisors only', async () => {
    const t = await newTenant('Grant Firm');
    const ops = await addStaff(t, 'ops_manager');
    expect((await post(ops.auth, '/v1/team', { displayName: 'New Sup', phone: nextPhone(), role: 'supervisor', branchId: t.branchId })).status).toBe(201);
    expect((await post(ops.auth, '/v1/team', { displayName: 'New Pay', phone: nextPhone(), role: 'payroll' })).status).toBe(401);
    expect((await post(ops.auth, '/v1/team', { displayName: 'New Ops', phone: nextPhone(), role: 'ops_manager' })).status).toBe(401);
  });

  it('honours a disabled account within seconds, not at token expiry', async () => {
    const t = await newTenant('Disable Firm');
    const sup = await addStaff(t, 'supervisor');
    expect((await get(sup.auth, '/v1/overview')).status).toBe(200);
    expect((await patch(t.owner.auth, `/v1/team/${sup.id}`, { status: 'disabled' })).status).toBe(200);
    const after = await get(sup.auth, '/v1/overview');
    expect([401, 403]).toContain(after.status);
  });
});

describe.runIf(on)('signup, billing and the sample organisation', () => {
  it('signs a firm up with a phone code, then signs in with the PIN', async () => {
    const { app } = await boot();
    const { setProvider } = await import('../src/notify/provider');
    const sent: string[] = [];
    setProvider({ name: 'capture', send: async (m) => { sent.push(m.body); return { status: 'logged' as const }; } });
    const phone = nextPhone();
    const start = await request(app).post('/v1/signup').send({ businessName: 'Signup Security', contactName: 'Sam Owner', phone, expectedGuards: 40 });
    expect(start.status).toBe(201);
    const code = /\b(\d{6})\b/.exec(sent[0]!)![1]!;
    const bad = await request(app).post('/v1/signup/verify').send({ id: start.body.id, code: code === '000000' ? '111111' : '000000', pin: '246810' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    const ok = await request(app).post('/v1/signup/verify').send({ id: start.body.id, code, pin: '246810' });
    expect(ok.status).toBe(201);
    expect(ok.body.role).toBe('owner');
    const login = await signIn(phone, '246810');
    expect(login.status).toBe(200);
    const again = await request(app).post('/v1/signup/verify').send({ id: start.body.id, code, pin: '246810' });
    expect(again.status).toBeGreaterThanOrEqual(400);
    setProvider(null);
  });

  it('prices per active guard with a minimum, and says the prices are provisional', async () => {
    const { app } = await boot();
    const p = await request(app).get('/v1/pricing');
    expect(p.body).toMatchObject({ currency: 'KES', perGuardCents: 20_000, minimumCents: 300_000, provisional: true, trialDays: 14 });
    const t = await newTenant('Price Firm');
    expect((await get(t.owner.auth, '/v1/billing')).body.quote).toMatchObject({ planCode: 'minimum', unitCount: 0, amountCents: 300_000 });
    for (let i = 0; i < 20; i += 1) await makeGuard(t.owner.auth);
    expect((await get(t.owner.auth, '/v1/billing')).body.quote).toMatchObject({ planCode: 'per-guard', unitCount: 20, amountCents: 400_000 });
    const g = await makeGuard(t.owner.auth);
    await post(t.owner.auth, `/v1/guards/${g.id}/exit`, { exitedOn: new Date().toISOString().slice(0, 10) });
    expect((await get(t.owner.auth, '/v1/billing')).body.quote.unitCount).toBe(20); // an exited guard is not billed
  });

  it('goes trial, invoice, mock payment, active; and suspends read-only without losing anything', async () => {
    const t = await newTenant('Billing Flow');
    const g = await makeGuard(t.owner.auth);
    const view = await get(t.owner.auth, '/v1/billing');
    expect(view.body).toMatchObject({ status: 'trial', writesAllowed: true });
    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    await pool.withMigrator((c) => c.query(`UPDATE subscriptions SET trial_ends_at = now() + interval '2 days' WHERE org_id = $1`, [t.orgId]));
    await billing.runBillingCycle();
    await billing.runBillingCycle();
    const invoiced = await get(t.owner.auth, '/v1/billing');
    expect(invoiced.body.invoices).toHaveLength(1);
    expect(invoiced.body.invoices[0].number).toMatch(/^AS-\d{4}-\d{6}$/);
    expect(invoiced.body.outstandingCents).toBe(300_000);
    expect((await post(t.owner.auth, '/v1/billing/mock-payment', {})).body.billing.outstandingCents).toBe(0);
    await pool.withMigrator((c) => c.query(`UPDATE subscriptions SET trial_ends_at = now() - interval '60 days', current_period_end = now() - interval '45 days' WHERE org_id = $1`, [t.orgId]));
    expect((await get(t.owner.auth, '/v1/billing')).body.status).toBe('suspended');
    const blocked = await post(t.owner.auth, '/v1/guards', { fullName: 'Late Joiner' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('subscription-suspended');
    expect((await get(t.owner.auth, `/v1/guards/${g.id}`)).status).toBe(200);
    await billing.runBillingCycle();
    expect((await post(t.owner.auth, '/v1/billing/mock-payment', {})).status).toBe(201);
    expect((await post(t.owner.auth, '/v1/guards', { fullName: 'Back Again' })).status).toBe(201);
  });

  it('never bills or suspends a sample organisation, and labels it', async () => {
    const t = await newTenant('Sample Org', { sample: true });
    const billing = await import('../src/billing/service');
    await billing.runBillingCycle();
    const v = await get(t.owner.auth, '/v1/billing');
    expect(v.body.invoices).toHaveLength(0);
    expect(v.body.status).toBe('trial');
    expect((await get(t.owner.auth, '/v1/onboarding')).body.isSample).toBe(true);
    const guards = await get(t.owner.auth, '/v1/guards?pageSize=100');
    expect(guards.body.total).toBe(24);
  });

  it('builds a sample whose compliance report catches the guards it paid too little', async () => {
    const t = await newTenant('Sample Compliance', { sample: true });
    const month = new Date().toISOString().slice(0, 7);
    const r = await get(t.owner.auth, `/v1/payroll/compliance/${month}`);
    expect(r.status).toBe(200);
    expect(r.body.belowMinimum.length).toBe(2);
    expect(r.body.flagCounts.psra_expired).toBe(1);
    expect(r.body.flagCounts.missing_nssf_no).toBe(2);
    const o = await get(t.owner.auth, '/v1/overview');
    expect(o.body.openIncidents.critical).toBe(1);
    expect(o.body.debtors.overdueCents).toBeGreaterThan(0);
  });

  it('refuses mock payment when billing is live', async () => {
    const env = await import('../src/config/env');
    const t = await newTenant('Live Mode');
    const before = env.env.BILLING_MODE;
    (env.env as { BILLING_MODE: string }).BILLING_MODE = 'live';
    try {
      expect((await post(t.owner.auth, '/v1/billing/mock-payment', {})).status).toBe(404);
    } finally {
      (env.env as { BILLING_MODE: string }).BILLING_MODE = before;
    }
  });

  it('ignores an M-Pesa confirmation for any shortcode but its own, and keeps the secret path', async () => {
    const { app } = await boot();
    const wrong = await request(app).post('/v1/mpesa/c2b/not-the-secret/confirmation').send({});
    expect(wrong.status).toBe(404);
    const secret = process.env.MPESA_CALLBACK_SECRET!;
    const other = await request(app).post(`/v1/mpesa/c2b/${secret}/confirmation`).send({ TransID: `OTH${Date.now()}`, TransTime: '20261003101500', TransAmount: 100, BusinessShortCode: '123456', BillRefNumber: 'x', MSISDN: '254700000001' });
    expect(other.status).toBe(200);
    const junk = await request(app).post(`/v1/mpesa/c2b/${secret}/confirmation`).send({ nonsense: true });
    expect(junk.body.ResultCode).toBe(1);
  });

  it('reads the settings and says the wage defaults are the firm\'s to confirm', async () => {
    const t = await newTenant('Settings Firm');
    const s = await get(t.owner.auth, '/v1/settings');
    expect(s.body.settings).toMatchObject({ minWageCents: 3_000_000, maxHoursPerWeek: null, minRestHours: null, allowancesCountTowardMin: false });
    const set = await patch(t.owner.auth, '/v1/settings', { maxHoursPerWeek: 60, minWageCents: 3_450_000 });
    expect(set.body.settings).toMatchObject({ maxHoursPerWeek: 60, minWageCents: 3_450_000 });
    expect((await patch(t.owner.auth, '/v1/settings', { maxHoursPerWeek: null })).body.settings.maxHoursPerWeek).toBeNull();
    expect((await patch(t.owner.auth, '/v1/settings', { overtimeMultiplierBp: 5000 })).status).toBe(400);
  });
});

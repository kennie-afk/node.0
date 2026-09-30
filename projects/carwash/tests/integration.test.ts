/**
 * Runs against a real, migrated Postgres, as the restricted application role, so row-level
 * security is in force. Skipped unless FORECOURT_INTEGRATION=1 (see README "Testing").
 *   createdb forecourt_test; DATABASE_MIGRATION_URL=... npm run migrate
 *   FORECOURT_INTEGRATION=1 DATABASE_URL=... DATABASE_MIGRATION_URL=... FORECOURT_APP_PASSWORD=... \
 *   JWT_SECRET=... MPESA_CALLBACK_SECRET=... FORECOURT_ALLOW_DEMO_SEED=true npx vitest run tests/integration.test.ts
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const on = process.env.FORECOURT_INTEGRATION === '1';
vi.setConfig({ testTimeout: 60_000 });

const till = () => String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
const phone = () => `2547${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;

describe.runIf(on)('provisioning, onboarding and the write API (real Postgres, RLS on)', () => {
  let app: import('express').Express;
  let pool: typeof import('../src/persistence/pool');
  let provisioning: typeof import('../src/admin/provisioning');
  let seed: typeof import('../src/demo/seed');

  async function load() {
    if (app) return;
    pool = await import('../src/persistence/pool');
    provisioning = await import('../src/admin/provisioning');
    seed = await import('../src/demo/seed');
    app = (await import('../src/api/app')).createApiApp();
  }

  afterAll(async () => {
    if (pool) {
      await pool.closePool();
      await pool.closeMigrationPool();
    }
  });

  async function signIn(p: string, pin: string) {
    const res = await request(app).post('/v1/auth/login').send({ phone: p, pin });
    return { res, auth: { Authorization: `Bearer ${res.body.token}` } };
  }

  async function tenant(name: string) {
    const ownerPhone = phone();
    const made = await provisioning.provisionOrganisation({ businessName: name, ownerName: 'Owner One', ownerPhone });
    const { auth } = await signIn(made.phone, made.pin);
    return { made, auth };
  }

  it('provisions an organisation whose owner can sign in with the generated PIN, and the PIN is stored hashed', async () => {
    await load();
    const { made, auth } = await tenant('Pwani Wash');
    expect(made.pin).toMatch(/^\d{6}$/);
    const overview = await request(app).get('/v1/overview').set(auth);
    expect(overview.body.organisation).toBe('Pwani Wash');
    expect(overview.body.sites).toBe(1);

    const stored = await pool.withMigrator(async (c) => (await c.query('SELECT pin_hash FROM users WHERE id = $1', [made.ownerId])).rows[0].pin_hash);
    expect(stored).not.toContain(made.pin);
    expect(stored).toMatch(/^\$2[aby]\$/);
    const services = await request(app).get('/v1/services').set(auth);
    expect(services.body.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a phone number that already belongs to an account', async () => {
    await load();
    const { made } = await tenant('Dup Wash A');
    await expect(
      provisioning.provisionOrganisation({ businessName: 'Dup Wash B', ownerName: 'Someone', ownerPhone: made.phone })
    ).rejects.toThrow(/already belongs/);
  });

  it('turns a signup request into a working tenant exactly once', async () => {
    await load();
    const contact = phone();
    const signup = await request(app).post('/v1/signup').send({ businessName: 'Signup Wash', contactName: 'Sia Kamau', phone: contact, siteCount: 2 });
    expect(signup.status).toBe(201);
    const result = await provisioning.provisionFromSignup(signup.body.id, { siteName: 'Signup Wash Main', tillNumber: `99${Math.floor(Math.random() * 90000) + 10000}` });
    const { res } = await signIn(result.phone, result.pin);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('owner');
    const rows = await provisioning.listSignups('onboarded');
    expect(rows.find((row) => row.id === signup.body.id)).toBeTruthy();
    await expect(provisioning.provisionFromSignup(signup.body.id)).rejects.toThrow(/already been provisioned/);
  });

  it('keeps one organisation out of another, even by id', async () => {
    await load();
    const a = await tenant('Isolation A');
    const b = await tenant('Isolation B');
    const siteA = (await request(app).get('/v1/sites').set(a.auth)).body[0].id;
    expect((await request(app).get(`/v1/sites/${siteA}`).set(b.auth)).status).toBe(404);
    expect((await request(app).put(`/v1/sites/${siteA}`).set(b.auth).send({ name: 'Hijacked' })).status).toBe(404);
    const flagsB = await request(app).get('/v1/discrepancies').set(b.auth);
    expect(flagsB.body).toEqual([]);
  });

  it('lets an owner manage sites, bays, prices and people, and refuses everyone else', async () => {
    await load();
    const { made, auth } = await tenant('Write Wash');

    const clash = till();
    const site = await request(app).post('/v1/sites').set(auth).send({ name: 'Second Site', tillNumber: clash, opensMinute: 420, closesMinute: 1080 });
    expect(site.status).toBe(201);
    expect((await request(app).post('/v1/sites').set(auth).send({ name: 'Clash', tillNumber: clash })).status).toBe(409);
    expect((await request(app).post('/v1/sites').set(auth).send({ name: 'Backwards', opensMinute: 900, closesMinute: 600 })).status).toBe(400);

    const bay = await request(app).post(`/v1/sites/${site.body.id}/bays`).set(auth).send({ label: 'Bay 2' });
    expect(bay.status).toBe(201);
    expect((await request(app).post(`/v1/sites/${site.body.id}/bays`).set(auth).send({ label: 'bay 2' })).status).toBe(409);
    expect((await request(app).put(`/v1/bays/${bay.body.id}`).set(auth).send({ label: 'Bay Two' })).body.label).toBe('Bay Two');
    expect((await request(app).delete(`/v1/bays/${bay.body.id}`).set(auth)).status).toBe(204);

    const service = await request(app).post('/v1/services').set(auth).send({ name: 'Polish', listPriceCents: 90_000 });
    expect(service.status).toBe(201);
    const repriced = await request(app).put(`/v1/services/${service.body.id}`).set(auth).send({ listPriceCents: 95_000, active: false });
    expect(repriced.body).toMatchObject({ listPriceCents: 95_000, active: false });

    const workerPhone = phone();
    const worker = await request(app).post('/v1/users').set(auth).send({ displayName: 'Wanjiku Mbugua', phone: workerPhone, pin: '5544', role: 'worker', siteId: site.body.id });
    expect(worker.status).toBe(201);
    expect((await request(app).post('/v1/users').set(auth).send({ displayName: 'Copy Cat', phone: workerPhone, pin: '5544', role: 'worker' })).status).toBe(409);

    const workerSession = await signIn(workerPhone, '5544');
    expect(workerSession.res.status).toBe(200);
    expect((await request(app).post('/v1/sites').set(workerSession.auth).send({ name: 'Nope' })).status).toBe(403);
    expect((await request(app).get('/v1/users').set(workerSession.auth)).status).toBe(403);
    expect((await request(app).put(`/v1/services/${service.body.id}`).set(workerSession.auth).send({ listPriceCents: 1 })).status).toBe(403);

    const suspended = await request(app).put(`/v1/users/${worker.body.id}`).set(auth).send({ status: 'suspended' });
    expect(suspended.body.status).toBe('suspended');

    // an organisation cannot be left without an owner
    const demote = await request(app).put(`/v1/users/${made.ownerId}`).set(auth).send({ role: 'manager' });
    expect(demote.status).toBe(403);
  });

  it('records a job through its whole life and refuses moves the state machine forbids', async () => {
    await load();
    const { made, auth } = await tenant('Job Wash');
    const siteId = made.siteId;
    const workerPhone = phone();
    await request(app).post('/v1/users').set(auth).send({ displayName: 'Hamisi Juma', phone: workerPhone, pin: '7788', role: 'worker', siteId });
    const worker = (await signIn(workerPhone, '7788')).auth;
    const services = (await request(app).get('/v1/services').set(auth)).body;
    const basic = services.find((s: any) => s.name === 'Basic wash');

    const job = await request(app).post('/v1/jobs').set(worker).send({ plate: 'KDA 123B', serviceIds: [basic.id] });
    expect(job.status).toBe(201);
    expect(job.body).toMatchObject({ state: 'created', listCents: 50_000, quotedCents: 50_000 });

    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'closed' })).status).toBe(409);
    expect((await request(app).post(`/v1/jobs/${job.body.id}/cash`).set(worker).send({})).status).toBe(409);
    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'started' })).body.state).toBe('in_progress');
    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'work_finished' })).body.state).toBe('awaiting_payment');
    expect((await request(app).post(`/v1/jobs/${job.body.id}/cash`).set(worker).send({})).body.state).toBe('paid');
    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'closed' })).body.state).toBe('closed');

    const detail = await request(app).get(`/v1/jobs/${job.body.id}`).set(auth);
    expect(detail.body.events.map((e: any) => e.type)).toEqual(['job.created', 'job.started', 'job.work_finished', 'job.payment_matched', 'job.closed']);
    expect(detail.body.payments[0]).toMatchObject({ channel: 'cash', amountCents: 50_000 });

    // a worker cannot record at another site, nor with an unknown service
    const other = await request(app).post('/v1/sites').set(auth).send({ name: 'Elsewhere' });
    expect((await request(app).post('/v1/jobs').set(worker).send({ siteId: other.body.id, serviceIds: [basic.id] })).status).toBe(403);
    expect((await request(app).post('/v1/jobs').set(worker).send({ serviceIds: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(400);
  });

  it('matches an M-Pesa payment to the open job by plate, through the real callback', async () => {
    await load();
    const { made, auth } = await tenant('Pay Wash');
    await request(app).put(`/v1/sites/${made.siteId}`).set(auth).send({ tillNumber: `55${Math.floor(Math.random() * 900000) + 100000}` });
    const site = (await request(app).get(`/v1/sites/${made.siteId}`).set(auth)).body;
    const basic = (await request(app).get('/v1/services').set(auth)).body.find((s: any) => s.name === 'Basic wash');
    const job = await request(app).post('/v1/jobs').set(auth).send({ siteId: made.siteId, plate: 'KCE 901Z', serviceIds: [basic.id] });
    await request(app).post(`/v1/jobs/${job.body.id}/events`).set(auth).send({ type: 'started' });
    await request(app).post(`/v1/jobs/${job.body.id}/events`).set(auth).send({ type: 'work_finished' });

    const body = { TransID: `T${Date.now()}`, TransTime: '20260930120000', TransAmount: 500, BusinessShortCode: site.tillNumber, BillRefNumber: 'KCE901Z', MSISDN: '254700111222' };
    const callback = await request(app).post('/v1/webhooks/mpesa/confirmation').set('x-callback-secret', process.env.MPESA_CALLBACK_SECRET!).send(body);
    expect(callback.body.ResultCode).toBe(0);
    const detail = await request(app).get(`/v1/jobs/${job.body.id}`).set(auth);
    expect(detail.body.state).toBe('paid');
    expect(detail.body.payments[0].channel).toBe('mpesa');
    const wrong = await request(app).post('/v1/webhooks/mpesa/confirmation').set('x-callback-secret', 'not-the-secret-not-the-secret').send(body);
    expect(wrong.body.ResultCode).toBe(1);
  });

  it('lets a manager resolve a flag with a note, and insists on the note', async () => {
    await load();
    const { made, auth } = await tenant('Flag Wash');
    const id = await pool.withOrg(made.orgId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO discrepancies (org_id, site_id, business_day, type, severity, est_value_cents, summary) VALUES ($1,$2,'2026-09-01','ghost_wash','high',100000,'test flag') RETURNING id`,
        [made.orgId, made.siteId]
      );
      return rows[0].id as string;
    });
    expect((await request(app).post(`/v1/discrepancies/${id}/resolve`).set(auth).send({ state: 'explained' })).status).toBe(400);
    const resolved = await request(app).post(`/v1/discrepancies/${id}/resolve`).set(auth).send({ state: 'explained', note: 'The meter was flushed after maintenance.' });
    expect(resolved.body.state).toBe('explained');
    const open = await request(app).get('/v1/discrepancies?state=open').set(auth);
    expect(open.body).toEqual([]);
    const one = await request(app).get(`/v1/discrepancies/${id}`).set(auth);
    expect(one.body).toMatchObject({ state: 'explained', resolutionNote: 'The meter was flushed after maintenance.', resolvedBy: 'Owner One' });
    expect(String(one.body.businessDay).slice(0, 10)).toBe('2026-09-01');
  });

  it('refuses to seed demo data unless explicitly allowed', async () => {
    await load();
    const saved = process.env.FORECOURT_ALLOW_DEMO_SEED;
    process.env.FORECOURT_ALLOW_DEMO_SEED = 'false';
    await expect(seed.seedDemo()).rejects.toThrow(/refusing to seed demo data/);
    process.env.FORECOURT_ALLOW_DEMO_SEED = saved;
  });

  it('seeds the demo once, is idempotent on a second run, and every console list has data', async () => {
    await load();
    const first = await seed.seedDemo({ reset: true });
    expect(first.reused).toBe(false);
    expect(first.flags).toBeGreaterThanOrEqual(10);
    const again = await seed.seedDemo();
    expect(again.reused).toBe(true);
    expect(again.orgId).toBe(first.orgId);

    const { auth, res } = await signIn('254700000001', '246810');
    expect(res.status).toBe(200);
    for (const path of ['sites', 'services', 'users', 'devices', 'jobs', 'payments', 'telemetry', 'discrepancies']) {
      const list = await request(app).get(`/v1/${path}`).set(auth);
      expect(list.status, path).toBe(200);
      expect(list.body.length, path).toBeGreaterThan(0);
    }
    const types = new Set((await request(app).get('/v1/discrepancies').set(auth)).body.map((flag: any) => flag.type));
    for (const expected of ['ghost_wash', 'underquoting', 'after_hours_operation', 'payment_without_job', 'job_without_payment', 'cash_ratio_spike', 'abandoned_job_pattern']) {
      expect(types, expected).toContain(expected);
    }
    const states = new Set((await request(app).get('/v1/discrepancies').set(auth)).body.map((flag: any) => flag.state));
    expect(states).toEqual(new Set(['open', 'explained', 'confirmed', 'dismissed']));
    // a manager sees the same organisation but cannot manage the team
    const manager = await signIn('254700000002', '246810');
    expect((await request(app).get('/v1/overview').set(manager.auth)).status).toBe(200);
    expect((await request(app).post('/v1/users').set(manager.auth).send({ displayName: 'X Y', phone: phone(), pin: '1234', role: 'worker' })).status).toBe(403);
  }, 180_000);
});

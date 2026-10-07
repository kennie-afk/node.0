/**
 * Self-serve signup, Forecourt's own billing, sample data and the first-hour summary, against a real
 * migrated Postgres as the restricted application role (row-level security in force). Skipped unless
 * FORECOURT_INTEGRATION=1 (see README "Testing").
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const on = process.env.FORECOURT_INTEGRATION === '1';
vi.setConfig({ testTimeout: 120_000 });

const phone = () => `2547${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const DAY = 86_400_000;

describe.runIf(on)('self-serve signup, billing, sample data and the summary (real Postgres, RLS on)', () => {
  let app: import('express').Express;
  let pool: typeof import('../src/persistence/pool');
  let billing: typeof import('../src/billing/service');
  let mpesa: typeof import('../src/mpesa/service');
  let provisioning: typeof import('../src/admin/provisioning');
  let sandbox: typeof import('../src/demo/sandbox');

  async function load() {
    if (app) return;
    pool = await import('../src/persistence/pool');
    billing = await import('../src/billing/service');
    mpesa = await import('../src/mpesa/service');
    provisioning = await import('../src/admin/provisioning');
    sandbox = await import('../src/demo/sandbox');
    app = (await import('../src/api/app')).createApiApp();
  }

  afterAll(async () => {
    if (pool) {
      await pool.closePool();
      await pool.closeMigrationPool();
    }
  });

  /** The code is only ever in the outbound message (the default provider logs, it does not send). */
  async function codeFor(p: string): Promise<string> {
    const { rows } = await pool.withoutTenant((c) =>
      c.query(`SELECT body FROM outbound_messages WHERE to_phone = $1 AND purpose = 'signup-code' ORDER BY created_at DESC LIMIT 1`, [p])
    );
    return /(\d{6})/.exec(rows[0].body)![1]!;
  }

  /** Each caller gets its own address, as real owners would, so the per-IP limits are not what is under test. */
  let nextIp = 1;
  const freshIp = () => `10.${Math.floor(nextIp / 250)}.${nextIp++ % 250}.7`;

  async function selfServe(business: string) {
    const p = phone();
    const started = await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: business, contactName: 'Owner One', phone: p });
    expect(started.status).toBe(201);
    const verified = await request(app).post('/v1/signup/verify').set('X-Forwarded-For', freshIp()).send({ id: started.body.id, code: await codeFor(p), pin: '482913' });
    expect(verified.status).toBe(201);
    return { phone: p, id: started.body.id as string, orgId: verified.body.orgId as string, auth: { Authorization: `Bearer ${verified.body.token}` } };
  }

  /**
   * Runs SQL scoped to one organisation, as the restricted application role. (The migration role is a
   * superuser here and would see every tenant's rows, which would make these checks meaningless.)
   */
  async function asOwner(orgId: string, sql: string, params: unknown[] = []) {
    return pool.withMigrator(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query('SET LOCAL ROLE forecourt_app');
        await c.query("SELECT set_config('forecourt.org_id', $1, true)", [orgId]);
        const result = await c.query(sql, params);
        await c.query('COMMIT');
        return result;
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  const confirmation = (over: Record<string, unknown>) => ({
    TransactionType: 'Pay Bill',
    TransID: `T${Math.random().toString(36).slice(2, 11).toUpperCase()}`,
    TransTime: '20261002120000',
    TransAmount: 1,
    BusinessShortCode: 'MOCKPAYBILL',
    BillRefNumber: '',
    MSISDN: '254700000009',
    ...over
  });

  // ---- signup -------------------------------------------------------------------------------

  it('creates an organisation, a first site, a starter price list and a trial from a verified phone, with no operator', async () => {
    await load();
    const owner = await selfServe('Pwani Self Wash');

    const me = await request(app).get('/v1/me').set(owner.auth);
    expect(me.body.role).toBe('owner');
    expect((await request(app).get('/v1/overview').set(owner.auth)).body).toMatchObject({ organisation: 'Pwani Self Wash', sites: 1 });
    expect((await request(app).get('/v1/services').set(owner.auth)).body.length).toBeGreaterThanOrEqual(3);

    const view = (await request(app).get('/v1/billing').set(owner.auth)).body;
    expect(view.status).toBe('trial');
    expect(view.billingRef).toMatch(/^FC\d{6}$/);
    expect(view.quote).toMatchObject({ planCode: 'starter', amountCents: 350_000 });
    expect(Math.round((new Date(view.trialEndsAt).getTime() - Date.now()) / DAY)).toBe(14);

    // The owner can sign in afterwards with the PIN they chose, however they type their number.
    const login = await request(app).post('/v1/auth/login').send({ phone: owner.phone, pin: '482913' });
    expect(login.status).toBe(200);
    for (const typed of [`0${owner.phone.slice(3)}`, `+${owner.phone}`, ` ${owner.phone.slice(0, 6)} ${owner.phone.slice(6)} `]) {
      expect([typed, (await request(app).post('/v1/auth/login').send({ phone: typed, pin: '482913' })).status]).toEqual([typed, 200]);
    }
    expect((await request(app).post('/v1/auth/login').send({ phone: owner.phone, pin: '000000' })).status).toBe(401);
    const stored = await pool.withMigrator(async (c) => (await c.query('SELECT status, org_id, code_hash FROM signup_requests WHERE id = $1', [owner.id])).rows[0]);
    expect(stored).toMatchObject({ status: 'onboarded', org_id: owner.orgId, code_hash: null });
  });

  it('never stores the code or the PIN in the clear', async () => {
    await load();
    const p = phone();
    const started = await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: 'Hash Wash', contactName: 'Owner', phone: p });
    const code = await codeFor(p);
    const row = await pool.withMigrator(async (c) => (await c.query('SELECT code_hash FROM signup_requests WHERE id = $1', [started.body.id])).rows[0]);
    expect(row.code_hash).toMatch(/^\$2[aby]\$/);
    expect(row.code_hash).not.toContain(code);
  });

  it('refuses a number that already has an account, and a malformed one', async () => {
    await load();
    const owner = await selfServe('Taken Wash');
    const ip = freshIp();
    expect((await request(app).post('/v1/signup').set('X-Forwarded-For', ip).send({ businessName: 'Again', contactName: 'Someone', phone: owner.phone })).status).toBe(409);
    expect((await request(app).post('/v1/signup').set('X-Forwarded-For', ip).send({ businessName: 'Bad', contactName: 'Someone', phone: '12345' })).status).toBe(400);
    expect((await request(app).post('/v1/signup').set('X-Forwarded-For', ip).send({ businessName: 'x' })).status).toBe(400);
  });

  it('limits how many signups one address can start in an hour, and how many numbers one phone can be asked for', async () => {
    await load();
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push((await request(app).post('/v1/signup').set('X-Forwarded-For', ip).send({ businessName: 'Spam', contactName: 'Bot', phone: phone() })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201]);
    expect(statuses.slice(5)).toEqual([429, 429]);

    const p = phone();
    const perPhone: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      perPhone.push((await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: 'Same', contactName: 'Person', phone: p })).status);
    }
    expect(perPhone).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it('counts wrong codes, locks after five, and a resend issues a fresh code but only after a cooldown', async () => {
    await load();
    const p = phone();
    const started = await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: 'Lock Wash', contactName: 'Owner', phone: p });
    const id = started.body.id;
    const real = await codeFor(p);
    const wrong = real === '000000' ? '111111' : '000000';

    const first = await request(app).post('/v1/signup/verify').send({ id, code: wrong, pin: '123456' });
    expect(first.status).toBe(401);
    expect(first.body.message).toContain('4 tries left');
    for (let i = 0; i < 4; i += 1) await request(app).post('/v1/signup/verify').send({ id, code: wrong, pin: '123456' });
    const locked = await request(app).post('/v1/signup/verify').send({ id, code: real, pin: '123456' });
    expect(locked.status).toBe(429);

    const tooSoon = await request(app).post('/v1/signup/resend').send({ id });
    expect(tooSoon.status).toBe(429);
    await pool.withMigrator((c) => c.query(`UPDATE signup_requests SET code_sent_at = now() - interval '2 minutes' WHERE id = $1`, [id]));
    expect((await request(app).post('/v1/signup/resend').send({ id })).status).toBe(200);
    const fresh = await codeFor(p);
    const ok = await request(app).post('/v1/signup/verify').send({ id, code: fresh, pin: '123456' });
    expect(ok.status).toBe(201);
  });

  it('rejects an expired code and a PIN that is not six digits', async () => {
    await load();
    const p = phone();
    const started = await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: 'Old Wash', contactName: 'Owner', phone: p });
    const code = await codeFor(p);
    expect((await request(app).post('/v1/signup/verify').send({ id: started.body.id, code, pin: '12' })).status).toBe(400);
    await pool.withMigrator((c) => c.query(`UPDATE signup_requests SET code_expires_at = now() - interval '1 minute' WHERE id = $1`, [started.body.id]));
    const expired = await request(app).post('/v1/signup/verify').send({ id: started.body.id, code, pin: '123456' });
    expect(expired.status).toBe(401);
    expect(expired.body.message).toContain('expired');
  });

  it('creates the organisation exactly once when verify is sent twice at the same moment', async () => {
    await load();
    const p = phone();
    const started = await request(app).post('/v1/signup').set('X-Forwarded-For', freshIp()).send({ businessName: 'Race Wash', contactName: 'Owner', phone: p });
    const code = await codeFor(p);
    const send = () => request(app).post('/v1/signup/verify').send({ id: started.body.id, code, pin: '654321' });
    const results = await Promise.all([send(), send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const orgs = await pool.withMigrator(async (c) => (await c.query('SELECT count(*)::int AS n FROM users WHERE phone = $1', [p])).rows[0].n);
    expect(orgs).toBe(1);
  });

  it('takes a Daraja confirmation with the secret in the registered URL as well as in a header, and refuses a wrong one', async () => {
    await load();
    const owner = await selfServe('Webhook Wash');
    const ref = (await billing.getBillingView(owner.orgId)).billingRef;
    const secret = process.env.MPESA_CALLBACK_SECRET!;
    const body = confirmation({ BillRefNumber: ref, TransAmount: 3500 });

    const wrong = await request(app).post('/v1/hooks/pay/not-the-secret/confirmation').send(body);
    expect(wrong.body).toEqual({ ResultCode: 1, ResultDesc: 'Rejected' });
    expect((await asOwner(owner.orgId, 'SELECT count(*)::int AS n FROM billing_payments')).rows[0].n).toBe(0);

    const viaPath = await request(app).post(`/v1/hooks/pay/${secret}/confirmation`).send(body);
    expect(viaPath.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    const viaHeader = await request(app).post('/v1/webhooks/mpesa/confirmation').set('x-callback-secret', secret).send(body);
    expect(viaHeader.body).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    // delivered twice, applied once
    expect((await asOwner(owner.orgId, 'SELECT count(*)::int AS n FROM billing_payments')).rows[0].n).toBe(1);
  });

  it('registers a real device whose secret is shown once, stored only as a hash, and works against the ingestion service', async () => {
    await load();
    const owner = await selfServe('Device Wash');
    const site = (await request(app).get('/v1/sites').set(owner.auth)).body[0];
    const bay = (await request(app).get(`/v1/sites/${site.id}`).set(owner.auth)).body.bays[0];

    expect((await request(app).post('/v1/devices').set(owner.auth).send({ siteId: site.id, type: 'toaster' })).status).toBe(400);
    const made = await request(app).post('/v1/devices').set(owner.auth).send({ siteId: site.id, bayId: bay.id, type: 'flow_meter' });
    expect(made.status).toBe(201);
    expect(made.body.secret).toMatch(/^[0-9a-f]{48}$/);

    const stored = (await asOwner(owner.orgId, 'SELECT secret_hash FROM devices WHERE id = $1', [made.body.id])).rows[0].secret_hash;
    expect(stored).toMatch(/^\$2[aby]\$/);
    expect(stored).not.toContain(made.body.secret);

    const { createIngestionApp } = await import('../src/ingestion/server');
    const ingest = createIngestionApp();
    const reading = { deviceId: made.body.id, readings: [{ sequence: 1, ts: new Date().toISOString(), metric: 'water_litres', value: 12.5 }] };
    const accepted = await request(ingest).post('/v1/telemetry').set('x-device-id', made.body.id).set('x-device-secret', made.body.secret).send(reading);
    expect(accepted.status).toBe(202);
    expect(accepted.body.stored).toBe(1);
    const refused = await request(ingest).post('/v1/telemetry').set('x-device-id', made.body.id).set('x-device-secret', 'not-the-secret').send(reading);
    expect(refused.status).toBe(401);

    // another organisation cannot register a device on this site
    const stranger = await selfServe('Stranger Wash');
    expect((await request(app).post('/v1/devices').set(stranger.auth).send({ siteId: site.id, type: 'camera' })).status).toBe(404);
    // and only an owner can register at all
    expect((await request(app).get('/v1/devices').set(owner.auth)).body.some((d: { id: string }) => d.id === made.body.id)).toBe(true);
  });

  it('lets an attendant record work and nothing else: no payments, flags, water, reports or billing', async () => {
    await load();
    const owner = await selfServe('Attendant Wash');
    const workerPhone = phone();
    const site = (await request(app).get('/v1/sites').set(owner.auth)).body[0];
    expect((await request(app).post('/v1/users').set(owner.auth).send({ displayName: 'Hassan', phone: workerPhone, role: 'worker', pin: '135790', siteId: site.id })).status).toBe(201);
    const login = await request(app).post('/v1/auth/login').send({ phone: workerPhone, pin: '135790' });
    expect(login.status).toBe(200);
    const worker = { Authorization: `Bearer ${login.body.token}` };

    // the work screen's own calls succeed
    const services = (await request(app).get('/v1/services').set(worker)).body;
    expect(services.length).toBeGreaterThan(0);
    const job = await request(app).post('/v1/jobs').set(worker).send({ serviceIds: [services[0].id], plate: 'KDA 123A' });
    expect(job.status).toBe(201);
    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'started' })).status).toBe(200);
    expect((await request(app).post(`/v1/jobs/${job.body.id}/events`).set(worker).send({ type: 'work_finished' })).status).toBe(200);
    expect((await request(app).post(`/v1/jobs/${job.body.id}/cash`).set(worker).send({})).status).toBe(201);
    expect((await request(app).get('/v1/jobs').set(worker)).status).toBe(200);

    // the evidence they are checked against is not theirs to read
    for (const path of ['/v1/payments', '/v1/discrepancies', '/v1/telemetry', '/v1/overview', '/v1/devices', '/v1/onboarding', '/v1/billing', '/v1/summary']) {
      expect([path, (await request(app).get(path).set(worker)).status]).toEqual([path, 403]);
    }
    expect((await request(app).get('/v1/report').query({ siteId: site.id, day: '2026-09-30' }).set(worker)).status).toBe(403);
    expect((await request(app).post('/v1/sandbox').set(worker).send({})).status).toBe(403);
    expect((await request(app).post('/v1/sites').set(worker).send({ name: 'Mine' })).status).toBe(403);
    // and the owner still can
    for (const path of ['/v1/payments', '/v1/discrepancies', '/v1/overview', '/v1/devices']) {
      expect([path, (await request(app).get(path).set(owner.auth)).status]).toEqual([path, 200]);
    }
  });

  it('closes every site\'s finished day once, on its own, and a rerun changes nothing', async () => {
    await load();
    const schedule = await import('../src/reconciliation/schedule');
    const owner = await selfServe('Daily Wash');
    const now = new Date('2026-10-02T08:00:00Z');
    // The runner walks every organisation in the database, and other test files create and wipe organisations
    // at the same moment, so the run-wide counters are not asserted exactly; what is asserted is this
    // organisation: closed once, and untouched by a second pass.
    const first = await schedule.runDailyCloses(now);
    expect(first.closed).toBeGreaterThanOrEqual(1);
    const closed = await asOwner(owner.orgId, 'SELECT business_day::text AS day, closed_at FROM day_closes');
    expect(closed.rows.map((r) => r.day)).toEqual(['2026-10-01']);

    const again = await schedule.runDailyCloses(now);
    expect(again.alreadyClosed).toBeGreaterThanOrEqual(1);
    const after = await asOwner(owner.orgId, 'SELECT business_day::text AS day, closed_at FROM day_closes');
    expect(after.rows).toEqual(closed.rows);
    // the owner's checklist now sees a reconciliation that nobody had to press a button for
    expect((await request(app).get('/v1/onboarding').set(owner.auth)).body.steps.find((s: { key: string }) => s.key === 'reconcile').done).toBe(true);
  });

  it('resets a forgotten PIN for an operator: a new random one, shown once, hashed, and the old one stops working', async () => {
    await load();
    const owner = await selfServe('Forgetful Wash');
    const reset = await provisioning.resetPin(`0${owner.phone.slice(3)}`);
    expect(reset.pin).toMatch(/^\d{6}$/);
    expect((await request(app).post('/v1/auth/login').send({ phone: owner.phone, pin: '482913' })).status).toBe(401);
    expect((await request(app).post('/v1/auth/login').send({ phone: owner.phone, pin: reset.pin })).status).toBe(200);
    await expect(provisioning.resetPin('0700000000')).rejects.toThrow(/no active account/);
  });

  // ---- billing ------------------------------------------------------------------------------

  it('issues the invoice before the trial ends, once, with no gaps in the numbering however often the runner passes', async () => {
    await load();
    const owner = await selfServe('Invoice Wash');
    const sub = await asOwner(owner.orgId, 'SELECT trial_ends_at FROM subscriptions');
    const trialEnd = new Date(sub.rows[0].trial_ends_at);

    expect((await billing.runBillingCycle(new Date(trialEnd.getTime() - 10 * DAY))).invoicesIssued).toBe(0);
    const near = new Date(trialEnd.getTime() - 2 * DAY);
    await billing.runBillingCycle(near);
    await billing.runBillingCycle(near);
    await billing.runBillingCycle(new Date(near.getTime() + 3_600_000));

    const view = await billing.getBillingView(owner.orgId, near);
    expect(view.invoices).toHaveLength(1);
    expect(view.invoices[0]).toMatchObject({ status: 'open', amountCents: 350_000, siteCount: 1, planCode: 'starter' });
    expect(view.invoices[0]!.number).toMatch(/^FC-\d{4}-\d{6}$/);
    expect(view.pay).toMatchObject({ shortcode: 'MOCKPAYBILL', accountNumber: view.billingRef, amountCents: 350_000 });

    // Re-running the runner consumed no invoice numbers: the sequence equals the number of invoices issued.
    const counts = await pool.withMigrator(async (c) => {
      const invoices = (await c.query('SELECT count(*)::int AS n, max(right(number, 6))::int AS highest FROM invoices')).rows[0];
      const seq = (await c.query('SELECT last_value::int AS last FROM invoice_number_seq')).rows[0];
      return { invoices: invoices.n as number, highest: invoices.highest as number, last: seq.last as number };
    });
    expect(counts.last).toBe(counts.invoices);
    expect(counts.highest).toBe(counts.invoices);
  });

  it('collects through the real confirmation path: paid in mock mode, the invoice settles and the callback is idempotent', async () => {
    await load();
    const owner = await selfServe('Paying Wash');
    const trialEnd = new Date((await asOwner(owner.orgId, 'SELECT trial_ends_at FROM subscriptions')).rows[0].trial_ends_at);
    await billing.runBillingCycle(new Date(trialEnd.getTime() - 2 * DAY));

    const before = (await request(app).get('/v1/billing').set(owner.auth)).body;
    expect(before.outstandingCents).toBe(350_000);

    const paid = await request(app).post('/v1/billing/mock-payment').set(owner.auth).send({});
    expect(paid.status).toBe(201);
    expect(paid.body.billing.outstandingCents).toBe(0);
    expect(paid.body.billing.invoices[0]).toMatchObject({ status: 'paid', paidCents: 350_000 });
    // paid ahead of the trial ending: still a trial now, covered a month past it
    expect(paid.body.billing.status).toBe('trial');
    expect(new Date(paid.body.billing.coveredUntil).getTime()).toBeGreaterThan(trialEnd.getTime() + 27 * DAY);

    // A callback delivered twice is applied once.
    const dup = confirmation({ BillRefNumber: before.billingRef, TransAmount: 3500 });
    await mpesa.ingestConfirmation(dup);
    await mpesa.ingestConfirmation(dup);
    const rows = await asOwner(owner.orgId, 'SELECT count(*)::int AS n, coalesce(sum(amount_cents),0)::bigint AS total FROM billing_payments');
    expect(rows.rows[0].n).toBe(2);
    // the second payment found no open invoice and was banked as credit, not lost
    expect(Number(rows.rows[0].total)).toBe(700_000);
    expect((await billing.getBillingView(owner.orgId)).creditCents).toBe(350_000);
  });

  it('matches a mistyped account number, keeps an unknown one for review, and applies partial payments across two payments', async () => {
    await load();
    const owner = await selfServe('Partial Wash');
    const trialEnd = new Date((await asOwner(owner.orgId, 'SELECT trial_ends_at FROM subscriptions')).rows[0].trial_ends_at);
    await billing.runBillingCycle(new Date(trialEnd.getTime() - 2 * DAY));
    const ref = (await billing.getBillingView(owner.orgId)).billingRef;

    await mpesa.ingestConfirmation(confirmation({ BillRefNumber: ` ${ref.toLowerCase().slice(0, 2)}-${ref.slice(2)} `, TransAmount: 2000 }));
    let view = await billing.getBillingView(owner.orgId);
    expect(view.invoices[0]).toMatchObject({ status: 'open', paidCents: 200_000 });
    expect(view.outstandingCents).toBe(150_000);

    await mpesa.ingestConfirmation(confirmation({ BillRefNumber: ref, TransAmount: 1500 }));
    view = await billing.getBillingView(owner.orgId);
    expect(view.invoices[0]).toMatchObject({ status: 'paid', paidCents: 350_000 });

    const stray = confirmation({ BillRefNumber: 'FC000000', TransAmount: 3500 });
    await mpesa.ingestConfirmation(stray);
    const unmatched = await billing.listUnmatched();
    expect(unmatched.some((row) => row.externalRef === stray.TransID && row.amountCents === 350_000)).toBe(true);
  });

  it('walks past_due then suspended read-only: configuration is blocked, capture and reads are not, and paying reactivates at once', async () => {
    await load();
    const owner = await selfServe('Lapsed Wash');
    // a till, so a real M-Pesa payment for this site can arrive while the account is suspended
    const till = String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
    expect((await request(app).post('/v1/sites').set(owner.auth).send({ name: 'Second Bay', tillNumber: till })).status).toBe(201);

    await asOwner(owner.orgId, `UPDATE subscriptions SET trial_ends_at = now() - interval '5 days'`);
    expect((await request(app).get('/v1/billing').set(owner.auth)).body.status).toBe('past_due');
    expect((await request(app).post('/v1/sites').set(owner.auth).send({ name: 'Third', tillNumber: null })).status).toBe(201);

    await asOwner(owner.orgId, `UPDATE subscriptions SET trial_ends_at = now() - interval '30 days'`);
    const suspended = (await request(app).get('/v1/billing').set(owner.auth)).body;
    expect(suspended).toMatchObject({ status: 'suspended', writesAllowed: false });

    const blocked = await request(app).post('/v1/sites').set(owner.auth).send({ name: 'Nope', tillNumber: null });
    expect(blocked.status).toBe(402);
    expect(blocked.body.code).toBe('subscription-suspended');
    expect((await request(app).post('/v1/services').set(owner.auth).send({ name: 'x', listPriceCents: 100 })).status).toBe(402);
    expect((await request(app).get('/v1/sites').set(owner.auth)).status).toBe(200);
    expect((await request(app).get('/v1/overview').set(owner.auth)).status).toBe(200);
    expect((await request(app).get('/v1/billing').set(owner.auth)).status).toBe(200);

    // No data is lost while behind: a payment on the site's till is still recorded.
    await mpesa.ingestConfirmation(confirmation({ BusinessShortCode: till, BillRefNumber: 'whatever', TransAmount: 500 }));
    const captured = await asOwner(owner.orgId, 'SELECT count(*)::int AS n FROM payments');
    expect(captured.rows[0].n).toBe(1);

    await billing.runBillingCycle();
    const owing = (await request(app).get('/v1/billing').set(owner.auth)).body;
    expect(owing.outstandingCents).toBeGreaterThan(0);
    expect(owing.quote.siteCount).toBe(3);
    expect(owing.quote.planCode).toBe('growth');

    const paid = await request(app).post('/v1/billing/mock-payment').set(owner.auth).send({});
    expect(paid.body.billing.status).toBe('active');
    expect(paid.body.billing.writesAllowed).toBe(true);
    // a late payer buys a full month from the day of payment
    expect(new Date(paid.body.billing.coveredUntil).getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect((await request(app).post('/v1/sites').set(owner.auth).send({ name: 'Back', tillNumber: null })).status).toBe(201);
  });

  it('bills an agreed price for a six-site plan and refuses to let a car wash claim the billing shortcode as its till', async () => {
    await load();
    const owner = await selfServe('Chain Wash');
    for (let i = 0; i < 5; i += 1) {
      expect((await request(app).post('/v1/sites').set(owner.auth).send({ name: `Branch ${i}`, tillNumber: null })).status).toBe(201);
    }
    expect((await billing.getBillingView(owner.orgId)).quote).toMatchObject({ planCode: 'custom', siteCount: 6, amountCents: 1_800_000 });
    await billing.setUnitPriceOverride(owner.orgId, 250_000);
    expect((await billing.getBillingView(owner.orgId)).quote.amountCents).toBe(1_500_000);

    const reserved = await request(app).post('/v1/sites').set(owner.auth).send({ name: 'Sneaky', tillNumber: 'MOCKPAYBILL' });
    expect(reserved.status).toBe(400);
  });

  it('applies leftover credit to the next invoice instead of losing it', async () => {
    await load();
    const owner = await selfServe('Credit Wash');
    const trialEnd = new Date((await asOwner(owner.orgId, 'SELECT trial_ends_at FROM subscriptions')).rows[0].trial_ends_at);
    const ref = (await billing.getBillingView(owner.orgId)).billingRef;

    // paid before any invoice exists: banked
    await mpesa.ingestConfirmation(confirmation({ BillRefNumber: ref, TransAmount: 3500 }));
    expect((await billing.getBillingView(owner.orgId)).creditCents).toBe(350_000);

    await billing.runBillingCycle(new Date(trialEnd.getTime() - 2 * DAY));
    const view = await billing.getBillingView(owner.orgId, new Date(trialEnd.getTime() - 2 * DAY));
    expect(view.invoices[0]).toMatchObject({ status: 'paid', paidCents: 350_000 });
    expect(view.creditCents).toBe(0);
  });

  // ---- isolation ----------------------------------------------------------------------------

  it('keeps one organisation out of the other\'s invoices, payments and subscription, and refuses to rewrite money records', async () => {
    await load();
    const a = await selfServe('Isolated A');
    const b = await selfServe('Isolated B');
    for (const o of [a, b]) {
      const t = new Date((await asOwner(o.orgId, 'SELECT trial_ends_at FROM subscriptions')).rows[0].trial_ends_at);
      await billing.runBillingCycle(new Date(t.getTime() - 2 * DAY));
      await request(app).post('/v1/billing/mock-payment').set(o.auth).send({});
    }

    await pool.withOrg(a.orgId, async (client) => {
      for (const table of ['invoices', 'billing_payments', 'subscriptions', 'day_closes']) {
        const { rows } = await client.query(`SELECT DISTINCT org_id FROM ${table}`);
        expect(rows.every((row) => row.org_id === a.orgId)).toBe(true);
      }
      // writing a row for another organisation violates the policy
      await expect(
        client.query(`INSERT INTO billing_payments (org_id, channel, amount_cents, external_ref, received_at) VALUES ($1, 'manual', 100, $2, now())`, [b.orgId, `X${Math.random()}`])
      ).rejects.toThrow(/row-level security/);
    });

    // payments and invoices are facts: the application role cannot edit or remove them
    await expect(pool.withOrg(a.orgId, (c) => c.query('DELETE FROM invoices'))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(a.orgId, (c) => c.query('UPDATE billing_payments SET amount_cents = 1'))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(a.orgId, (c) => c.query('DELETE FROM subscriptions'))).rejects.toThrow(/permission denied/);

    // with no organisation set, nothing is visible at all
    const none = await pool.withoutTenant((c) => c.query('SELECT count(*)::int AS n FROM invoices'));
    expect(none.rows[0].n).toBe(0);
  });

  it('gives an organisation provisioned the old way a subscription too, so nobody is ever without one', async () => {
    await load();
    const made = await provisioning.provisionOrganisation({ businessName: 'Operator Wash', ownerName: 'Owner', ownerPhone: phone() });
    const view = await billing.getBillingView(made.orgId);
    expect(view.status).toBe('trial');
    // and one missing (pre-billing) subscription is created on first use
    await pool.withMigrator(async (c) => {
      await c.query('BEGIN');
      await c.query("SELECT set_config('forecourt.org_id', $1, true)", [made.orgId]);
      await c.query('DELETE FROM subscriptions WHERE org_id = $1', [made.orgId]);
      await c.query('COMMIT');
    });
    expect((await billing.getBillingView(made.orgId)).status).toBe('trial');
  });

  // ---- onboarding, sample data, summary -----------------------------------------------------

  it('derives the checklist from what exists, so it can never disagree with the account', async () => {
    await load();
    const owner = await selfServe('Checklist Wash');
    let onboarding = (await request(app).get('/v1/onboarding').set(owner.auth)).body;
    expect(onboarding.steps.map((s: { key: string; done: boolean }) => [s.key, s.done])).toEqual([
      ['site', true],
      ['attendants', false],
      ['till', false],
      ['reconcile', false]
    ]);

    const person = await request(app).post('/v1/users').set(owner.auth).send({ displayName: 'Hassan', phone: phone(), role: 'worker', pin: '135790', siteId: null });
    expect(person.status).toBe(201);
    const sites = (await request(app).get('/v1/sites').set(owner.auth)).body;
    await request(app).put(`/v1/sites/${sites[0].id}`).set(owner.auth).send({ tillNumber: String(Math.floor(Math.random() * 9_000_000) + 1_000_000) });
    // a GET of the report only reads; reconciling a day is the POST
    expect((await request(app).get('/v1/report').query({ siteId: sites[0].id, day: '2026-09-30' }).set(owner.auth)).status).toBe(404);
    expect((await request(app).post('/v1/sites/close').set(owner.auth).send({ siteId: sites[0].id, day: '2026-09-30' })).status).toBe(200);

    onboarding = (await request(app).get('/v1/onboarding').set(owner.auth)).body;
    expect(onboarding.completed).toBe(4);
    expect(onboarding.steps.find((s: { key: string }) => s.key === 'till').detail).toContain('Waiting for the first payment');
  });

  it('loads sample data that is flagged, unusable as a login, excluded from billing and from the real checklist, and removable', async () => {
    await load();
    const owner = await selfServe('Sample Wash');
    const other = await selfServe('Bystander Wash');
    const before = (await request(app).get('/v1/onboarding').set(owner.auth)).body;
    expect(before.sample).toEqual({ loaded: false, canLoad: true });

    const loaded = await request(app).post('/v1/sandbox').set(owner.auth).send({});
    expect(loaded.status).toBe(201);
    expect(loaded.body.jobs).toBeGreaterThan(100);
    expect(loaded.body.flags).toBeGreaterThan(0);
    expect((await request(app).post('/v1/sandbox').set(owner.auth).send({})).status).toBe(409);

    // every sample row is marked, named as a sample, and cannot sign in or authenticate
    const facts = await asOwner(
      owner.orgId,
      `SELECT (SELECT count(*)::int FROM sites WHERE is_demo AND name LIKE '%(sample)') AS sample_sites,
              (SELECT count(*)::int FROM sites WHERE NOT is_demo) AS real_sites,
              (SELECT count(*)::int FROM users WHERE is_demo AND status = 'disabled' AND phone LIKE 'sample-%') AS sample_people,
              (SELECT count(*)::int FROM users WHERE is_demo AND status = 'active') AS active_sample_people,
              (SELECT count(*)::int FROM sites WHERE is_demo AND till_number IS NOT NULL) AS sample_tills`
    );
    expect(facts.rows[0]).toMatchObject({ sample_sites: 1, real_sites: 1, active_sample_people: 0, sample_tills: 0 });
    expect(facts.rows[0].sample_people).toBeGreaterThan(3);
    const personPhone = (await asOwner(owner.orgId, `SELECT phone FROM users WHERE is_demo LIMIT 1`)).rows[0].phone;
    expect((await request(app).post('/v1/auth/login').send({ phone: personPhone, pin: '246810' })).status).toBe(401);

    // billed for the one real site only; the sample does not count towards the real checklist
    expect((await request(app).get('/v1/billing').set(owner.auth)).body.quote.siteCount).toBe(1);
    const during = (await request(app).get('/v1/onboarding').set(owner.auth)).body;
    expect(during.sample.loaded).toBe(true);
    expect(during.steps.find((s: { key: string }) => s.key === 'reconcile').done).toBe(false);

    const summary = (await request(app).get('/v1/summary?days=14').set(owner.auth)).body;
    expect(summary.scope).toBe('sample');
    expect(summary.text.split('\n')[0]).toBe('SAMPLE DATA - not your records');
    expect(summary.daysChecked).toBeGreaterThanOrEqual(10);
    expect(summary.gapCents).toBe(summary.expectedCents - summary.receivedCents);
    expect(summary.topFlags.length).toBeGreaterThan(0);

    // the other organisation is untouched
    expect((await request(app).get('/v1/summary?days=14').set(other.auth)).body.scope).toBe('none');
    expect((await request(app).get('/v1/onboarding').set(other.auth)).body.sample.loaded).toBe(false);

    const removed = await request(app).delete('/v1/sandbox').set(owner.auth);
    expect(removed.body).toEqual({ removed: true });
    const after = await asOwner(
      owner.orgId,
      `SELECT (SELECT count(*)::int FROM sites) AS sites, (SELECT count(*)::int FROM jobs) AS jobs, (SELECT count(*)::int FROM payments) AS payments,
              (SELECT count(*)::int FROM day_closes) AS closes, (SELECT count(*)::int FROM users WHERE is_demo) AS people,
              (SELECT count(*)::int FROM services WHERE is_demo) AS services, (SELECT count(*)::int FROM services WHERE NOT is_demo) AS own_services,
              (SELECT count(*)::int FROM users WHERE role = 'owner') AS owners`
    );
    expect(after.rows[0]).toMatchObject({ sites: 1, jobs: 0, payments: 0, closes: 0, people: 0, services: 0, owners: 1 });
    expect(after.rows[0].own_services).toBeGreaterThanOrEqual(3);
    expect((await request(app).delete('/v1/sandbox').set(owner.auth)).body).toEqual({ removed: false });
    expect((await request(app).get('/v1/summary?days=14').set(owner.auth)).body.scope).toBe('none');
  });

  it('refuses sample data once the account holds real records, so the two can never be mixed', async () => {
    await load();
    const owner = await selfServe('Real Wash');
    const site = (await request(app).get('/v1/sites').set(owner.auth)).body[0];
    await mpesa.ingestConfirmation(
      confirmation({ BusinessShortCode: String(Math.floor(Math.random() * 9_000_000) + 1_000_000), TransAmount: 500 })
    );
    await request(app).put(`/v1/sites/${site.id}`).set(owner.auth).send({ tillNumber: '7770001' }).catch(() => undefined);
    await pool.withOrg(owner.orgId, (c) =>
      c.query(`INSERT INTO payments (org_id, site_id, channel, amount_cents, external_ref, received_at) VALUES ($1, $2, 'mpesa', 50000, $3, now())`, [owner.orgId, site.id, `R${Math.random()}`])
    );
    const refused = await request(app).post('/v1/sandbox').set(owner.auth).send({});
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('real records');
    expect((await request(app).get('/v1/onboarding').set(owner.auth)).body.sample.canLoad).toBe(false);
  });

  it('summarises real reconciled days honestly: figures come from the closes, and the sample is never mixed in', async () => {
    await load();
    const owner = await selfServe('Honest Wash');
    const site = (await request(app).get('/v1/sites').set(owner.auth)).body[0];
    expect((await request(app).post('/v1/reconcile/recent').set(owner.auth).send({ days: 3 })).body).toMatchObject({ sites: 1, daysChecked: 3 });
    const summary = (await request(app).get('/v1/summary?days=7').set(owner.auth)).body;
    expect(summary).toMatchObject({ scope: 'real', daysChecked: 3, jobsRecorded: 0, expectedCents: 0, receivedCents: 0, gapCents: 0 });
    expect(summary.text).toContain('Days checked:      3');
    expect(summary.text).not.toContain('SAMPLE');
    expect(site.id).toBeTruthy();
    expect((await request(app).get('/v1/summary?days=0').set(owner.auth)).status).toBe(400);
  });
});

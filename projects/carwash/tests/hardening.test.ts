/**
 * The hardening pass, against a real migrated Postgres as the restricted application role (RLS on):
 * cash variance, read-only reports, site scoping, session revocation, keyset paging, maintenance,
 * the unclaimed-payment tool, job_services isolation, refunds, commissions and CSV export.
 * Skipped unless FORECOURT_INTEGRATION=1.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const on = process.env.FORECOURT_INTEGRATION === '1';
// this file makes a few thousand requests from one address; the global per-minute limit is not what it tests
process.env.API_RATE_LIMIT_PER_MINUTE = '1000000';
vi.setConfig({ testTimeout: 120_000 });

const phone = () => `2547${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
const till = () => String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
const today = () => new Date().toISOString().slice(0, 10);

describe.runIf(on)('hardening (real Postgres, RLS on)', () => {
  let app: import('express').Express;
  let pool: typeof import('../src/persistence/pool');
  let provisioning: typeof import('../src/admin/provisioning');

  async function load() {
    if (app) return;
    pool = await import('../src/persistence/pool');
    provisioning = await import('../src/admin/provisioning');
    app = (await import('../src/api/app')).createApiApp();
  }

  afterAll(async () => {
    if (pool) {
      await pool.closePool();
      await pool.closeMigrationPool();
    }
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function signIn(p: string, pin: string) {
    const res = await request(app).post('/v1/auth/login').send({ phone: p, pin });
    return { res, token: res.body.token as string, auth: bearer(res.body.token) };
  }

  async function tenant(name: string) {
    const made = await provisioning.provisionOrganisation({ businessName: name, ownerName: 'Owner One', ownerPhone: phone() });
    const session = await signIn(made.phone, made.pin);
    const services = (await request(app).get('/v1/services').set(session.auth)).body as Array<{ id: string; name: string }>;
    return { made, auth: session.auth, orgId: made.orgId, siteId: made.siteId, basic: services.find((s) => s.name === 'Basic wash')!, valet: services.find((s) => s.name === 'Full valet')! };
  }

  async function person(owner: { auth: Record<string, string> }, role: string, siteId: string | null, displayName = 'Test Person', pin = '482913') {
    const p = phone();
    const made = await request(app).post('/v1/users').set(owner.auth).send({ displayName, phone: p, pin, role, siteId });
    expect(made.status).toBe(201);
    const session = await signIn(p, pin);
    expect(session.res.status).toBe(200);
    return { id: made.body.id as string, phone: p, pin, token: session.token, auth: session.auth };
  }

  /** Records a job as `actor` and walks it to awaiting_payment. */
  async function openJob(actor: { auth: Record<string, string> }, serviceId: string, siteId?: string, plate?: string) {
    const created = await request(app).post('/v1/jobs').set(actor.auth).send({ serviceIds: [serviceId], siteId, plate });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await request(app).post(`/v1/jobs/${id}/events`).set(actor.auth).send({ type: 'started' });
    await request(app).post(`/v1/jobs/${id}/events`).set(actor.auth).send({ type: 'work_finished' });
    return id;
  }

  async function paidJob(actor: { auth: Record<string, string> }, serviceId: string, siteId?: string, plate?: string) {
    const id = await openJob(actor, serviceId, siteId, plate);
    expect((await request(app).post(`/v1/jobs/${id}/cash`).set(actor.auth).send({})).status).toBe(201);
    return id;
  }

  const sql = (orgId: string, text: string, params: unknown[] = []) => pool.withOrg(orgId, (c) => c.query(text, params));

  // ---------------------------------------------------------------- 1. cash variance

  it('refuses an attendant declaring a different cash amount, lets a supervisor record it with both figures, and the rule flags an unauthorised one', async () => {
    await load();
    const t = await tenant('Cash Wash');
    const worker = await person(t, 'worker', t.siteId, 'Wanjiru Cash');
    const supervisor = await person(t, 'supervisor', t.siteId, 'Sam Supervisor');

    const job = await openJob(worker, t.basic.id);
    const short = await request(app).post(`/v1/jobs/${job}/cash`).set(worker.auth).send({ amountCents: 10_000 });
    expect(short.status).toBe(403);
    expect((await request(app).post(`/v1/jobs/${job}/cash`).set(worker.auth).send({ amountCents: 99_999_999_999 })).status).toBe(400);
    expect((await request(app).get(`/v1/jobs/${job}`).set(t.auth)).body.state).toBe('awaiting_payment');

    // a supervisor must say why
    expect((await request(app).post(`/v1/jobs/${job}/cash`).set(supervisor.auth).send({ amountCents: 30_000 })).status).toBe(400);
    const ok = await request(app).post(`/v1/jobs/${job}/cash`).set(supervisor.auth).send({ amountCents: 30_000, reason: 'customer had a voucher' });
    expect(ok.status).toBe(201);

    const detail = (await request(app).get(`/v1/jobs/${job}`).set(t.auth)).body;
    const matched = detail.events.find((e: any) => e.type === 'job.payment_matched');
    expect(matched.payload).toMatchObject({ channel: 'cash', quotedCents: 50_000, declaredCents: 30_000, varianceCents: -20_000, authorisedBy: supervisor.id, reason: 'customer had a voucher' });

    // the exact quote needs no authorisation and records both figures
    const exact = await paidJob(worker, t.basic.id);
    const exactEvent = (await request(app).get(`/v1/jobs/${exact}`).set(t.auth)).body.events.find((e: any) => e.type === 'job.payment_matched');
    expect(exactEvent.payload).toMatchObject({ quotedCents: 50_000, declaredCents: 50_000 });
    expect(exactEvent.payload.authorisedBy).toBeUndefined();

    // a mismatched payment written some other way is what the rule exists for
    const sneaky = await openJob(worker, t.basic.id);
    await sql(t.orgId, `INSERT INTO payments (org_id, site_id, job_id, channel, amount_cents) VALUES ($1,$2,$3,'cash',20000)`, [t.orgId, t.siteId, sneaky]);
    expect((await request(app).post('/v1/sites/close').set(t.auth).send({ siteId: t.siteId, day: today() })).status).toBe(200);
    const flags = (await request(app).get('/v1/discrepancies?type=cash_amount_mismatch').set(t.auth)).body.items;
    expect(flags).toHaveLength(1);
    const offending = flags[0].evidence.payments.map((p: any) => p.jobId);
    expect(offending).toEqual([sneaky]);
  });

  // ---------------------------------------------------------------- 2. the report is a read

  it('GET /report only reads: it never creates or rewrites a day close, and says so when the day was not closed', async () => {
    await load();
    const t = await tenant('Report Wash');
    const count = async () => Number((await sql(t.orgId, 'SELECT count(*) AS n FROM day_closes')).rows[0].n);

    const before = await request(app).get('/v1/report').query({ siteId: t.siteId, day: today() }).set(t.auth);
    expect(before.status).toBe(404);
    expect(await count()).toBe(0);

    await paidJob(t, t.basic.id, t.siteId);
    expect((await request(app).post('/v1/sites/close').set(t.auth).send({ siteId: t.siteId, day: today() })).status).toBe(200);
    const closedAt = async () => (await sql(t.orgId, 'SELECT closed_at FROM day_closes')).rows[0].closed_at.toISOString();
    const stamp = await closedAt();

    // more work after the close: a GET must not pick it up (that would be a write by another name)
    await paidJob(t, t.basic.id, t.siteId);
    const read = await request(app).get('/v1/report').query({ siteId: t.siteId, day: today() }).set(t.auth);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ jobsRecorded: 1, expectedCents: 50_000, receivedCents: 50_000, gapCents: 0 });
    expect(read.body.summary).toContain('Jobs recorded:     1');
    expect(await closedAt()).toBe(stamp);
    expect(await count()).toBe(1);
  });

  // ---------------------------------------------------------------- 3. site scoping

  it('confines a site-scoped person to their own site on every read and on the close action', async () => {
    await load();
    const t = await tenant('Scope Wash');
    const second = (await request(app).post('/v1/sites').set(t.auth).send({ name: 'Second Site' })).body.id as string;
    const manager = await person(t, 'manager', t.siteId, 'Mary Manager');
    const worker = await person(t, 'worker', t.siteId, 'Wendy Worker');
    const otherWorker = await person(t, 'worker', second, 'Otis Other');

    const here = await paidJob(worker, t.basic.id);
    const there = await paidJob(otherWorker, t.basic.id);
    for (const actor of [manager, worker]) {
      expect((await request(app).get(`/v1/jobs/${there}`).set(actor.auth)).status).toBe(404);
      expect((await request(app).get(`/v1/jobs/${here}`).set(actor.auth)).status).toBe(200);
      const list = (await request(app).get('/v1/jobs').query({ siteId: second }).set(actor.auth)).body.items.map((j: any) => j.id);
      expect(list).toContain(here);
      expect(list).not.toContain(there);
      const sites = (await request(app).get('/v1/sites').set(actor.auth)).body;
      expect(sites.map((s: any) => s.id)).toEqual([t.siteId]);
      expect((await request(app).get(`/v1/sites/${second}`).set(actor.auth)).status).toBe(404);
    }

    expect((await request(app).post('/v1/sites/close').set(manager.auth).send({ siteId: second, day: today() })).status).toBe(403);
    expect((await request(app).get('/v1/report').query({ siteId: second, day: today() }).set(manager.auth)).status).toBe(403);

    // flags, payments, devices, team, overview
    const flag = async (siteId: string, summary: string) =>
      (await sql(t.orgId, `INSERT INTO discrepancies (org_id, site_id, business_day, type, severity, summary) VALUES ($1,$2,'2026-09-01','ghost_wash','high',$3) RETURNING id`, [t.orgId, siteId, summary])).rows[0].id as string;
    const mine = await flag(t.siteId, 'mine');
    const theirs = await flag(second, 'theirs');
    const flags = (await request(app).get('/v1/discrepancies').query({ siteId: second }).set(manager.auth)).body.items.map((f: any) => f.id);
    expect(flags).toContain(mine);
    expect(flags).not.toContain(theirs);
    expect((await request(app).get(`/v1/discrepancies/${theirs}`).set(manager.auth)).status).toBe(404);
    expect((await request(app).post(`/v1/discrepancies/${theirs}/resolve`).set(manager.auth).send({ state: 'dismissed', note: 'not mine to dismiss' })).status).toBe(404);
    expect((await request(app).post(`/v1/discrepancies/${mine}/resolve`).set(manager.auth).send({ state: 'dismissed', note: 'checked' })).status).toBe(200);

    const payments = (await request(app).get('/v1/payments').set(manager.auth)).body.items;
    expect(payments).toHaveLength(1);
    expect(payments[0].site).toBe('Scope Wash');

    await provisioning.registerDevice(t.orgId, { siteId: t.siteId, type: 'flow_meter' });
    await provisioning.registerDevice(t.orgId, { siteId: second, type: 'flow_meter' });
    expect((await request(app).get('/v1/devices').set(manager.auth)).body).toHaveLength(1);
    expect((await request(app).get('/v1/devices').set(t.auth)).body).toHaveLength(2);

    const team = (await request(app).get('/v1/users').set(manager.auth)).body.items.map((u: any) => u.id);
    expect(team).toContain(worker.id);
    expect(team).not.toContain(otherWorker.id);
    expect((await request(app).get(`/v1/users/${otherWorker.id}`).set(manager.auth)).status).toBe(404);

    const mineOnly = (await request(app).get('/v1/overview').set(manager.auth)).body;
    const all = (await request(app).get('/v1/overview').set(t.auth)).body;
    expect(mineOnly).toMatchObject({ sites: 1, jobs: 1, receivedCents: 50_000 });
    expect(all).toMatchObject({ sites: 2, jobs: 2, receivedCents: 100_000 });
  });

  // ---------------------------------------------------------------- 4. sessions

  it('ends a session the moment the account is suspended, re-roled, signed out, or its PIN changes', async () => {
    await load();
    const t = await tenant('Session Wash');

    const suspended = await person(t, 'worker', t.siteId, 'Sue Suspended');
    expect((await request(app).get('/v1/me').set(suspended.auth)).status).toBe(200);
    await request(app).put(`/v1/users/${suspended.id}`).set(t.auth).send({ status: 'suspended' });
    expect((await request(app).get('/v1/me').set(suspended.auth)).status).toBe(401);
    await request(app).put(`/v1/users/${suspended.id}`).set(t.auth).send({ status: 'active' });
    expect((await request(app).get('/v1/me').set(suspended.auth)).status).toBe(401); // reactivated, but that token is gone for good
    expect((await signIn(suspended.phone, suspended.pin)).res.status).toBe(200);

    const promoted = await person(t, 'worker', t.siteId, 'Pat Promoted');
    expect((await request(app).get('/v1/me').set(promoted.auth)).body.role).toBe('worker');
    await request(app).put(`/v1/users/${promoted.id}`).set(t.auth).send({ role: 'manager' });
    expect((await request(app).get('/v1/me').set(promoted.auth)).status).toBe(401);
    expect((await request(app).get('/v1/me').set((await signIn(promoted.phone, promoted.pin)).auth)).body.role).toBe('manager');

    const leaving = await person(t, 'worker', t.siteId, 'Lee Leaving');
    expect((await request(app).post('/v1/auth/logout').set(leaving.auth)).status).toBe(204);
    expect((await request(app).get('/v1/me').set(leaving.auth)).status).toBe(401);

    const changing = await person(t, 'worker', t.siteId, 'Chris Changing');
    expect((await request(app).post('/v1/me/pin').set(changing.auth).send({ currentPin: 'wrong-pin', newPin: '135790' })).status).toBe(401);
    expect((await request(app).post('/v1/me/pin').set(changing.auth).send({ currentPin: changing.pin, newPin: '123' })).status).toBe(400);
    expect((await request(app).post('/v1/me/pin').set(changing.auth).send({ currentPin: changing.pin, newPin: changing.pin })).status).toBe(400);
    const changed = await request(app).post('/v1/me/pin').set(changing.auth).send({ currentPin: changing.pin, newPin: '135790' });
    expect(changed.status).toBe(200);
    expect((await request(app).get('/v1/me').set(changing.auth)).status).toBe(401);
    expect((await request(app).get('/v1/me').set(bearer(changed.body.token))).status).toBe(200);
    expect((await signIn(changing.phone, changing.pin)).res.status).toBe(401);
    expect((await signIn(changing.phone, '135790')).res.status).toBe(200);
  });

  it('lets a manager reset an attendant PIN at their own site, once, and nobody else', async () => {
    await load();
    const t = await tenant('Reset Wash');
    const second = (await request(app).post('/v1/sites').set(t.auth).send({ name: 'Elsewhere' })).body.id as string;
    const manager = await person(t, 'manager', t.siteId, 'Mo Manager');
    const worker = await person(t, 'worker', t.siteId, 'Wale Worker');
    const stranger = await person(t, 'worker', second, 'Sia Stranger');

    expect((await request(app).post(`/v1/users/${worker.id}/reset-pin`).set(worker.auth)).status).toBe(403);
    expect((await request(app).post(`/v1/users/${stranger.id}/reset-pin`).set(manager.auth)).status).toBe(403);
    expect((await request(app).post(`/v1/users/${t.made.ownerId}/reset-pin`).set(manager.auth)).status).toBe(403);

    const reset = await request(app).post(`/v1/users/${worker.id}/reset-pin`).set(manager.auth);
    expect(reset.status).toBe(200);
    expect(reset.body.pin).toMatch(/^\d{6}$/);
    expect((await request(app).get('/v1/me').set(worker.auth)).status).toBe(401);
    expect((await signIn(worker.phone, worker.pin)).res.status).toBe(401);
    expect((await signIn(worker.phone, reset.body.pin)).res.status).toBe(200);

    expect((await request(app).post(`/v1/users/${stranger.id}/reset-pin`).set(t.auth)).status).toBe(200); // an owner may reset anyone
  });

  // ---------------------------------------------------------------- 5. paging and filters

  it('pages jobs, payments, flags, events and people by keyset, without gaps or repeats, and filters them', async () => {
    await load();
    const t = await tenant('Paging Wash');
    const worker = await person(t, 'worker', t.siteId, 'Hassan Pager');
    const plates = ['KAA 001A', 'KAA 002B', 'KBB 003C', 'KBB 004D', 'KCC 005E'];
    const ids: string[] = [];
    for (const plate of plates) ids.push(await paidJob(worker, t.basic.id, undefined, plate));
    const open = await openJob(worker, t.basic.id, undefined, 'KDD 006F');
    await request(app).post(`/v1/jobs/${ids[0]}/events`).set(worker.auth).send({ type: 'closed' });

    const everything = (await request(app).get('/v1/jobs?limit=200').set(t.auth)).body.items.map((j: any) => j.id);
    expect(everything).toHaveLength(6);
    const walked: string[] = [];
    let after: string | undefined;
    let pages = 0;
    do {
      const res = await request(app).get('/v1/jobs').query({ limit: 2, after }).set(t.auth);
      expect(res.status).toBe(200);
      walked.push(...res.body.items.map((j: any) => j.id));
      after = res.body.next ?? undefined;
      pages += 1;
    } while (after);
    expect(pages).toBe(3);
    expect(walked).toEqual(everything);
    expect(new Set(walked).size).toBe(6);

    const state = (await request(app).get('/v1/jobs').query({ state: 'awaiting_payment' }).set(t.auth)).body.items.map((j: any) => j.id);
    expect(state).toEqual([open]);
    expect((await request(app).get('/v1/jobs').query({ plate: 'kaa' }).set(t.auth)).body.items).toHaveLength(2);
    expect((await request(app).get('/v1/jobs').query({ plate: 'KBB 003' }).set(t.auth)).body.items).toHaveLength(1);
    expect((await request(app).get('/v1/jobs').query({ workerId: worker.id }).set(t.auth)).body.items).toHaveLength(6);
    expect((await request(app).get('/v1/jobs').query({ workerId: t.made.ownerId }).set(t.auth)).body.items).toHaveLength(0);
    expect((await request(app).get('/v1/jobs').query({ from: today(), to: today() }).set(t.auth)).body.items).toHaveLength(6);
    expect((await request(app).get('/v1/jobs').query({ to: '2020-01-01' }).set(t.auth)).body.items).toHaveLength(0);
    expect((await request(app).get('/v1/jobs').query({ state: 'nonsense' }).set(t.auth)).status).toBe(400);
    expect((await request(app).get('/v1/jobs').query({ from: 'yesterday' }).set(t.auth)).status).toBe(400);
    expect((await request(app).get('/v1/jobs').query({ after: 'forged' }).set(t.auth)).status).toBe(400);

    const prefix = `PG${Date.now()}x`;
    // payments: 7 rows at the same instant still page cleanly (microsecond cursors)
    await sql(t.orgId, `INSERT INTO payments (org_id, site_id, channel, amount_cents, external_ref, received_at)
                        SELECT $1, $2, 'mpesa', 1000 + n, $3 || n, '2026-09-01T10:00:00.123456Z' FROM generate_series(1, 7) n`, [t.orgId, t.siteId, prefix]);
    const allPayments = (await request(app).get('/v1/payments?limit=200').set(t.auth)).body.items.map((p: any) => p.id);
    expect(allPayments).toHaveLength(12);
    const pagedPayments: string[] = [];
    after = undefined;
    do {
      const res = await request(app).get('/v1/payments').query({ limit: 3, after }).set(t.auth);
      pagedPayments.push(...res.body.items.map((p: any) => p.id));
      after = res.body.next ?? undefined;
    } while (after);
    expect(pagedPayments).toEqual(allPayments);
    expect((await request(app).get('/v1/payments').query({ channel: 'mpesa' }).set(t.auth)).body.items).toHaveLength(7);
    expect((await request(app).get('/v1/payments').query({ matched: 'no' }).set(t.auth)).body.items).toHaveLength(7);
    expect((await request(app).get('/v1/payments').query({ reference: `${prefix}3` }).set(t.auth)).body.items).toHaveLength(1);
    expect((await request(app).get('/v1/payments').query({ from: '2026-09-01', to: '2026-09-01' }).set(t.auth)).body.items).toHaveLength(7);

    // flags keep their severity-then-value order across pages
    const severities = ['low', 'critical', 'medium', 'high', 'critical'];
    for (const [i, severity] of severities.entries()) {
      await sql(t.orgId, `INSERT INTO discrepancies (org_id, site_id, business_day, type, severity, est_value_cents, summary) VALUES ($1,$2,'2026-09-0${i + 1}','ghost_wash',$3,$4,$5)`, [t.orgId, t.siteId, severity, (i + 1) * 1000, `flag ${i}`]);
    }
    const allFlags = (await request(app).get('/v1/discrepancies?limit=200').set(t.auth)).body.items;
    expect(allFlags.map((f: any) => f.severity)).toEqual(['critical', 'critical', 'high', 'medium', 'low']);
    const pagedFlags: string[] = [];
    after = undefined;
    do {
      const res = await request(app).get('/v1/discrepancies').query({ limit: 2, after }).set(t.auth);
      pagedFlags.push(...res.body.items.map((f: any) => f.id));
      after = res.body.next ?? undefined;
    } while (after);
    expect(pagedFlags).toEqual(allFlags.map((f: any) => f.id));
    expect((await request(app).get('/v1/discrepancies').query({ severity: 'critical' }).set(t.auth)).body.items).toHaveLength(2);
    expect((await request(app).get('/v1/discrepancies').query({ from: '2026-09-02', to: '2026-09-03' }).set(t.auth)).body.items).toHaveLength(2);

    // events: the whole organisation's trail, filterable by job and type
    const events = (await request(app).get('/v1/events').query({ jobId: ids[0], limit: 3 }).set(t.auth)).body;
    expect(events.items).toHaveLength(3);
    expect(events.next).not.toBeNull();
    expect((await request(app).get('/v1/events').query({ type: 'job.created', limit: 200 }).set(t.auth)).body.items).toHaveLength(6);
    expect((await request(app).get('/v1/events').set(worker.auth)).status).toBe(403);

    // people
    expect((await request(app).get('/v1/users').query({ q: 'hass' }).set(t.auth)).body.items.map((u: any) => u.id)).toEqual([worker.id]);
    expect((await request(app).get('/v1/users').query({ role: 'owner' }).set(t.auth)).body.items).toHaveLength(1);
    expect((await request(app).get('/v1/users').query({ limit: 1 }).set(t.auth)).body.next).not.toBeNull();

    // services and sites are arrays with the cursor in a header
    const first = await request(app).get('/v1/services').query({ limit: 1 }).set(t.auth);
    expect(first.body).toHaveLength(1);
    const cursor = first.headers['x-next-cursor'];
    expect(cursor).toBeTruthy();
    const second = await request(app).get('/v1/services').query({ limit: 1, after: cursor }).set(t.auth);
    expect(second.body[0].id).not.toBe(first.body[0].id);
  });

  // ---------------------------------------------------------------- 6. maintenance

  it('rolls old per-minute telemetry into hours without losing a litre, deletes expired rows, drops old raw partitions, and is safe to repeat and to race', async () => {
    await load();
    const maintenance = await import('../src/persistence/maintenance');
    const t = await tenant('Maintenance Wash');
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 86_400_000);
    old.setUTCMinutes(0, 0, 0);
    const minute = (offsetMin: number) => new Date(old.getTime() + offsetMin * 60_000);
    const insertMinute = (bucket: Date, metric: string, total: number, bayId: string | null = null) =>
      sql(t.orgId, `INSERT INTO telemetry_minute (org_id, site_id, bay_id, bucket, metric, total, samples) VALUES ($1,$2,$3,$4,$5,$6,2)`, [t.orgId, t.siteId, bayId, bucket, metric, total]);

    await insertMinute(minute(1), 'water_litres', 10);
    await insertMinute(minute(2), 'water_litres', 15);
    await insertMinute(minute(59), 'water_litres', 5);
    await insertMinute(minute(61), 'water_litres', 7); // the next hour
    await insertMinute(minute(1), 'pump_seconds', 30);
    const recent = new Date(now.getTime() - 3_600_000);
    await insertMinute(recent, 'water_litres', 99);

    // an hour row from 1000 days ago is expired; an idempotency key from 10 days ago too
    const ancient = new Date(now.getTime() - 1000 * 86_400_000);
    await sql(t.orgId, `INSERT INTO telemetry_hour (org_id, site_id, bucket, metric, total, samples) VALUES ($1,$2,$3,'water_litres',1,1)`, [t.orgId, t.siteId, ancient]);
    const stale = `stale-${Math.random()}`;
    const fresh = `fresh-${Math.random()}`;
    await pool.withoutTenant((c) => c.query(`INSERT INTO idempotency_keys (key, org_id, route, created_at) VALUES ($1,$3,'x', now() - interval '10 days'), ($2,$3,'x', now())`, [stale, fresh, t.orgId]));

    // a raw partition far in the past, and an audit-log partition that must survive
    await pool.withMigrator((c) => c.query(`SELECT ensure_month_partition('telemetry', '2024-01-01'), ensure_month_partition('job_events', '2024-01-01')`));

    const hours = async () => (await sql(t.orgId, `SELECT bucket, metric, total, samples FROM telemetry_hour WHERE site_id = $1 AND bucket > now() - interval '100 days' ORDER BY bucket, metric`, [t.siteId])).rows;
    const minutes = async () => Number((await sql(t.orgId, `SELECT count(*) AS n FROM telemetry_minute WHERE site_id = $1`, [t.siteId])).rows[0].n);

    const first = await maintenance.runMaintenance(now);
    expect(first.skipped).toBe(false);
    expect(first.minuteRowsRolledUp).toBeGreaterThanOrEqual(5);
    expect(first.hourRowsDeleted).toBeGreaterThanOrEqual(1);
    expect(first.idempotencyKeysDeleted).toBeGreaterThanOrEqual(1);
    expect(first.partitionsDropped).toContain('telemetry_2024_01');

    const rolled = await hours();
    const water = rolled.filter((row) => row.metric === 'water_litres');
    expect(water.map((row) => row.total)).toEqual([30, 7]); // 10+15+5 in the first hour, 7 in the next
    expect(water[0].samples).toBe(6);
    expect(rolled.find((row) => row.metric === 'pump_seconds').total).toBe(30);
    expect(await minutes()).toBe(1); // only the recent minute remains
    expect(Number((await sql(t.orgId, `SELECT count(*) AS n FROM telemetry_hour WHERE bucket = $1`, [ancient])).rows[0].n)).toBe(0);
    const keys = (await pool.withoutTenant((c) => c.query('SELECT key FROM idempotency_keys WHERE key = ANY($1)', [[stale, fresh]]))).rows.map((row) => row.key);
    expect(keys).toEqual([fresh]);
    const exists = (name: string) => pool.withMigrator(async (c) => (await c.query('SELECT to_regclass($1) AS found', [name])).rows[0].found !== null);
    expect(await exists('telemetry_2024_01')).toBe(false);
    expect(await exists('job_events_2024_01')).toBe(true);

    // running it again changes nothing
    await maintenance.runMaintenance(now);
    expect(await hours()).toEqual(rolled);

    // and the console still sees every litre, from the hour table
    const series = (await request(app).get('/v1/telemetry').query({ siteId: t.siteId, days: 90, limit: 200 }).set(t.auth)).body as Array<{ metric: string; total: number }>;
    expect(series.filter((p) => p.metric === 'water_litres').reduce((sum, p) => sum + p.total, 0)).toBe(30 + 7 + 99);

    // a late reading for an hour already rolled up is added to it, not lost
    await insertMinute(minute(30), 'water_litres', 4);
    await maintenance.runMaintenance(now);
    expect((await hours()).filter((row) => row.metric === 'water_litres')[0].total).toBe(34);

    // another replica holding the lock makes this run stand down
    const other = await pool.pool.connect();
    try {
      await other.query('SELECT pg_advisory_lock($1)', [maintenance.MAINTENANCE_LOCK_KEY]);
      expect((await maintenance.runMaintenance(now)).skipped).toBe(true);
      await other.query('SELECT pg_advisory_unlock($1)', [maintenance.MAINTENANCE_LOCK_KEY]);
    } finally {
      other.release();
    }
    expect((await maintenance.runMaintenance(now)).skipped).toBe(false);
  });

  // ---------------------------------------------------------------- 7. unclaimed M-Pesa money

  it('moves a payment from the unclaimed table to the right organisation exactly once', async () => {
    await load();
    const mpesa = await import('../src/mpesa/service');
    const unclaimed = await import('../src/admin/unclaimed');
    const a = await tenant('Unclaimed A');
    const b = await tenant('Unclaimed B');
    const shortCode = till();
    const ref = `UNC${Date.now()}${Math.floor(Math.random() * 1000)}`;

    await mpesa.ingestConfirmation({ TransID: ref, TransTime: '20260930120000', TransAmount: 500, BusinessShortCode: shortCode, BillRefNumber: 'ZZZ', MSISDN: '254700111222' });
    expect((await unclaimed.listUnclaimed()).map((row) => row.externalRef)).toContain(ref);
    // tenants cannot read the table: that is by design
    await expect(pool.withOrg(a.orgId, (c) => c.query('SELECT * FROM mpesa_unclaimed'))).rejects.toThrow(/permission denied/);

    // before the till is registered there is nowhere to put it (organisation A has one site, so it is the default)
    await request(app).put(`/v1/sites/${a.siteId}`).set(a.auth).send({ tillNumber: shortCode });
    const first = await unclaimed.assignUnclaimed(ref, a.orgId);
    expect(first).toMatchObject({ orgId: a.orgId, siteId: a.siteId, alreadyAssigned: false });
    const paid = (await request(app).get('/v1/payments').set(a.auth)).body.items;
    expect(paid).toHaveLength(1);
    expect(paid[0]).toMatchObject({ amountCents: 50_000, reference: ref, channel: 'mpesa' });
    expect((await unclaimed.listUnclaimed()).map((row) => row.externalRef)).not.toContain(ref);

    const again = await unclaimed.assignUnclaimed(ref, a.orgId);
    expect(again).toMatchObject({ paymentId: first.paymentId, alreadyAssigned: true });
    expect((await request(app).get('/v1/payments').set(a.auth)).body.items).toHaveLength(1);

    await expect(unclaimed.assignUnclaimed(ref, b.orgId)).rejects.toThrow(/already assigned/);
    await expect(unclaimed.assignUnclaimed('NO-SUCH-REF', a.orgId)).rejects.toThrow(/no unclaimed payment/);
    expect((await request(app).get('/v1/payments').set(b.auth)).body.items).toHaveLength(0);
  });

  it('refuses to guess the site when the organisation has several and none holds the till', async () => {
    await load();
    const mpesa = await import('../src/mpesa/service');
    const unclaimed = await import('../src/admin/unclaimed');
    const t = await tenant('Unclaimed Two Sites');
    const second = (await request(app).post('/v1/sites').set(t.auth).send({ name: 'Another' })).body.id as string;
    const ref = `UNC2${Date.now()}${Math.floor(Math.random() * 1000)}`;
    await mpesa.ingestConfirmation({ TransID: ref, TransTime: '20260930120000', TransAmount: 250, BusinessShortCode: till(), BillRefNumber: '', MSISDN: '254700111222' });
    await expect(unclaimed.assignUnclaimed(ref, t.orgId)).rejects.toThrow(/site id/);
    const done = await unclaimed.assignUnclaimed(ref, t.orgId, second);
    expect(done.siteId).toBe(second);
  });

  // ---------------------------------------------------------------- 8. device_silent and supply_pilferage from real data

  it('flags a silent meter from the real readings and a supply draw above the configured baseline', async () => {
    await load();
    const t = await tenant('Witness Wash');
    const silent = await provisioning.registerDevice(t.orgId, { siteId: t.siteId, type: 'flow_meter' });
    const heard = await provisioning.registerDevice(t.orgId, { siteId: t.siteId, type: 'pump_monitor' });
    await sql(t.orgId, `UPDATE devices SET created_at = now() - interval '30 days'`);
    await request(app).put(`/v1/services/${t.basic.id}`).set(t.auth).send({ consumables: { detergent: 0.05 } });
    expect((await request(app).get('/v1/services').set(t.auth)).body.find((s: any) => s.id === t.basic.id).consumables).toEqual({ detergent: 0.05 });

    await paidJob(t, t.basic.id, t.siteId);
    await sql(t.orgId, `INSERT INTO telemetry (device_id, org_id, site_id, ts, metric, value, sequence) VALUES ($1,$2,$3,now(),'pump_seconds',60,1)`, [heard.id, t.orgId, t.siteId]);
    await sql(t.orgId, `INSERT INTO inventory_movements (org_id, site_id, item_id, item_name, delta, unit, reason) VALUES ($1,$2,'detergent','Detergent',-2.0,'L','used')`, [t.orgId, t.siteId]);

    expect((await request(app).post('/v1/sites/close').set(t.auth).send({ siteId: t.siteId, day: today() })).status).toBe(200);
    const flags = (await request(app).get('/v1/discrepancies?limit=200').set(t.auth)).body.items;
    const silentFlags = flags.filter((f: any) => f.type === 'device_silent');
    expect(silentFlags).toHaveLength(1);
    expect(silentFlags[0].evidence.deviceId).toBe(silent.id);
    expect(flags.filter((f: any) => f.type === 'supply_pilferage')).toHaveLength(1);
  });

  // ---------------------------------------------------------------- 9. job_services row-level security

  it('keeps one organisation out of another job_services, and refuses a write under the wrong organisation', async () => {
    await load();
    const a = await tenant('Lines A');
    const b = await tenant('Lines B');
    const job = await paidJob(a, a.basic.id, a.siteId);

    const own = await sql(a.orgId, 'SELECT org_id FROM job_services WHERE job_id = $1', [job]);
    expect(own.rows).toHaveLength(1);
    expect(own.rows[0].org_id).toBe(a.orgId);
    expect((await sql(b.orgId, 'SELECT * FROM job_services WHERE job_id = $1', [job])).rows).toHaveLength(0);
    await expect(sql(b.orgId, `INSERT INTO job_services (org_id, job_id, service_id, unit_price_cents) VALUES ($1,$2,$3,1)`, [a.orgId, job, a.valet.id])).rejects.toThrow(/row-level security/);
    await expect(sql(b.orgId, `UPDATE job_services SET qty = 9 WHERE job_id = $1`, [job])).resolves.toMatchObject({ rowCount: 0 });
    const flags = (await pool.withMigrator((c) => c.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'job_services'`))).rows[0];
    expect(flags).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  // ---------------------------------------------------------------- 10. refunds, commissions, exports

  it('voids a paid job: supervisor only, reverses the payment, leaves the trail, and a closed day stops counting the sale', async () => {
    await load();
    const t = await tenant('Void Wash');
    const worker = await person(t, 'worker', t.siteId, 'Vera Void');
    const supervisor = await person(t, 'supervisor', t.siteId, 'Sid Supervisor');
    const job = await paidJob(worker, t.basic.id);
    const unpaid = await openJob(worker, t.basic.id);

    expect((await request(app).post('/v1/sites/close').set(t.auth).send({ siteId: t.siteId, day: today() })).body).toMatchObject({ jobsRecorded: 2, expectedRevenueCents: 100_000, receivedRevenueCents: 50_000 });
    expect((await request(app).get('/v1/report').query({ siteId: t.siteId, day: today() }).set(t.auth)).body).toMatchObject({ receivedCents: 50_000 });

    expect((await request(app).post(`/v1/jobs/${job}/void`).set(worker.auth).send({ reason: 'customer complained' })).status).toBe(403);
    expect((await request(app).post(`/v1/jobs/${job}/void`).set(supervisor.auth).send({})).status).toBe(400);
    expect((await request(app).post(`/v1/jobs/${unpaid}/void`).set(supervisor.auth).send({ reason: 'not paid yet' })).status).toBe(409);

    const done = await request(app).post(`/v1/jobs/${job}/void`).set(supervisor.auth).send({ reason: 'customer complained, refunded in cash' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ state: 'voided', refundedCents: 50_000, payments: 1 });
    expect((await request(app).post(`/v1/jobs/${job}/void`).set(supervisor.auth).send({ reason: 'again please' })).status).toBe(409);

    const detail = (await request(app).get(`/v1/jobs/${job}`).set(t.auth)).body;
    expect(detail.state).toBe('voided');
    expect(detail.payments[0].reversed).toBe(true);
    const event = detail.events.find((e: any) => e.type === 'job.voided');
    expect(event.payload).toMatchObject({ reason: 'customer complained, refunded in cash', refundedCents: 50_000 });
    const reversal = (await sql(t.orgId, 'SELECT actor_id, amount_cents FROM payment_reversals WHERE job_id = $1', [job])).rows;
    expect(reversal).toEqual([{ actor_id: supervisor.id, amount_cents: '50000' }]);
    // the reversal row cannot be rewritten by the application
    await expect(sql(t.orgId, 'DELETE FROM payment_reversals WHERE job_id = $1', [job])).rejects.toThrow(/permission denied/);

    // the already-closed day was recomputed without the sale
    const report = (await request(app).get('/v1/report').query({ siteId: t.siteId, day: today() }).set(t.auth)).body;
    // only the still-unpaid job is left: the refunded sale is neither expected nor received
    expect(report).toMatchObject({ jobsRecorded: 1, expectedCents: 50_000, receivedCents: 0, gapCents: 50_000 });
    const listed = (await request(app).get('/v1/payments').set(t.auth)).body.items;
    expect(listed[0]).toMatchObject({ reversed: true });
    expect((await request(app).get('/v1/jobs').query({ state: 'voided' }).set(t.auth)).body.items).toHaveLength(1);
  });

  it('reports each attendant\'s commission from paid, unvoided work, with a CSV that matches', async () => {
    await load();
    const t = await tenant('Commission Wash');
    const w1 = await person(t, 'worker', t.siteId, 'Alice Earner');
    const w2 = await person(t, 'worker', t.siteId, 'Bob Earner');
    const supervisor = await person(t, 'supervisor', t.siteId, 'Sid Boss');
    await paidJob(w1, t.basic.id);
    await paidJob(w1, t.basic.id);
    await paidJob(w2, t.valet.id);
    await openJob(w2, t.valet.id); // unpaid: earns nothing
    const refunded = await paidJob(w2, t.basic.id);
    await request(app).post(`/v1/jobs/${refunded}/void`).set(supervisor.auth).send({ reason: 'mistaken sale' });

    const report = (await request(app).get('/v1/reports/commissions').set(t.auth)).body;
    expect(report.rows.map((r: any) => [r.worker, r.jobs, r.grossCents, r.commissionCents])).toEqual([
      ['Bob Earner', 1, 120_000, 12_000],
      ['Alice Earner', 2, 100_000, 10_000]
    ]);
    expect(report.totals).toEqual({ jobs: 3, grossCents: 220_000, commissionCents: 22_000 });

    const csv = await request(app).get('/v1/reports/commissions').query({ format: 'csv' }).set(t.auth);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n').filter(Boolean)).toEqual([
      'worker,jobs,sales_kes,commission_kes,sales_cents,commission_cents',
      'Bob Earner,1,1200.00,120.00,120000,12000',
      'Alice Earner,2,1000.00,100.00,100000,10000'
    ]);
    expect((await request(app).get('/v1/reports/commissions').set(w1.auth)).status).toBe(403);
    expect((await request(app).get('/v1/reports/commissions').query({ to: '2020-01-01' }).set(t.auth)).body.rows).toEqual([]);
  });

  it('streams every row of an export across pages, defuses spreadsheet formulas, and answers a bad filter with an error not a broken file', async () => {
    await load();
    const t = await tenant('Export Wash');
    const worker = await person(t, 'worker', t.siteId, '=1+1 Hacker');
    await paidJob(worker, t.basic.id, undefined, 'KXX 777X');
    await sql(t.orgId, `INSERT INTO payments (org_id, site_id, channel, amount_cents, external_ref, received_at)
                        SELECT $1, $2, 'mpesa', 100 + n, $3 || n, now() - n * interval '1 minute' FROM generate_series(1, 1205) n`, [t.orgId, t.siteId, `EXP${Date.now()}x`]);

    const payments = await request(app).get('/v1/export/payments.csv').set(t.auth);
    expect(payments.status).toBe(200);
    expect(payments.headers['content-disposition']).toContain('payments.csv');
    const lines = payments.text.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('id,received_at,site,channel,amount_kes,amount_cents,reference,job_id,matched,reversed');
    expect(lines).toHaveLength(1 + 1206); // 1205 generated + the cash payment, none cut at a page boundary
    expect(new Set(lines.slice(1).map((l) => l.split(',')[0])).size).toBe(1206);

    expect((await request(app).get('/v1/export/payments.csv').query({ channel: 'cash' }).set(t.auth)).text.split('\r\n').filter(Boolean)).toHaveLength(2);
    const jobs = await request(app).get('/v1/export/jobs.csv').set(t.auth);
    expect(jobs.text).toContain(`'=1+1 Hacker`);
    expect(jobs.text).not.toMatch(/,=1\+1/);
    const bad = await request(app).get('/v1/export/jobs.csv').query({ state: 'nonsense' }).set(t.auth);
    expect(bad.status).toBe(400);
    expect(bad.headers['content-type']).toContain('application/json');
    expect((await request(app).get('/v1/export/flags.csv').set(t.auth)).text.split('\r\n')[0]).toContain('business_day');
    expect((await request(app).get('/v1/export/payments.csv').set(worker.auth)).status).toBe(403);
  });

  // ---------------------------------------------------------------- 11. overview

  it('builds the overview from closed days plus the open tail, so work after an early close still shows', async () => {
    await load();
    const t = await tenant('Overview Wash');
    await sql(t.orgId, `INSERT INTO day_closes (org_id, site_id, business_day, cars_detected, jobs_recorded, expected_cents, received_cents, gap_cents, flags, payments_count)
                        VALUES ($1,$2,current_date - 3, 0, 10, 500000, 450000, 50000, 0, 9)`, [t.orgId, t.siteId]);
    await paidJob(t, t.basic.id, t.siteId);
    let overview = (await request(app).get('/v1/overview').set(t.auth)).body;
    expect(overview).toMatchObject({ jobs: 11, payments: 10, expectedCents: 550_000, receivedCents: 500_000, gapCents: 50_000 });

    // closing today early must not hide what happens after it
    await request(app).post('/v1/sites/close').set(t.auth).send({ siteId: t.siteId, day: today() });
    await paidJob(t, t.basic.id, t.siteId);
    overview = (await request(app).get('/v1/overview').set(t.auth)).body;
    expect(overview).toMatchObject({ jobs: 12, payments: 11, expectedCents: 600_000, receivedCents: 550_000 });
  });

  // ---------------------------------------------------------------- 12. readiness

  it('is ready only when every migration this build ships has been applied', async () => {
    await load();
    const readiness = await import('../src/persistence/readiness');
    const ok = await request(app).get('/readyz');
    expect(ok.status).toBe(200);
    expect(ok.body.migration).toMatch(/^\d{4}_.*\.sql$/);

    const dir = await mkdtemp(path.join(os.tmpdir(), 'fc-migrations-'));
    const applied = (await pool.pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name as string);
    for (const name of applied) await writeFile(path.join(dir, name), '-- applied');
    expect(await readiness.checkReadiness(dir)).toMatchObject({ ready: true });
    await writeFile(path.join(dir, '9999_not_applied_yet.sql'), 'SELECT 1;');
    expect(await readiness.checkReadiness(dir)).toMatchObject({ ready: false, reason: 'migrations pending', pending: ['9999_not_applied_yet.sql'] });
  });
});

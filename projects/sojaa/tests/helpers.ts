/** Shared setup for the integration tests: boots the API against the real, migrated Postgres as the restricted app role. */
import request from 'supertest';
import type { Express } from 'express';

export const on = process.env.SOJAA_INTEGRATION === '1';

export interface Booted {
  app: Express;
  pool: typeof import('../src/persistence/pool');
  provisioning: typeof import('../src/admin/provisioning');
}

let booted: Booted | null = null;
export async function boot(): Promise<Booted> {
  if (booted) return booted;
  const pool = await import('../src/persistence/pool');
  const provisioning = await import('../src/admin/provisioning');
  const { createApiApp } = await import('../src/api/app');
  booted = { app: createApiApp(), pool, provisioning };
  return booted;
}

export async function shutdown(): Promise<void> {
  if (booted) {
    await booted.pool.closePool();
    await booted.pool.closeMigrationPool();
    booted = null;
  }
}

let phoneSeq = Math.floor(Math.random() * 40_000_000);
export const nextPhone = () => `2547${String(10_000_000 + (phoneSeq += 1))}`;

export type Auth = { Authorization: string };
export interface Person { id: string; phone: string; pin: string; auth: Auth }
export interface Tenant { orgId: string; branchId: string; owner: Person }

export async function signIn(phone: string, pin: string): Promise<{ status: number; person?: Person; body: any }> {
  const { app } = await boot();
  const res = await request(app).post('/v1/auth/login').send({ phone, pin });
  if (res.status !== 200) return { status: res.status, body: res.body };
  return { status: 200, body: res.body, person: { id: '', phone, pin, auth: { Authorization: `Bearer ${res.body.token}` } } };
}

export async function newTenant(name: string, opts: { sample?: boolean } = {}): Promise<Tenant> {
  const { provisioning } = await boot();
  const made = await provisioning.provisionOrganisation({ businessName: name, ownerName: 'Owner One', ownerPhone: nextPhone(), sample: opts.sample });
  const login = await signIn(made.phone, made.pin);
  if (!login.person) throw new Error(`owner sign-in failed: ${JSON.stringify(login.body)}`);
  return { orgId: made.orgId, branchId: made.branchId, owner: { ...login.person, id: made.ownerId } };
}

export type StaffRole = 'ops_manager' | 'supervisor' | 'payroll' | 'auditor';

export async function addStaff(t: Tenant, role: StaffRole, opts: { branchId?: string | null } = {}): Promise<Person> {
  const { app } = await boot();
  const branchId = opts.branchId === undefined ? t.branchId : opts.branchId;
  const res = await request(app).post('/v1/team').set(t.owner.auth).send({ displayName: `${role} ${nextPhone().slice(-4)}`, phone: nextPhone(), role, ...(branchId ? { branchId } : {}) });
  if (res.status !== 201) throw new Error(`could not add ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  const login = await signIn(res.body.phone, res.body.pin);
  if (!login.person) throw new Error('staff sign-in failed');
  return { ...login.person, id: res.body.id };
}

export async function get(auth: Auth, path: string) {
  const { app } = await boot();
  return request(app).get(path).set(auth);
}
export async function post(auth: Auth, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).post(path).set(auth).send(body as object);
}
export async function put(auth: Auth, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).put(path).set(auth).send(body as object);
}
export async function patch(auth: Auth, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).patch(path).set(auth).send(body as object);
}
export async function del(auth: Auth, path: string) {
  const { app } = await boot();
  return request(app).delete(path).set(auth);
}

let idSeq = 30_000_000 + Math.floor(Math.random() * 5_000_000);
export const nextId = () => String((idSeq += 1));

export async function makeGuard(auth: Auth, over: Record<string, unknown> = {}): Promise<{ id: string; guardNo: string; phone: string | null }> {
  const res = await post(auth, '/v1/guards', { fullName: `Guard ${idSeq}`, nationalId: nextId(), phone: nextPhone(), psraRegNo: 'R1', nssfNo: 'N1', shaNo: 'S1', kraPin: 'A1', hiredOn: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), ...over });
  if (res.status !== 201) throw new Error(`could not make guard: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, guardNo: res.body.guardNo, phone: res.body.phone };
}

export async function setPay(auth: Auth, guardId: string, basicKes: number, allowanceKes = 0) {
  const res = await put(auth, `/v1/guards/${guardId}/pay`, { monthlyBasicCents: basicKes * 100, allowanceCents: allowanceKes * 100 });
  if (res.status !== 200) throw new Error(`could not set pay: ${res.status} ${JSON.stringify(res.body)}`);
}

export interface Place { clientId: string; siteId: string; postId: string }
export async function makePlace(auth: Auth, over: { branchId?: string; lat?: number; lng?: number; geofenceM?: number; rounds?: number; ordered?: boolean; name?: string } = {}): Promise<Place> {
  const c = await post(auth, '/v1/clients', { name: `Client ${nextId()}` });
  if (c.status !== 201) throw new Error(`client: ${c.status} ${JSON.stringify(c.body)}`);
  const s = await post(auth, '/v1/sites', { clientId: c.body.id, name: over.name ?? 'Main gate', lat: over.lat ?? -1.2921, lng: over.lng ?? 36.8219, geofenceM: over.geofenceM ?? 150, roundsPerShift: over.rounds ?? 0, checkpointsOrdered: over.ordered ?? false, ...(over.branchId ? { branchId: over.branchId } : {}) });
  if (s.status !== 201) throw new Error(`site: ${s.status} ${JSON.stringify(s.body)}`);
  const detail = await get(auth, `/v1/sites/${s.body.id}`);
  return { clientId: c.body.id, siteId: s.body.id, postId: detail.body.posts[0].id };
}

/** Local (Nairobi) date and HH:MM for an instant. */
export function localParts(at: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

/** A shift that has just started and runs for `hours`: so a check-in is allowed right now. */
export async function liveShift(auth: Auth, place: Place, guardId: string | null, opts: { startedMinutesAgo?: number; hours?: number } = {}): Promise<{ id: string; startAt: Date; endAt: Date }> {
  const start = new Date(Math.floor((Date.now() - (opts.startedMinutesAgo ?? 5) * 60_000) / 60_000) * 60_000);
  const end = new Date(start.getTime() + (opts.hours ?? 8) * 3_600_000);
  const s = localParts(start);
  const e = localParts(end);
  const res = await post(auth, '/v1/shifts', { siteId: place.siteId, postId: place.postId, guardId, date: s.date, startTime: s.time, endTime: e.time });
  if (res.status !== 201) throw new Error(`could not make live shift: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, startAt: new Date(res.body.startAt), endAt: new Date(res.body.endAt) };
}

/** Writes a shift in the past straight to the database, with the attendance the test wants (tests of money need history that no endpoint will record). */
export async function pastShift(t: Tenant, place: Place, guardId: string, startAt: Date, opts: { hours?: number; inAfterMin?: number | null; outAtEnd?: boolean; overtimeMin?: number; branchId?: string } = {}): Promise<string> {
  const { pool } = await boot();
  const minutes = (opts.hours ?? 12) * 60;
  const end = new Date(startAt.getTime() + minutes * 60_000);
  return pool.withOrg(t.orgId, async (c) => {
    const s = (await c.query(`INSERT INTO shifts (org_id, branch_id, site_id, post_id, guard_id, start_at, end_at, scheduled_minutes, overtime_approved_minutes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [t.orgId, opts.branchId ?? t.branchId, place.siteId, place.postId, guardId, startAt, end, minutes, opts.overtimeMin ?? 0])).rows[0];
    if (opts.inAfterMin !== null) {
      const inAt = new Date(startAt.getTime() + (opts.inAfterMin ?? 0) * 60_000);
      await c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, geofence) VALUES ($1, $2, $3, 'in', $4, $4, 'supervisor', 'within')`, [t.orgId, s.id, guardId, inAt]);
      if (opts.outAtEnd !== false) {
        const outAt = new Date(end.getTime() + (opts.overtimeMin ?? 0) * 60_000);
        await c.query(`INSERT INTO attendance_events (org_id, shift_id, guard_id, kind, at, effective_at, method, geofence) VALUES ($1, $2, $3, 'out', $4, $4, 'supervisor', 'unknown')`, [t.orgId, s.id, guardId, outAt]);
      }
    }
    return s.id as string;
  });
}

/** An instant `daysAgo` days back at the given local hour, in last month if you ask for enough days. */
export function localInstant(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00+03:00`);
}

export function lastMonth(): { month: string; first: string; days: string[] } {
  const now = localParts(new Date()).date;
  const [y, m] = now.split('-').map(Number);
  const d = new Date(Date.UTC(y!, m! - 2, 1));
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return { month, first: `${month}-01`, days: Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`) };
}

export async function confirmAllTables(t: Tenant): Promise<void> {
  for (const kind of ['nssf', 'sha', 'housing', 'paye']) {
    const l = await post(t.owner.auth, `/v1/payroll/tables/${kind}/illustrative`);
    if (l.status !== 200) throw new Error(`illustrative ${kind}: ${l.status} ${JSON.stringify(l.body)}`);
    const c = await post(t.owner.auth, `/v1/payroll/tables/${kind}/confirm`, { note: 'test: illustrative values, not verified' });
    if (c.status !== 200) throw new Error(`confirm ${kind}: ${c.status} ${JSON.stringify(c.body)}`);
  }
}

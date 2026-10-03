/** Shared setup for the integration tests: boots the API against the real, migrated Postgres as the restricted app role. */
import request from 'supertest';
import type { Express } from 'express';

export const on = process.env.DAWA_INTEGRATION === '1';

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

export interface Person {
  id: string;
  phone: string;
  pin: string;
  auth: { Authorization: string };
}

export interface Tenant {
  orgId: string;
  branchId: string;
  owner: Person;
}

export async function signIn(phone: string, pin: string): Promise<{ status: number; person?: Person; body: any }> {
  const { app } = await boot();
  const res = await request(app).post('/v1/auth/login').send({ phone, pin });
  if (res.status !== 200) return { status: res.status, body: res.body };
  return { status: 200, body: res.body, person: { id: '', phone, pin, auth: { Authorization: `Bearer ${res.body.token}` } } };
}

export async function newTenant(name: string): Promise<Tenant> {
  const { provisioning } = await boot();
  const made = await provisioning.provisionOrganisation({ businessName: name, ownerName: 'Owner One', ownerPhone: nextPhone() });
  const login = await signIn(made.phone, made.pin);
  if (!login.person) throw new Error(`owner sign-in failed: ${JSON.stringify(login.body)}`);
  return { orgId: made.orgId, branchId: made.branchId, owner: { ...login.person, id: made.ownerId } };
}

export async function addStaff(t: Tenant, role: 'manager' | 'pharmacist' | 'cashier', name = role): Promise<Person> {
  const { app } = await boot();
  const res = await request(app).post('/v1/team').set(t.owner.auth).send({ displayName: `${name} ${nextPhone().slice(-4)}`, phone: nextPhone(), role, branchId: t.branchId });
  if (res.status !== 201) throw new Error(`could not add ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  const login = await signIn(res.body.phone, res.body.pin);
  if (!login.person) throw new Error('staff sign-in failed');
  return { ...login.person, id: res.body.id };
}

export function dayOffset(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export async function makeProduct(auth: { Authorization: string }, over: Record<string, unknown> = {}): Promise<string> {
  const { app } = await boot();
  const res = await request(app).post('/v1/products').set(auth).send({ name: `Product ${Math.random().toString(36).slice(2, 8)}`, listPriceCents: 5000, category: 'otc', ...over });
  if (res.status !== 201) throw new Error(`could not make product: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

export async function makeSupplier(auth: { Authorization: string }): Promise<string> {
  const { app } = await boot();
  const res = await request(app).post('/v1/suppliers').set(auth).send({ name: `Supplier ${Math.random().toString(36).slice(2, 8)}` });
  if (res.status !== 201) throw new Error(`could not make supplier: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

export interface BatchInput { batchNo: string; expiryDate: string; qty: number; unitCostCents?: number; serials?: string[] }

export async function receive(auth: { Authorization: string }, productId: string, batches: BatchInput[], extra: Record<string, unknown> = {}) {
  const { app } = await boot();
  const supplierId = await makeSupplier(auth);
  const res = await request(app).post('/v1/stock/receive').set(auth).send({
    supplierId, invoiceNumber: `INV-${Math.random().toString(36).slice(2, 9)}`, invoiceDate: dayOffset(0),
    lines: batches.map((b) => ({ productId, batchNo: b.batchNo, expiryDate: b.expiryDate, qty: b.qty, unitCostCents: b.unitCostCents ?? 2000, serials: b.serials })),
    ...extra
  });
  return res;
}

/** Stock that is already expired cannot be received through the API, so tests that need some put it there directly. */
export async function insertExpiredBatch(t: Tenant, productId: string, qty: number, batchNo = 'OLD-1'): Promise<string> {
  const { pool } = await boot();
  return pool.withOrg(t.orgId, async (client) => {
    const row = (await client.query(
      `INSERT INTO stock_batches (org_id, branch_id, product_id, batch_no, expiry_date, qty_on_hand, qty_received, unit_cost_cents) VALUES ($1, $2, $3, $4, current_date - 10, $5, $5, 1000) RETURNING id`,
      [t.orgId, t.branchId, productId, batchNo, qty]
    )).rows[0];
    await client.query(`INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, reason) VALUES ($1, $2, $3, $4, 'receive', $5, 'test')`, [t.orgId, t.branchId, productId, row.id, qty]);
    return row.id as string;
  });
}

export async function onHand(t: Tenant, productId: string): Promise<number> {
  const { pool } = await boot();
  return pool.withOrg(t.orgId, async (client) => Number((await client.query('SELECT COALESCE(sum(qty_on_hand), 0)::int AS n FROM stock_batches WHERE product_id = $1', [productId])).rows[0].n));
}

/** The ledger invariant: every batch holds exactly what its movements add up to. */
export async function assertLedgerAgrees(t: Tenant): Promise<void> {
  const { pool } = await boot();
  const bad = await pool.withOrg(t.orgId, async (client) =>
    (await client.query(
      `SELECT b.id, b.qty_on_hand, COALESCE(sum(m.qty_delta), 0)::int AS moved FROM stock_batches b LEFT JOIN stock_movements m ON m.batch_id = b.id GROUP BY b.id HAVING b.qty_on_hand <> COALESCE(sum(m.qty_delta), 0)`
    )).rows
  );
  if (bad.length > 0) throw new Error(`stock ledger disagrees with batches: ${JSON.stringify(bad)}`);
}

export async function sell(auth: { Authorization: string }, body: Record<string, unknown>) {
  const { app } = await boot();
  return request(app).post('/v1/sales').set(auth).send(body);
}
export async function get(auth: { Authorization: string }, path: string) {
  const { app } = await boot();
  return request(app).get(path).set(auth);
}
export async function post(auth: { Authorization: string }, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).post(path).set(auth).send(body as object);
}
export async function patch(auth: { Authorization: string }, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).patch(path).set(auth).send(body as object);
}
export async function put(auth: { Authorization: string }, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).put(path).set(auth).send(body as object);
}

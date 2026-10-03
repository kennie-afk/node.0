/** Shared setup for the integration tests: boots the API against the real, migrated Postgres as the restricted app role. */
import request from 'supertest';
import type { Express } from 'express';

export const on = process.env.HAZINA_INTEGRATION === '1';

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

export interface Person {
  id: string;
  phone: string;
  pin: string;
  auth: Auth;
}

export interface Tenant {
  orgId: string;
  branchId: string;
  kind: 'sacco' | 'lender';
  owner: Person;
}

export async function signIn(phone: string, pin: string): Promise<{ status: number; person?: Person; body: any }> {
  const { app } = await boot();
  const res = await request(app).post('/v1/auth/login').send({ phone, pin });
  if (res.status !== 200) return { status: res.status, body: res.body };
  return { status: 200, body: res.body, person: { id: '', phone, pin, auth: { Authorization: `Bearer ${res.body.token}` } } };
}

export async function newTenant(name: string, kind: 'sacco' | 'lender' = 'sacco'): Promise<Tenant> {
  const { provisioning } = await boot();
  const made = await provisioning.provisionOrganisation({ businessName: name, ownerName: 'Owner One', ownerPhone: nextPhone(), kind });
  const login = await signIn(made.phone, made.pin);
  if (!login.person) throw new Error(`owner sign-in failed: ${JSON.stringify(login.body)}`);
  return { orgId: made.orgId, branchId: made.branchId, kind, owner: { ...login.person, id: made.ownerId } };
}

export type StaffRole = 'manager' | 'loan_officer' | 'teller' | 'accountant' | 'auditor';

export async function addStaff(t: Tenant, role: StaffRole, name = role): Promise<Person> {
  const { app } = await boot();
  const res = await request(app).post('/v1/team').set(t.owner.auth).send({ displayName: `${name} ${nextPhone().slice(-4)}`, phone: nextPhone(), role, branchId: t.branchId });
  if (res.status !== 201) throw new Error(`could not add ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  const login = await signIn(res.body.phone, res.body.pin);
  if (!login.person) throw new Error('staff sign-in failed');
  return { ...login.person, id: res.body.id };
}

export function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export async function get(auth: Auth, path: string) {
  const { app } = await boot();
  return request(app).get(path).set(auth);
}
export async function post(auth: Auth, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).post(path).set(auth).send(body as object);
}
export async function patch(auth: Auth, path: string, body: unknown = {}) {
  const { app } = await boot();
  return request(app).patch(path).set(auth).send(body as object);
}

let idSeq = 20_000_000 + Math.floor(Math.random() * 5_000_000);

export async function makeMember(auth: Auth, name = 'Test Member'): Promise<{ id: string; memberNo: string }> {
  const res = await post(auth, '/v1/members', { fullName: `${name} ${idSeq}`, idNumber: String((idSeq += 1)), phone: nextPhone() });
  if (res.status !== 201) throw new Error(`could not make member: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.id, memberNo: res.body.memberNo };
}

export async function makeProduct(auth: Auth, over: Record<string, unknown> = {}): Promise<string> {
  const res = await post(auth, '/v1/loan-products', {
    name: `Product ${Math.random().toString(36).slice(2, 7)}`, method: 'reducing', annualRateBp: 1200, maxAmountCents: 100_000_000, maxTermMonths: 36,
    penaltyRateBp: 500, ...over
  });
  if (res.status !== 201) throw new Error(`could not make product: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

export async function deposit(auth: Auth, memberId: string, amountCents: number, product: 'savings' | 'shares' | 'deposits' = 'savings') {
  return post(auth, '/v1/savings/deposit', { memberId, product, amountCents, channel: 'cash' });
}

/** The people a strict organisation needs for one loan: officer applies, a different officer appraises, a manager approves, an accountant pays out. */
export interface Staff {
  teller: Person;
  officer: Person;
  appraiser: Person;
  manager: Person;
  accountant: Person;
}
export async function fullStaff(t: Tenant): Promise<Staff> {
  return {
    teller: await addStaff(t, 'teller'),
    officer: await addStaff(t, 'loan_officer', 'officer'),
    appraiser: await addStaff(t, 'loan_officer', 'appraiser'),
    manager: await addStaff(t, 'manager'),
    accountant: await addStaff(t, 'accountant')
  };
}

export async function lendUntil(s: Staff, memberId: string, productId: string, amountCents: number, termMonths: number, stage: 'applied' | 'appraised' | 'approved' | 'disbursed', disbursedOn?: string): Promise<string> {
  const applied = await post(s.officer.auth, '/v1/loans', { memberId, productId, principalCents: amountCents, termMonths });
  if (applied.status !== 201) throw new Error(`apply failed: ${applied.status} ${JSON.stringify(applied.body)}`);
  const id = applied.body.id as string;
  if (stage === 'applied') return id;
  const appraised = await post(s.appraiser.auth, `/v1/loans/${id}/appraise`, { monthlyIncomeCents: 50_000_00, monthlyExpensesCents: 10_000_00, recommendation: 'approve' });
  if (appraised.status !== 200) throw new Error(`appraise failed: ${appraised.status} ${JSON.stringify(appraised.body)}`);
  if (stage === 'appraised') return id;
  const decided = await post(s.manager.auth, `/v1/loans/${id}/decision`, { approve: true });
  if (decided.status !== 200) throw new Error(`approve failed: ${decided.status} ${JSON.stringify(decided.body)}`);
  if (stage === 'approved') return id;
  const out = await post(s.accountant.auth, `/v1/loans/${id}/disburse`, { channel: 'bank', ...(disbursedOn ? { disbursedOn } : {}) });
  if (out.status !== 200) throw new Error(`disburse failed: ${out.status} ${JSON.stringify(out.body)}`);
  return id;
}

/** A tenant's ledger must always balance, and its member sub-ledger must agree with its schedules. */
export async function assertLedgerBalanced(t: Tenant): Promise<void> {
  const { pool } = await boot();
  const bad = await pool.withOrg(t.orgId, async (client) =>
    (await client.query(
      `SELECT e.id FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id GROUP BY e.id, e.total_cents
        HAVING sum(l.debit_cents) <> sum(l.credit_cents) OR sum(l.debit_cents) <> e.total_cents`
    )).rows
  );
  if (bad.length > 0) throw new Error(`unbalanced journal entries: ${JSON.stringify(bad)}`);
  const gaps = await pool.withOrg(t.orgId, async (client) =>
    (await client.query(`SELECT count(*)::int AS n, max(seq)::int AS top, min(seq)::int AS low FROM journal_entries`)).rows[0]
  );
  if (gaps.n > 0 && (gaps.top - gaps.low + 1 !== gaps.n || gaps.low !== 1)) throw new Error(`journal numbers have a gap: ${JSON.stringify(gaps)}`);
}

/** Loans receivable in the ledger equals the unpaid principal on the schedules of every loan still being repaid. */
export async function assertLoanBookAgrees(t: Tenant): Promise<void> {
  const { pool } = await boot();
  const { ledger, schedules } = await pool.withOrg(t.orgId, async (client) => {
    const ledger = Number((await client.query(
      `SELECT COALESCE(sum(l.debit_cents) - sum(l.credit_cents), 0)::bigint AS n FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE a.code = '1100'`
    )).rows[0].n);
    const schedules = Number((await client.query(
      `SELECT COALESCE(sum(s.principal_cents - s.paid_principal_cents), 0)::bigint AS n FROM loan_schedule s JOIN loans l ON l.id = s.loan_id WHERE l.status = 'disbursed'`
    )).rows[0].n);
    return { ledger, schedules };
  });
  if (ledger !== schedules) throw new Error(`loans receivable ${ledger} disagrees with schedules ${schedules}`);
}

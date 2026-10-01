import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { prepareDatabase, truncateAll } from './harness';
import { day, member, signUp, userWithRole } from './giving-helpers';

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const app = createApp();
type Auth = { Authorization: string };
let admin: Auth;

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  admin = (await signUp(app, 'overview')).admin;
});

const get = (as: Auth) => request(app).get('/overview').set(as);

describe('the dashboard summary', () => {
  it('gives an administrator every section, with real figures', async () => {
    const id = await member(app, admin, 'Wanjiku', 'Kamau');
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    await request(app).post('/giving/contributions').set(admin).send({ date: today, amount: 1500, memberId: id, contributionType: 'Tithe' });
    await request(app).post('/giving/contributions').set(admin).send({ date: today, amount: 500 });
    const res = await get(admin);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.people.members.total).toBe(1);
    expect(res.body.people.members.joinedLast30Days).toBe(1);
    expect(res.body.people.recentMembers[0].name).toBe('Wanjiku Kamau');
    expect(res.body.giving.thisMonth).toBe('2000.00');
    expect(res.body.giving.gifts).toBe(2);
    expect(res.body.giving.recent[0].amount).toBeDefined();
    expect(res.body.finance.cash).toBeDefined();
    expect(Array.isArray(res.body.attention)).toBe(true);
  });

  it('leaves out every section the role has no permission for', async () => {
    const secretary = await userWithRole(app, admin, 'sue', 'SECRETARY');
    const sec = (await get(secretary)).body;
    expect(sec.people).toBeDefined();
    expect(sec.giving).toBeUndefined();
    expect(sec.finance).toBeUndefined();

    const treasurer = await userWithRole(app, admin, 'tim', 'TREASURER');
    const tre = (await get(treasurer)).body;
    expect(tre.giving).toBeDefined();
    expect(tre.finance).toBeDefined();

    const plain = await userWithRole(app, admin, 'mia', 'MEMBER');
    const mem = await get(plain);
    expect(mem.status).toBe(200);
    expect(mem.body.people).toBeUndefined();
    expect(mem.body.giving).toBeUndefined();
    expect(mem.body.finance).toBeUndefined();
    expect(mem.body.attention).toEqual([]);
  });

  it('follows a church-defined role rather than any built-in name', async () => {
    await request(app).post('/roles').set(admin).send({ key: 'GIVING_CLERK', label: 'Giving clerk', permissions: ['giving:read'] });
    const clerk = await userWithRole(app, admin, 'cleo', 'GIVING_CLERK');
    const body = (await get(clerk)).body;
    expect(body.giving).toBeDefined();
    expect(body.people).toBeUndefined();
    expect(body.finance).toBeUndefined();
  });

  it('raises attention items only for what the caller may act on', async () => {
    const vendor = (await request(app).post('/payables/vendors').set(admin).send({ name: 'Kenya Power' })).body.id;
    const accounts = (await request(app).get('/finance/accounts').set(admin)).body as any[];
    const funds = (await request(app).get('/finance/funds').set(admin)).body as any[];
    const bill = await request(app).post('/payables/bills').set(admin).send({ vendorId: vendor, billDate: day(1, 1), dueDate: day(1, 28), lines: [{ accountId: accounts.find((a) => a.code === '5110').id, fundId: funds[0].id, amount: '1000.00' }] });
    expect(bill.status).toBe(201);
    await request(app).post(`/payables/bills/${bill.body.id}/submit`).set(admin);
    const approver = await userWithRole(app, admin, 'ann', 'APPROVER');
    const auditor = await userWithRole(app, admin, 'audrey', 'AUDITOR');
    const forApprover = (await get(approver)).body.attention.map((a: any) => a.key);
    const forAuditor = (await get(auditor)).body.attention.map((a: any) => a.key);
    expect(forApprover).toContain('bills-approval');
    expect(forAuditor).not.toContain('bills-approval');
  });

  it('never shows one church the numbers of another', async () => {
    await request(app).post('/giving/contributions').set(admin).send({ date: new Date().toISOString().slice(0, 10), amount: 9000 });
    const other = (await signUp(app, 'elsewhere')).admin;
    const body = (await get(other)).body;
    expect(body.giving.thisMonth).toBe('0.00');
    expect(body.people.members.total).toBe(0);
  });
});

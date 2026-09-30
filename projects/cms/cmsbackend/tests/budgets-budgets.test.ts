import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { app, Auth, Books, books, d, journal, signUp, userWithRole, YEAR } from './payables-helpers';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let admin: Auth;
let treasurer: Auth;
let approver: Auth;
let auditor: Auth;
let member: Auth;
let b: Books;
let yearId: number;
let youth: number;

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  const s = await signUp('budgets');
  admin = s.admin;
  treasurer = (await userWithRole(admin, 'tess', 'TREASURER')).auth;
  approver = (await userWithRole(admin, 'alan', 'APPROVER')).auth;
  auditor = (await userWithRole(admin, 'audrey', 'AUDITOR')).auth;
  member = (await userWithRole(admin, 'mike', 'MEMBER')).auth;
  b = await books(admin);
  yearId = (await request(app).get('/finance/fiscal-years').set(admin)).body.find((y: any) => y.name === `FY${YEAR}`).id;
  youth = (await request(app).post('/ministries').set(admin).send({ name: 'Youth' })).body.id;
});

const line = (code: string, extra: Record<string, unknown> = {}) => ({ accountId: b.accounts[code], fundId: b.funds.GEN, ...extra });
const create = (name: string, lines: unknown[], as: Auth = treasurer) => request(app).post('/budgets').set(as).send({ fiscalYearId: yearId, name, lines });
const variance = (id: number, query = '') => request(app).get(`/budgets/${id}/variance${query}`).set(auditor);
const spend = (amount: string, date: string, code: string, ministryId?: number) =>
  journal(admin, date, `Spend on ${code}`, [
    { accountId: b.accounts[code], fundId: b.funds.GEN, debit: amount, ...(ministryId ? { ministryId } : {}) },
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, credit: amount }
  ] as any);
const earn = (amount: string, date: string) =>
  journal(admin, date, 'Offerings', [
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, debit: amount },
    { accountId: b.accounts['4020'], fundId: b.funds.GEN, credit: amount }
  ]);

async function standardBudget() {
  const res = await create('Main budget', [
    line('4020', { annual: '1200000.00' }),
    line('5110', { annual: '120000.00' }),
    line('5120', { month: 3, amount: '25000.00' }),
    line('5310', { annual: '12000.00', ministryId: youth })
  ]);
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe('building a budget', () => {
  it('spreads an annual figure over twelve months without losing a cent', async () => {
    const res = await create('Spread', [line('5110', { annual: '10000.01' })]);
    const grid = (await request(app).get(`/budgets/${res.body.id}`).set(auditor)).body;
    const row = grid.lines[0];
    expect(row.months).toHaveLength(12);
    expect(row.annual).toBe('10000.01');
    expect(row.months.reduce((s: number, m: string) => s + Math.round(Number(m) * 100), 0)).toBe(1000001);
    expect(grid.totalExpense).toBe('10000.01');
  });

  it('takes explicit months, merges edits into a draft, and can replace the lot', async () => {
    const months = Array.from({ length: 12 }, (_, i) => `${(i + 1) * 100}.00`);
    const created = await create('Grid', [line('5110', { months })]);
    const merged = await request(app).put(`/budgets/${created.body.id}`).set(treasurer).send({ lines: [line('5110', { month: 1, amount: '999.00' }), line('5120', { annual: '1200.00' })] });
    expect(merged.body.lines).toHaveLength(2);
    expect(merged.body.lines.find((l: any) => l.accountCode === '5110').months[0]).toBe('999.00');
    expect(merged.body.lines.find((l: any) => l.accountCode === '5110').months[11]).toBe('1200.00');
    const replaced = await request(app).put(`/budgets/${created.body.id}`).set(treasurer).send({ mode: 'replace', lines: [line('5110', { annual: '120.00' })] });
    expect(replaced.body.lines).toHaveLength(1);
  });

  it('refuses balance-sheet accounts, bad months, negative money, foreign funds and duplicate names', async () => {
    expect((await create('Bad account', [line('1100', { annual: '10.00' })])).status).toBe(400);
    expect((await create('Bad months', [line('5110', { months: ['1.00', '2.00'] })])).status).toBe(400);
    expect((await create('Negative', [line('5110', { annual: '-5.00' })])).status).toBe(400);
    expect((await create('No amounts', [line('5110')])).status).toBe(400);
    const other = await signUp('otherbud');
    const ob = await books(other.admin);
    expect((await create('Foreign fund', [{ accountId: b.accounts['5110'], fundId: ob.funds.GEN, annual: '5.00' }])).status).toBe(400);
    expect((await create('Dupe', [line('5110', { annual: '1.00' })])).status).toBe(201);
    expect((await create('Dupe', [line('5110', { annual: '1.00' })])).status).toBe(409);
  });
});

describe('the budget lifecycle', () => {
  it('needs a different person to approve, locks after approval, and activating retires the previous one', async () => {
    const adminBudget = (await create('By admin', [line('5110', { annual: '1200.00' })], admin)).body.id;
    const own = await request(app).post(`/budgets/${adminBudget}/approve`).set(admin);
    expect(own.status).toBe(409);
    expect(own.body.message).toMatch(/separation of duties/);
    expect((await request(app).post(`/budgets/${adminBudget}/approve`).set(treasurer)).status).toBe(403);

    const first = await standardBudget();
    const empty = (await create('Empty', [])).body.id;
    expect((await request(app).post(`/budgets/${empty}/approve`).set(approver)).status).toBe(400);
    expect((await request(app).post(`/budgets/${first}/activate`).set(approver)).status).toBe(409);
    expect((await request(app).post(`/budgets/${first}/approve`).set(approver)).body.status).toBe('APPROVED');
    expect((await request(app).put(`/budgets/${first}`).set(treasurer).send({ lines: [line('5110', { annual: '1.00' })] })).status).toBe(409);
    expect((await request(app).delete(`/budgets/${first}`).set(treasurer)).status).toBe(409);
    expect((await request(app).post(`/budgets/${first}/activate`).set(approver)).body.status).toBe('ACTIVE');

    const second = (await create('Revised', [line('5110', { annual: '2400.00' })])).body.id;
    await request(app).post(`/budgets/${second}/approve`).set(approver);
    await request(app).post(`/budgets/${second}/activate`).set(approver);
    const list = (await request(app).get(`/budgets?fiscalYearId=${yearId}`).set(auditor)).body;
    expect(list.find((x: any) => x.id === first).status).toBe('CLOSED');
    expect(list.find((x: any) => x.id === second).status).toBe('ACTIVE');
    expect(list.find((x: any) => x.id === first).totalExpense).toBe('157000.00');
  });

  it('turns SoD off on request, and is gated by permission', async () => {
    await request(app).put('/finance/settings').set(admin).send({ requireSeparationOfDuties: false });
    const id = (await create('Solo', [line('5110', { annual: '100.00' })], admin)).body.id;
    expect((await request(app).post(`/budgets/${id}/approve`).set(admin)).status).toBe(200);
    expect((await request(app).get('/budgets').set(member)).status).toBe(403);
    expect((await create('By auditor', [line('5110', { annual: '1.00' })], auditor)).status).toBe(403);
    expect((await request(app).get('/budgets').set(auditor)).status).toBe(200);
  });

  it('copies a budget into another year with an uplift', async () => {
    const source = await standardBudget();
    const years = (await request(app).get('/finance/fiscal-years').set(admin)).body;
    let next = years.find((y: any) => y.name === `FY${YEAR + 1}`)?.id;
    if (!next) {
      await journal(admin, `${YEAR + 1}-01-15`, 'Seed next year', [
        { accountId: b.accounts['1100'], fundId: b.funds.GEN, debit: '1.00' },
        { accountId: b.accounts['4020'], fundId: b.funds.GEN, credit: '1.00' }
      ]);
      next = (await request(app).get('/finance/fiscal-years').set(admin)).body.find((y: any) => y.name === `FY${YEAR + 1}`).id;
    }
    const copy = await request(app).post(`/budgets/${source}/copy`).set(treasurer).send({ fiscalYearId: next, name: 'Next year', upliftPercent: 10 });
    expect(copy.status).toBe(201);
    expect(copy.body.status).toBe('DRAFT');
    expect(copy.body.totalExpense).toBe('167200.00'.replace('167200.00', (Number('120000.00') * 1.1 + 25000 * 1.1 + 12000 * 1.1).toFixed(2)));
    const row = copy.body.lines.find((l: any) => l.accountCode === '5110');
    expect(row.annual).toBe('132000.00');
    expect(copy.body.lines.find((l: any) => l.accountCode === '5310').ministryId).toBe(youth);
  });
});

describe('budget against actual', () => {
  async function seeded() {
    const id = await standardBudget();
    await earn('90000.00', d(2, 5));
    await spend('35000.00', d(2, 10), '5110');
    await spend('2500.00', d(2, 12), '5310', youth);
    await spend('10000.00', d(3, 4), '5120');
    return id;
  }

  it('compares by account through a chosen month, with remaining budget and percent used', async () => {
    const id = await seeded();
    const v = (await variance(id, '?throughMonth=3')).body;
    const row = (code: string) => v.rows.find((r: any) => r.code === code);
    expect(row('4020').income).toMatchObject({ budget: '300000.00', actual: '90000.00', variance: '-210000.00' });
    expect(row('5110').expense).toMatchObject({ budget: '30000.00', actual: '35000.00', remaining: '-5000.00', variance: '-5000.00', usedPercent: 116.7 });
    expect(row('5120').expense).toMatchObject({ budget: '25000.00', actual: '10000.00', remaining: '15000.00' });
    expect(row('5310').expense).toMatchObject({ budget: '3000.00', actual: '2500.00' });
    expect(v.totals.expense).toMatchObject({ budget: '58000.00', actual: '47500.00' });
    expect(v.totals.net).toMatchObject({ budget: '242000.00', actual: '42500.00' });

    const early = (await variance(id, '?throughMonth=2')).body;
    expect(early.rows.find((r: any) => r.code === '5110').expense).toMatchObject({ budget: '20000.00', actual: '35000.00' });
    expect(early.rows.find((r: any) => r.code === '5120')).toBeUndefined();
    expect(early.totals.expense.actual).toBe('37500.00');
  });

  it('groups by month, fund and ministry', async () => {
    const id = await seeded();
    const months = (await variance(id, '?groupBy=month&throughMonth=3')).body.rows;
    expect(months.map((r: any) => r.key)).toEqual(['01', '02', '03']);
    expect(months[1].income).toMatchObject({ budget: '100000.00', actual: '90000.00' });
    expect(months[1].expense).toMatchObject({ budget: '11000.00', actual: '37500.00' });
    expect(months[2].expense).toMatchObject({ budget: '36000.00', actual: '10000.00' });
    expect(months[0].expense.actual).toBe('0.00');

    const funds = (await variance(id, '?groupBy=fund&throughMonth=3')).body.rows;
    expect(funds).toHaveLength(1);
    expect(funds[0].code).toBe('GEN');
    expect(funds[0].expense.actual).toBe('47500.00');

    const ministries = (await variance(id, '?groupBy=ministry&throughMonth=3')).body.rows;
    expect(ministries).toHaveLength(1);
    expect(ministries[0].label).toBe('Youth');
    expect(ministries[0].expense).toMatchObject({ budget: '3000.00', actual: '2500.00' });

    const filtered = (await variance(id, `?throughMonth=3&accountId=${b.accounts['5110']}`)).body;
    expect(filtered.rows).toHaveLength(1);
  });

  it('shows unbudgeted spending and counts bills awaiting approval as commitments', async () => {
    const id = await seeded();
    await spend('700.00', d(3, 9), '5130');
    const vendor = (await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Plumber' })).body.id;
    const bill = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: vendor, billDate: d(3, 10), dueDate: d(3, 20), lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '4000.00' }] });
    await request(app).post(`/payables/bills/${bill.body.id}/submit`).set(treasurer);
    const v = (await variance(id, '?throughMonth=3')).body;
    const unbudgeted = v.rows.find((r: any) => r.code === '5130');
    expect(unbudgeted.expense).toMatchObject({ budget: '0.00', actual: '700.00' });
    expect(v.rows.find((r: any) => r.code === '5110').expense).toMatchObject({ committed: '4000.00', remaining: '-9000.00' });
    await request(app).post(`/payables/bills/${bill.body.id}/approve`).set(approver);
    const after = (await variance(id, '?throughMonth=3')).body;
    expect(after.rows.find((r: any) => r.code === '5110').expense).toMatchObject({ committed: '0.00', actual: '39000.00' });
    expect(after.totals.approvedUnpaid).toBe('4000.00');
  });
});

describe('the advisory check', () => {
  async function activeBudget() {
    const id = await standardBudget();
    await request(app).post(`/budgets/${id}/approve`).set(approver);
    await request(app).post(`/budgets/${id}/activate`).set(approver);
    return id;
  }
  const check = (code: string, amount: string, date = d(3, 15)) => request(app).get(`/budgets/check?accountId=${b.accounts[code]}&fundId=${b.funds.GEN}&amount=${amount}&date=${date}`).set(treasurer);

  it('answers whether a spend still fits, using actuals and commitments', async () => {
    expect((await check('5110', '1.00')).body.hasBudget).toBe(false);
    await activeBudget();
    await spend('35000.00', d(2, 10), '5110');
    const over = (await check('5110', '1000.00')).body;
    expect(over).toMatchObject({ hasBudget: true, budgeted: 12000000, actual: 3500000, remaining: 8500000, exceeded: false });
    expect((await check('5110', '90000.00')).body.exceeded).toBe(true);
    expect((await check('5110', '90000.00')).body.warning).toMatch(/exceeds the remaining budget of 85000\.00/);
    expect((await check('5130', '1.00')).body.warning).toMatch(/no budget has been set/);
  });

  it('warns on a bill but never blocks it', async () => {
    await activeBudget();
    await request(app).put('/finance/settings').set(admin).send({ dualApprovalThreshold: '1000000.00' });
    const vendor = (await request(app).post('/payables/vendors').set(treasurer).send({ name: 'Builder' })).body.id;
    const bill = await request(app).post('/payables/bills').set(treasurer).send({ vendorId: vendor, billDate: d(3, 10), dueDate: d(3, 20), lines: [{ accountId: b.accounts['5110'], fundId: b.funds.GEN, amount: '150000.00' }] });
    const submitted = await request(app).post(`/payables/bills/${bill.body.id}/submit`).set(treasurer);
    expect(submitted.status).toBe(200);
    expect(submitted.body.warnings).toHaveLength(1);
    expect(submitted.body.warnings[0].message).toMatch(/exceeds the remaining budget/);
    const approved = await request(app).post(`/payables/bills/${bill.body.id}/approve`).set(approver);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('APPROVED');
  });
});

describe('churches are kept apart', () => {
  it('never shows or measures another church budget', async () => {
    const id = await standardBudget();
    const other = await signUp('otherbudgets');
    expect((await request(app).get(`/budgets/${id}`).set(other.admin)).status).toBe(404);
    expect((await request(app).get(`/budgets/${id}/variance`).set(other.admin)).status).toBe(404);
    expect((await request(app).post(`/budgets/${id}/approve`).set(other.admin)).status).toBe(404);
    expect((await request(app).get('/budgets').set(other.admin)).body).toHaveLength(0);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('allows only one active budget per year, enforced by the database', async () => {
    const one = await standardBudget();
    const two = (await create('Second', [line('5110', { annual: '1.00' })])).body.id;
    const pg = (await import('pg')).default;
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    await owner.query(`UPDATE budgets SET status = 'ACTIVE' WHERE id = $1`, [one]);
    await expect(owner.query(`UPDATE budgets SET status = 'ACTIVE' WHERE id = $1`, [two])).rejects.toThrow(/budgets_one_active/);
    await owner.end();
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';
import { select } from '../src/modules/finance/sql';

// Each test signs up churches and users (bcrypt at 12 rounds); allow for a busy machine.
vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const app = createApp();
let admin: { Authorization: string };
let approver: { Authorization: string };
let treasurer: { Authorization: string };

async function signUp(slug: string) {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { Authorization: `Bearer ${login.body.token}` };
}
async function userWithRole(as: { Authorization: string }, name: string, role: string) {
  await request(app).post('/users').set(as).send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}`, role });
  const login = await request(app).post('/auth/login').send({ email: `${name}@example.org`, password: `passphrase-${name}` });
  return { Authorization: `Bearer ${login.body.token}` };
}

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  admin = await signUp('payroll');
  approver = await userWithRole(admin, 'ann', 'APPROVER');
  treasurer = await userWithRole(admin, 'tim', 'TREASURER');
});

const employee = (over: Record<string, unknown> = {}) => ({
  fullName: 'Grace Wanjiru', kraPin: 'A123456789Z', basicSalary: '50000.00', startDate: '2025-01-01', bankName: 'KCB', bankAccount: '1234567890', ...over
});
const hire = async (over: Record<string, unknown> = {}) => (await request(app).post('/payroll/employees').set(treasurer).send(employee(over))).body;
const trial = async () => (await request(app).get('/finance/trial-balance?asOf=2026-12-31').set(admin)).body;
const lineOf = (tb: any, code: string) => tb.lines.find((l: any) => l.code === code);

async function approvedRun(month = 3) {
  const run = (await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month })).body;
  await request(app).post(`/payroll/runs/${run.id}/calculate`).set(treasurer);
  const ok = await request(app).post(`/payroll/runs/${run.id}/approve`).set(approver);
  expect(ok.status).toBe(200);
  return run.id as number;
}

describe('employees', () => {
  it('validates, stores and pages staff, and refuses a duplicate KRA PIN', async () => {
    const made = await request(app).post('/payroll/employees').set(treasurer).send(employee({ allowances: [{ name: 'Housing', amount: '10000', taxable: true }], deductions: [{ name: 'Sacco', amount: '1500.50' }] }));
    expect(made.status).toBe(201);
    expect(made.body.basicSalary).toBe('50000.00');
    expect(made.body.allowances[0].amount).toBe('10000.00');
    expect(made.body.deductions[0].amount).toBe('1500.50');
    expect((await request(app).post('/payroll/employees').set(treasurer).send(employee())).status).toBe(409);
    expect((await request(app).post('/payroll/employees').set(treasurer).send(employee({ kraPin: 'bad' }))).status).toBe(400);
    expect((await request(app).post('/payroll/employees').set(treasurer).send(employee({ fundId: 99999, kraPin: 'A987654321Z' }))).status).toBe(400);
    const list = await request(app).get('/payroll/employees?limit=1').set(approver);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);
    const upd = await request(app).put(`/payroll/employees/${made.body.id}`).set(treasurer).send({ basicSalary: '60000' });
    expect(upd.body.basicSalary).toBe('60000.00');
    const audit = await request(app).get('/finance/audit?action=employee.salary_change').set(admin);
    expect(audit.body.data[0].data).toEqual({ from: '50000.00', to: '60000.00' });
  });

  it('is invisible to members and to other churches', async () => {
    await hire();
    const member = await userWithRole(admin, 'mike', 'MEMBER');
    expect((await request(app).get('/payroll/employees').set(member)).status).toBe(403);
    const other = await signUp('elsewhere');
    expect((await request(app).get('/payroll/employees').set(other)).body.data).toHaveLength(0);
    expect((await request(app).get('/payroll/rates')).status).toBe(401);
  });
});

describe('a payroll month, end to end', () => {
  it('calculates, refuses self-approval, posts to the ledger, pays and remits', async () => {
    await hire();
    await hire({ fullName: 'Peter Otieno', kraPin: 'A222222222B', basicSalary: '20000', allowances: [{ name: 'Transport', amount: '3000', taxable: false }] });
    const run = (await request(app).post('/payroll/runs').set(admin).send({ year: 2026, month: 3 })).body;
    expect((await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month: 3 })).status).toBe(409);

    const calc = await request(app).post(`/payroll/runs/${run.id}/calculate`).set(admin);
    expect(calc.body.status).toBe('CALCULATED');
    expect(calc.body.rateVersion).toBe('2026-02-01');
    expect((await request(app).post(`/payroll/runs/${run.id}/calculate`).set(admin)).status).toBe(409); // only while DRAFT

    const slip = (await request(app).get(`/payroll/runs/${run.id}/payslips/${(await request(app).get('/payroll/employees').set(admin)).body.data.find((e: any) => e.kraPin === 'A123456789Z').id}`).set(approver)).body;
    expect(slip.gross).toBe('50000.00');
    expect(slip.taxComputation.paye).toBe('5845.85'); // hand-worked in payroll-statutory.test.ts
    expect(slip.net).toBe('39029.15');
    expect(slip.yearToDate.gross).toBe('50000.00');

    expect((await request(app).post(`/payroll/runs/${run.id}/approve`).set(treasurer)).status).toBe(403); // no payroll:approve
    const selfApprove = await request(app).post(`/payroll/runs/${run.id}/approve`).set(admin);
    expect(selfApprove.status).toBe(403);
    expect(selfApprove.body.message).toMatch(/separation of duties/);
    expect((await request(app).post(`/payroll/runs/${run.id}/post`).set(treasurer)).status).toBe(409); // not approved yet

    expect((await request(app).post(`/payroll/runs/${run.id}/approve`).set(approver)).body.status).toBe('APPROVED');
    const posted = await request(app).post(`/payroll/runs/${run.id}/post`).set(treasurer);
    expect(posted.body.status).toBe('POSTED');

    const detail = (await request(app).get(`/payroll/runs/${run.id}`).set(admin)).body;
    const totals = detail.totals;
    let tb = await trial();
    expect(tb.balanced).toBe(true);
    const cents = (v: string) => Math.round(Number(v) * 100);
    expect(cents(lineOf(tb, '2100').credit)).toBe(cents(totals.paye));
    expect(cents(lineOf(tb, '2110').credit)).toBe(cents(totals.nssfEmployee) + cents(totals.nssfEmployer));
    expect(cents(lineOf(tb, '2120').credit)).toBe(cents(totals.shif));
    expect(cents(lineOf(tb, '2130').credit)).toBe(cents(totals.housingLevyEmployee) + cents(totals.housingLevyEmployer));
    expect(cents(lineOf(tb, '2140').credit)).toBe(cents(totals.net));
    expect(cents(lineOf(tb, '5010').debit)).toBe(cents('70000.00'));
    expect(cents(lineOf(tb, '5040').debit)).toBe(cents('3000.00'));
    expect(cents(lineOf(tb, '5020').debit)).toBe(cents(totals.nssfEmployer));

    const pay = await request(app).post(`/payroll/runs/${run.id}/pay`).set(treasurer).send({ date: '2026-03-28', reference: 'BATCH-1' });
    expect(pay.body.status).toBe('PAID');
    tb = await trial();
    expect(lineOf(tb, '2140')).toBeUndefined();
    expect(cents(lineOf(tb, '1100').credit)).toBe(cents(totals.net));

    for (const kind of ['PAYE', 'NSSF', 'SHIF', 'HOUSING_LEVY']) {
      const r = await request(app).post(`/payroll/runs/${run.id}/remit`).set(treasurer).send({ kind, date: '2026-04-09', reference: `R-${kind}` });
      expect(r.status).toBe(201);
    }
    expect((await request(app).post(`/payroll/runs/${run.id}/remit`).set(treasurer).send({ kind: 'PAYE', date: '2026-04-09' })).status).toBe(409);
    tb = await trial();
    for (const code of ['2100', '2110', '2120', '2130', '2140']) expect(lineOf(tb, code)).toBeUndefined();

    const ret = (await request(app).get(`/payroll/runs/${run.id}/statutory`).set(admin)).body;
    expect(ret.totals.map((t: any) => [t.kind, t.dueDate, t.remitted])).toEqual([['PAYE', '2026-04-09', true], ['NSSF', '2026-04-09', true], ['SHIF', '2026-04-09', true], ['HOUSING_LEVY', '2026-04-09', true]]);
    expect((await request(app).post(`/payroll/runs/${run.id}/void`).set(approver).send({ reason: 'oops, too late' })).status).toBe(409);

    const integrity = await request(app).get('/finance/integrity').set(admin);
    expect(integrity.body.ok).toBe(true);
    const summary = (await request(app).get('/payroll/statutory/summary?year=2026').set(admin)).body;
    expect(summary.months).toHaveLength(1);
    expect(summary.totals.gross).toBe('73000.00');
  });

  it('exports the register, the payment file and the statutory return as CSV', async () => {
    await hire({ fullName: '=cmd|evil' });
    await hire({ fullName: 'Mary "MM" Achieng, Sr', kraPin: 'A333333333C', bankAccount: null, bankName: null, mpesaPhone: '0712345678' });
    const id = await approvedRun();
    const register = await request(app).get(`/payroll/runs/${id}/register.csv`).set(admin);
    expect(register.headers['content-type']).toMatch(/text\/csv/);
    expect(register.text.split('\r\n')[0]).toBe('Employee,KRA PIN,Basic,Allowances,Gross,NSSF,SHIF,Housing levy,Taxable pay,PAYE,Other deductions,Advance recovery,Net pay');
    expect(register.text).toContain("'=cmd|evil"); // formula injection neutralised
    expect(register.text).toContain('"Mary ""MM"" Achieng, Sr"');
    const file = await request(app).get(`/payroll/runs/${id}/payment-file.csv`).set(treasurer);
    expect(file.text).toContain('MPESA,0712345678,39029.15,SALARY 2026-03');
    expect(file.text).toContain('BANK,KCB 1234567890');
    expect((await request(app).get(`/payroll/runs/${id}/payment-file.csv`).set(approver)).status).toBe(403);
    expect((await request(app).get(`/payroll/runs/${id}/statutory.csv`).set(admin)).text).toContain('PAYE');
  });

  it('allocates cost by fund and ministry and keeps each fund balanced', async () => {
    const funds = (await request(app).get('/finance/funds').set(admin)).body;
    const general = funds.find((f: any) => f.code === 'GEN').id;
    const building = funds.find((f: any) => f.code === 'BLD').id;
    await request(app).post('/finance/journal').set(admin).send({ date: '2026-03-01', memo: 'Seed building fund', lines: [{ accountId: (await request(app).get('/finance/accounts').set(admin)).body.find((a: any) => a.code === '1100').id, fundId: building, debit: '500000' }, { accountId: (await request(app).get('/finance/accounts').set(admin)).body.find((a: any) => a.code === '4040').id, fundId: building, credit: '500000' }] });
    await hire({ fundId: general });
    await hire({ fullName: 'Site Clerk', kraPin: 'A444444444D', fundId: building, basicSalary: '30000' });
    const id = await approvedRun();
    expect((await request(app).post(`/payroll/runs/${id}/post`).set(treasurer)).status).toBe(200);
    const byFund = (await request(app).get(`/finance/trial-balance?asOf=2026-12-31&fundId=${building}`).set(admin)).body;
    expect(byFund.balanced).toBe(true);
    expect(lineOf(byFund, '5010').debit).toBe('30000.00');
    const funds2 = (await request(app).get('/finance/funds').set(admin)).body;
    expect(funds2.find((f: any) => f.code === 'BLD').position).toMatch(/^4[0-9]{5}\./); // ~ 500,000 less the clerk's cost
  });
});

describe('recalculation, reopening and voiding', () => {
  it('reopens a calculated run, picks up a pay change, and voids freeing the month', async () => {
    const e = await hire();
    const run = (await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month: 5 })).body;
    await request(app).post(`/payroll/runs/${run.id}/calculate`).set(treasurer);
    await request(app).put(`/payroll/employees/${e.id}`).set(treasurer).send({ basicSalary: '80000' });
    expect((await request(app).post(`/payroll/runs/${run.id}/reopen`).set(treasurer)).body.status).toBe('DRAFT');
    const again = await request(app).post(`/payroll/runs/${run.id}/calculate`).set(treasurer);
    expect(again.body.totals.gross).toBe('80000.00');
    expect((await request(app).post(`/payroll/runs/${run.id}/void`).set(approver).send({ reason: 'wrong month' })).body.status).toBe('VOID');
    expect((await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month: 5 })).status).toBe(201);
  });

  it('voiding a posted and paid run reverses the books and restores advances', async () => {
    const e = await hire();
    const adv = await request(app).post('/payroll/advances').set(treasurer).send({ employeeId: e.id, amount: '10000', monthlyRecovery: '4000', date: '2026-02-20' });
    expect(adv.status).toBe(201);
    const before = await trial();
    const id = await approvedRun();
    const detail = (await request(app).get(`/payroll/runs/${id}`).set(admin)).body;
    expect(detail.payslips[0].advanceRecovery).toBe('4000.00');
    await request(app).post(`/payroll/runs/${id}/post`).set(treasurer);
    await request(app).post(`/payroll/runs/${id}/pay`).set(treasurer).send({ date: '2026-03-30' });
    const advances = (await request(app).get('/payroll/advances').set(admin)).body;
    expect(advances[0].outstanding).toBe('6000.00');
    const voided = await request(app).post(`/payroll/runs/${id}/void`).set(approver).send({ reason: 'wrong salary', date: '2026-03-31' });
    expect(voided.body.status).toBe('VOID');
    expect((await request(app).get('/payroll/advances').set(admin)).body[0].outstanding).toBe('10000.00');
    const after = await trial();
    expect(after.lines.map((l: any) => [l.code, l.debit, l.credit])).toEqual(before.lines.map((l: any) => [l.code, l.debit, l.credit]));
    expect((await request(app).get('/finance/integrity').set(admin)).body.ok).toBe(true);
  });

  it('refuses months before recorded rates and runs with nobody to pay', async () => {
    expect((await request(app).post('/payroll/runs').set(treasurer).send({ year: 2025, month: 1 })).status).toBeGreaterThanOrEqual(400);
    const run = (await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month: 6 })).body;
    expect((await request(app).post(`/payroll/runs/${run.id}/calculate`).set(treasurer)).status).toBe(400);
  });

  it('refuses a deduction that would make pay negative', async () => {
    await hire({ basicSalary: '20000', deductions: [{ name: 'Loan', amount: '30000' }] });
    const run = (await request(app).post('/payroll/runs').set(treasurer).send({ year: 2026, month: 7 })).body;
    const res = await request(app).post(`/payroll/runs/${run.id}/calculate`).set(treasurer);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/deductions exceed pay/);
  });
});

describe('rates', () => {
  it('publishes the rate sets with their sources and honesty note', async () => {
    const res = await request(app).get('/payroll/rates').set(approver);
    expect(res.status).toBe(200);
    expect(res.body.current.version).toBe('2026-02-01');
    expect(res.body.current.nssf.upperLimit).toBe('108000.00');
    expect(res.body.current.sources.some((s: any) => s.verified === 'official')).toBe(true);
    expect(res.body.note).toMatch(/provisional/);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('hides salaries from another church even for a hand-written query', async () => {
    await hire();
    const other = await signUp('rival');
    const rivalId = (await request(app).get('/auth/profile').set(other)).body.churchId;
    const seen = await runAsTenant(rivalId, async () => select<any>(await requestTx(), 'SELECT * FROM employees'));
    expect(seen).toHaveLength(0);
    const visible = await runAsTenant(rivalId, async () => select<any>(await requestTx(), 'SELECT * FROM payslips'));
    expect(visible).toHaveLength(0);
  });
});

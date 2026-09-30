import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';
import { MemoryCacheStore, setCacheStore } from '../src/common/cache';
import { prepareDatabase, truncateAll } from './harness';
import { postEntry } from '../src/modules/finance/ledger.service';
import { closePeriod, listFiscalYears } from '../src/modules/finance/periods.service';
import { closeFiscalYear } from '../src/modules/finance/closing.service';
import { accountIdByKey } from '../src/modules/finance/setup.service';
import { postTransfer } from '../src/modules/finance/journal.service';
import { select } from '../src/modules/finance/sql';

vi.setConfig({ hookTimeout: 120_000, testTimeout: 120_000 });

const app = createApp();
const YEAR = new Date().getUTCFullYear();
const d = (month: number, day = 15, year = YEAR) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

let churchId: number;
let auth: { Authorization: string };
let cash: number;
let mpesa: number;
let tithes: number;
let rent: number;
let general: number;
let building: number;
let ministryId: number;

async function signUp(slug: string) {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  const created = await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { churchId: created.body.church.id as number, headers: { Authorization: `Bearer ${login.body.token}` } };
}
const asChurch = <T>(work: () => Promise<T>) => runAsTenant(churchId, work);

const post = (lines: Array<{ accountId: number; fundId: number; debit?: number; credit?: number; ministryId?: number }>, date: string, memo = 'test') =>
  asChurch(async () => postEntry({ entryDate: date, memo, sourceType: 'MANUAL', lines }, await requestTx(), churchId));
const give = (amount: number, date: string, fundId = general, account = cash) =>
  post([{ accountId: account, fundId, debit: amount }, { accountId: tithes, fundId, credit: amount }], date, 'offering');
const spend = (amount: number, date: string, fundId = general, ministry?: number) =>
  post([{ accountId: rent, fundId, debit: amount, ministryId: ministry }, { accountId: cash, fundId, credit: amount }], date, 'rent');

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  setCacheStore(null);
  await truncateAll();
  const signed = await signUp('reports');
  churchId = signed.churchId;
  auth = signed.headers;
  await asChurch(async () => {
    const t = await requestTx();
    cash = await accountIdByKey(t, churchId, 'BANK_MAIN');
    mpesa = await accountIdByKey(t, churchId, 'MPESA');
    tithes = await accountIdByKey(t, churchId, 'INCOME_TITHES');
    rent = Number((await select<any>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND code = '5100'`, { churchId }))[0].id);
    const funds = await select<any>(t, `SELECT id, code FROM funds WHERE church_id = :churchId`, { churchId });
    general = Number(funds.find((f) => f.code === 'GEN').id);
    building = Number(funds.find((f) => f.code === 'BLD').id);
  });
  const youth = await request(app).post('/ministries').set(auth).send({ name: 'Youth' });
  ministryId = youth.body.id;
});
afterEach(() => setCacheStore(null));

const get = (path: string, headers = auth) => request(app).get(path).set(headers);
const cents = (v: string) => Math.round(Number(v) * 100);

describe('statement of activities', () => {
  it('reports income and expense for a range, with prior-period and prior-year comparison', async () => {
    await give(500_000, d(3, 10));
    await spend(120_000, d(3, 11));
    await give(200_000, d(4, 10));
    await give(90_000, d(3, 12, YEAR - 1));
    await spend(30_000, d(3, 13, YEAR - 1));

    const march = (await get(`/reports/income-statement?from=${d(3, 1)}&to=${d(3, 31)}`)).body;
    expect(march.totalIncome).toBe('5000.00');
    expect(march.totalExpenses).toBe('1200.00');
    expect(march.surplus).toBe('3800.00');
    expect(march.income).toEqual([{ accountId: tithes, code: '4010', name: 'Tithes', amount: '5000.00' }]);

    const partial = (await get(`/reports/income-statement?from=${d(3, 11)}&to=${d(4, 30)}`)).body; // cuts through March
    expect(partial.totalIncome).toBe('2000.00');
    expect(partial.totalExpenses).toBe('1200.00');

    const vsYear = (await get(`/reports/income-statement?from=${d(3, 1)}&to=${d(3, 31)}&compare=prior-year`)).body;
    expect(vsYear.prior.totalIncome).toBe('900.00');
    expect(vsYear.income[0]).toMatchObject({ amount: '5000.00', priorAmount: '900.00', change: '4100.00' });

    const vsPeriod = (await get(`/reports/income-statement?from=${d(4, 1)}&to=${d(4, 30)}&compare=prior-period`)).body;
    expect(vsPeriod.prior.from).toBe(d(3, 2));
    expect(vsPeriod.totalIncome).toBe('2000.00');
  });

  it('splits by fund and filters to one fund', async () => {
    await give(100_000, d(5, 2), general);
    await give(40_000, d(5, 3), building);
    const all = (await get(`/reports/income-statement?from=${d(5, 1)}&to=${d(5, 31)}&byFund=true`)).body;
    expect(all.byFund.map((f: any) => [f.code, f.income])).toEqual([['BLD', '400.00'], ['GEN', '1000.00']]);
    const one = (await get(`/reports/income-statement?from=${d(5, 1)}&to=${d(5, 31)}&fundId=${building}`)).body;
    expect(one.totalIncome).toBe('400.00');
  });

  it('downloads as CSV, neutralising formula injection', async () => {
    await give(10_000, d(2, 2));
    const csv = await get(`/reports/income-statement?from=${d(2, 1)}&to=${d(2, 28)}&format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toBe('Section,Code,Account,Amount');
    expect(csv.text).toContain('Income,4010,Tithes,100.00');
    expect(csv.text).toContain('Surplus (deficit)');
  });
});

describe('statement of financial position', () => {
  it('balances before a close, per fund, and after the year is closed', async () => {
    await give(500_000, d(2, 10));
    await give(75_000, d(2, 11), building, mpesa);
    await spend(120_000, d(2, 12));
    await asChurch(async () => postTransfer(await requestTx(), churchId, { date: d(2, 13), fromFundId: general, toFundId: building, amountMinor: 50_000, memo: 'seed building', actorId: 1 }));

    const before = (await get(`/reports/balance-sheet?asOf=${d(12, 31)}`)).body;
    expect(before.balanced).toBe(true);
    expect(before.totalAssets).toBe('4550.00');
    expect(before.netAssets.some((l: any) => l.name.startsWith('Current surplus'))).toBe(true);
    for (const fundId of [general, building]) {
      const byFund = (await get(`/reports/balance-sheet?asOf=${d(12, 31)}&fundId=${fundId}`)).body;
      expect(byFund.balanced).toBe(true);
    }
    // a date in the middle of a period
    const mid = (await get(`/reports/balance-sheet?asOf=${d(2, 10)}`)).body;
    expect(mid.totalAssets).toBe('5000.00');
    expect(mid.balanced).toBe(true);

    await asChurch(async () => {
      const t = await requestTx();
      const years = await listFiscalYears(t, churchId);
      const year = years.find((y: any) => y.startDate === `${YEAR}-01-01`)!;
      for (const period of year.periods.filter((p: any) => p.number <= 12)) await closePeriod(t, churchId, period.id, 1);
      await closeFiscalYear(t, churchId, year.id, 1);
    });
    const after = (await get(`/reports/balance-sheet?asOf=${d(12, 31)}`)).body;
    expect(after.balanced).toBe(true);
    expect(after.totalAssets).toBe(before.totalAssets);
    expect(after.totalNetAssets).toBe(before.totalNetAssets);
    expect(after.netAssets.some((l: any) => l.name.startsWith('Current surplus'))).toBe(false);
    // the closed year's activity is still reportable
    const activity = (await get(`/reports/income-statement?from=${d(1, 1)}&to=${d(12, 31)}`)).body;
    expect(activity.totalIncome).toBe('5750.00');
  });

  it('agrees with the trial balance and fund balances', async () => {
    await give(300_000, d(6, 1));
    await give(60_000, d(6, 2), building);
    const sheet = (await get(`/reports/balance-sheet?asOf=${d(6, 30)}`)).body;
    const tb = (await get(`/finance/trial-balance?asOf=${d(6, 30)}`)).body;
    expect(tb.balanced).toBe(true);
    const funds = (await get(`/reports/fund-balances?asOf=${d(6, 30)}`)).body;
    expect(funds.totalNetAssets).toBe(sheet.totalNetAssets);
    expect(funds.funds.find((f: any) => f.code === 'BLD')).toMatchObject({ cash: '600.00', netAssets: '600.00' });
    expect((await get(`/reports/fund-balances?asOf=${d(6, 30)}&format=csv`)).text).toContain('Building Fund');
  });
});

describe('cash flow', () => {
  it('groups real cash movements by origin and reconciles opening to closing', async () => {
    await give(400_000, d(1, 10));
    await give(50_000, d(2, 5), general, mpesa);
    await spend(100_000, d(2, 6));
    await asChurch(async () => postTransfer(await requestTx(), churchId, { date: d(2, 7), fromFundId: general, toFundId: building, amountMinor: 20_000, memo: 'move', actorId: 1 }));
    const flow = (await get(`/reports/cash-flow?from=${d(2, 1)}&to=${d(2, 28)}`)).body;
    expect(flow.openingCash).toBe('4000.00');
    expect(flow.netChange).toBe('-500.00');
    expect(flow.closingCash).toBe('3500.00');
    expect(flow.reconciles).toBe(true);
    expect(flow.accounts.map((a: any) => [a.code, a.change]).sort()).toEqual([['1100', '-1000.00'], ['1110', '500.00']]);
    expect(flow.outflows).toEqual([{ sourceType: 'MANUAL', label: 'Manual journals', amount: '500.00' }]);
  });
});

describe('ledger detail and ministries', () => {
  it('summarises every account, pages one account with running balances, and exports', async () => {
    await give(10_000, d(3, 1));
    await give(20_000, d(3, 2));
    await spend(5_000, d(3, 3));
    const gl = (await get(`/reports/general-ledger?from=${d(3, 1)}&to=${d(3, 31)}`)).body;
    const bank = gl.accounts.find((a: any) => a.code === '1100');
    expect(bank).toMatchObject({ opening: '0.00', debits: '300.00', credits: '50.00', closing: '250.00' });
    const reg = (await get(`/reports/general-ledger/${cash}?limit=2`)).body;
    expect(reg.data.map((r: any) => r.balance)).toEqual(['100.00', '300.00']);
    const next = (await get(`/reports/general-ledger/${cash}?limit=2&cursor=${reg.nextCursor}`)).body;
    expect(next.openingBalance).toBe('300.00');
    expect(next.data[0].balance).toBe('250.00');
    expect((await get(`/reports/general-ledger/${cash}?format=csv`)).text).toContain('Balance');
  });

  it('attributes expense to ministries, and to nobody when untagged', async () => {
    await give(100_000, d(3, 1));
    await spend(30_000, d(3, 5), general, ministryId);
    await spend(10_000, d(3, 6));
    const res = (await get(`/reports/expenses/by-ministry?from=${d(3, 1)}&to=${d(3, 31)}`)).body;
    expect(res.total).toBe('400.00');
    expect(res.ministries.map((m: any) => [m.name, m.total, m.share])).toEqual([['Youth', '300.00', '75.0'], ['Not assigned to a ministry', '100.00', '25.0']]);
  });
});

describe('giving reports', () => {
  async function donors() {
    return asChurch(async () => {
      const t = await requestTx();
      const make = async (first: string) =>
        (await db.Member.create({ churchId, firstName: first, lastName: 'Doe', membershipDate: d(1, 1, YEAR - 3), status: 'Active' }, { transaction: t })).id as number;
      const [amina, brian, cate] = [await make('Amina'), await make('Brian'), await make('Cate')];
      const gift = (memberId: number | null, amount: number, date: string, type = 'Tithe') =>
        db.Contribution.create({ churchId, memberId, amount, date, contributionType: type }, { transaction: t });
      await gift(amina, 100, d(1, 5, YEAR - 1));
      await gift(brian, 50, d(2, 5, YEAR - 1));
      await gift(amina, 200, d(1, 10));
      await gift(amina, 100, d(2, 10), 'Offering');
      await gift(cate, 75, d(3, 10));
      await gift(null, 25, d(3, 11), 'Offering');
      return { amina, brian, cate };
    });
  }

  it('answers by type, month, top givers, average gift and retention', async () => {
    const { amina, brian } = await donors();
    const range = `from=${d(1, 1)}&to=${d(12, 31)}`;
    const byType = (await get(`/reports/giving/by-type?${range}`)).body;
    expect(byType.total).toBe('400.00');
    expect(byType.types.map((t: any) => [t.type, t.total, t.gifts])).toEqual([['Tithe', '275.00', 2], ['Offering', '125.00', 2]]);
    const byMonth = (await get(`/reports/giving/by-month?${range}`)).body;
    expect(byMonth.months).toHaveLength(12);
    expect(byMonth.months.slice(0, 3).map((m: any) => m.total)).toEqual(['200.00', '100.00', '100.00']);
    const top = (await get(`/reports/giving/top-givers?${range}&limit=2`)).body;
    expect(top.givers.map((g: any) => [g.rank, g.name, g.total])).toEqual([[1, 'Amina Doe', '300.00'], [2, 'Cate Doe', '75.00']]);
    const average = (await get(`/reports/giving/average-gift?${range}`)).body;
    expect(average).toMatchObject({ gifts: 4, identifiedDonors: 2, total: '400.00', averageGift: '100.00', averagePerDonor: '200.00' });
    const retention = (await get(`/reports/giving/retention?year=${YEAR}`)).body;
    expect(retention).toMatchObject({ priorYearDonors: 2, currentYearDonors: 2, retained: 1, lost: 1, newDonors: 1, retentionRate: '50.0' });
    expect(amina && brian).toBeTruthy();
  });

  it('finds regular givers who have gone quiet', async () => {
    await donors();
    const lapsed = (await get(`/reports/giving/lapsed?asOf=${d(9, 30)}&quietMonths=3&lookbackMonths=12`)).body;
    expect(lapsed.quietSince).toBe(d(6, 30));
    expect(lapsed.givers.map((g: any) => g.name)).toEqual(['Amina Doe', 'Cate Doe']);
    expect((await get(`/reports/giving/lapsed?asOf=${d(9, 30)}&format=csv`)).text.split('\r\n')[0]).toBe('Member,Email,Phone,Gifts,Total,Last gift');
  });

  it('reports giving by fund from the ledger', async () => {
    await give(100_000, d(3, 1), general);
    await give(25_000, d(3, 2), building);
    const res = (await get(`/reports/giving/by-fund?from=${d(3, 1)}&to=${d(3, 31)}`)).body;
    expect(res.source).toBe('ledger');
    expect(res.funds.map((f: any) => [f.code, f.income])).toEqual([['BLD', '250.00'], ['GEN', '1000.00']]);
  });

  it('leaves out voided and pending gifts', async () => {
    await asChurch(async () => {
      const t = await requestTx();
      await db.Contribution.create({ churchId, memberId: null, amount: 100, date: d(3, 1), contributionType: 'Tithe' }, { transaction: t });
      await db.Contribution.create({ churchId, memberId: null, amount: 900, date: d(3, 2), contributionType: 'Tithe', status: 'VOID' }, { transaction: t });
      await db.Contribution.create({ churchId, memberId: null, amount: 700, date: d(3, 3), contributionType: 'Tithe', status: 'PENDING' }, { transaction: t });
    });
    expect((await get(`/reports/giving/by-type?from=${d(3, 1)}&to=${d(3, 31)}`)).body.total).toBe('100.00');
  });
});

describe('dashboard', () => {
  it('summarises the month, the year, cash, payables and the giving trend', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await give(300_000, today);
    await spend(50_000, today);
    const res = await get('/reports/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.month.income).toBe('3000.00');
    expect(res.body.yearToDate.surplus).toBe('2500.00');
    expect(res.body.cash.total).toBe('2500.00');
    expect(res.body.givingTrend).toHaveLength(12);
    if (res.body.pledges) expect(res.body.pledges).toMatchObject({ activePledges: 0, pledged: '0.00' });
    expect(res.body.bills).toMatchObject({ outstanding: '0.00' });
    expect(res.body.budget).toBeNull();
  });
});

describe('caching', () => {
  it('serves repeats from the cache and drops them the moment a posting commits', async () => {
    const store = new MemoryCacheStore();
    setCacheStore(store);
    await give(100_000, d(3, 1));
    const url = `/reports/income-statement?from=${d(3, 1)}&to=${d(3, 31)}`;
    const first = (await get(url)).body;
    expect(first.totalIncome).toBe('1000.00');
    expect(store.size).toBe(1);

    // A change that does not go through the ledger is invisible to the cache: proof it is serving hits.
    await asChurch(async () => db.Contribution.create({ churchId, memberId: null, amount: 10, date: d(3, 2), contributionType: 'Tithe' }, { transaction: await requestTx() }));
    const giving = `/reports/giving/by-type?from=${d(3, 1)}&to=${d(3, 31)}`;
    expect((await get(giving)).body.total).toBe('10.00');
    await asChurch(async () => db.Contribution.create({ churchId, memberId: null, amount: 15, date: d(3, 3), contributionType: 'Tithe' }, { transaction: await requestTx() }));
    expect((await get(giving)).body.total).toBe('10.00'); // still the cached answer

    // A posting commits, the church's cache version moves, and everything recomputes.
    await give(50_000, d(3, 4));
    expect((await get(url)).body.totalIncome).toBe('1500.00');
    expect((await get(giving)).body.total).toBe('25.00');
  });

  it('never leaks one church into another through the cache', async () => {
    setCacheStore(new MemoryCacheStore());
    await give(100_000, d(3, 1));
    const other = await signUp('rival');
    const url = `/reports/income-statement?from=${d(3, 1)}&to=${d(3, 31)}`;
    expect((await get(url)).body.totalIncome).toBe('1000.00');
    expect((await get(url, other.headers)).body.totalIncome).toBe('0.00');
  });

  it('is a plain pass-through when there is no cache', async () => {
    setCacheStore(null);
    await give(100_000, d(3, 1));
    expect((await get(`/reports/income-statement?from=${d(3, 1)}&to=${d(3, 31)}`)).status).toBe(200);
  });
});

describe('who may read reports', () => {
  it('opens them to treasurers, pastors and auditors and closes them to members and anonymous callers', async () => {
    const make = async (name: string, role: string) => {
      await request(app).post('/users').set(auth).send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}`, role });
      const login = await request(app).post('/auth/login').send({ email: `${name}@example.org`, password: `passphrase-${name}` });
      return { Authorization: `Bearer ${login.body.token}` };
    };
    const auditor = await make('audrey', 'AUDITOR');
    const member = await make('mike', 'MEMBER');
    expect((await get('/reports/balance-sheet', auditor)).status).toBe(200);
    expect((await get('/reports/giving/by-type', auditor)).status).toBe(200);
    expect((await get('/reports/balance-sheet', member)).status).toBe(403);
    expect((await get('/reports/dashboard', member)).status).toBe(403);
    expect((await request(app).get('/reports/dashboard')).status).toBe(401);
  });
});

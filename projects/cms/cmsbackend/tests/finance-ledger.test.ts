import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { runAsTenant } from '../src/common/tenant-run';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { postEntry, reverseEntry, verifyLedger } from '../src/modules/finance/ledger.service';
import { balancesBetween, trialBalance } from '../src/modules/finance/balances.service';
import { closePeriod, listFiscalYears } from '../src/modules/finance/periods.service';
import { closeFiscalYear } from '../src/modules/finance/closing.service';
import { accountIdByKey } from '../src/modules/finance/setup.service';
import { select } from '../src/modules/finance/sql';
import { postTransfer } from '../src/modules/finance/journal.service';
import { fundPosition } from '../src/modules/finance/ledger.service';
import { verifyAuditChain } from '../src/modules/finance/audit.service';

const app = createApp();
const YEAR = new Date().getUTCFullYear();
const d = (month: number, day = 15) => `${YEAR}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

let churchId: number;
let auth: { Authorization: string };
let cash: number;
let tithes: number;
let rent: number;
let general: number;
let building: number;

async function signUp(slug: string) {
  const owner = { username: 'admin', email: `${slug}@example.org`, password: `passphrase-${slug}` };
  const created = await request(app).post('/churches').send({ church: { name: `Church ${slug}`, slug }, owner });
  const login = await request(app).post('/auth/login').send({ email: owner.email, password: owner.password });
  return { churchId: created.body.church.id as number, headers: { Authorization: `Bearer ${login.body.token}` } };
}

async function userWithRole(admin: { Authorization: string }, name: string, role: string) {
  await request(app).post('/users').set(admin).send({ username: name, email: `${name}@example.org`, password: `passphrase-${name}`, role });
  const login = await request(app).post('/auth/login').send({ email: `${name}@example.org`, password: `passphrase-${name}` });
  return { Authorization: `Bearer ${login.body.token}` };
}

const asChurch = <T>(work: () => Promise<T>) => runAsTenant(churchId, work);
const tx = () => (db.sequelize as any);

async function ids() {
  await asChurch(async () => {
    const t = await (await import('../src/common/http')).requestTx();
    cash = await accountIdByKey(t, churchId, 'BANK_MAIN');
    tithes = await accountIdByKey(t, churchId, 'INCOME_TITHES');
    const r = await select<any>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND code = '5100'`, { churchId });
    rent = Number(r[0].id);
    const funds = await select<any>(t, `SELECT id, code FROM funds WHERE church_id = :churchId`, { churchId });
    general = Number(funds.find((f) => f.code === 'GEN').id);
    building = Number(funds.find((f) => f.code === 'BLD').id);
  });
}

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  const signed = await signUp('ledger');
  churchId = signed.churchId;
  auth = signed.headers;
  await ids();
});

const give = (amount: number, date = d(3), fundId = general) =>
  asChurch(async () => {
    const t = await (await import('../src/common/http')).requestTx();
    return postEntry(
      { entryDate: date, memo: 'Sunday offering', sourceType: 'MANUAL', lines: [{ accountId: cash, fundId, debit: amount }, { accountId: tithes, fundId, credit: amount }] },
      t,
      churchId
    );
  });

describe('a new church starts with real books', () => {
  it('seeds funds, a chart of accounts, and this year with twelve periods plus a closing period', async () => {
    const funds = await request(app).get('/finance/funds').set(auth);
    expect(funds.status).toBe(200);
    expect(funds.body.map((f: any) => f.code).sort()).toEqual(['BEN', 'BLD', 'GEN', 'MIS']);

    const accounts = await request(app).get('/finance/accounts').set(auth);
    expect(accounts.body.length).toBeGreaterThan(50);
    expect(accounts.body.find((a: any) => a.systemKey === 'SUSPENSE')).toBeTruthy();

    const years = await request(app).get('/finance/fiscal-years').set(auth);
    expect(years.body[0].periods).toHaveLength(13);
    expect(years.body[0].periods[12].number).toBe(13);
  });
});

describe('posting', () => {
  it('posts a balanced entry and keeps the trial balance balanced', async () => {
    await give(150_000);
    await give(25_050);
    const tb = await asChurch(async () => trialBalance(await (await import('../src/common/http')).requestTx(), churchId, d(12, 31)));
    expect(tb.totalDebit).toBe(175_050);
    expect(tb.totalCredit).toBe(175_050);
    expect(tb.lines.find((l) => l.code === '1100')!.debit).toBe(175_050);
    expect(tb.lines.find((l) => l.code === '4010')!.credit).toBe(175_050);
  });

  it.each([
    ['an unbalanced entry', (a: number, b: number, f: number) => [{ accountId: a, fundId: f, debit: 100 }, { accountId: b, fundId: f, credit: 99 }]],
    ['a zero line', (a: number, b: number, f: number) => [{ accountId: a, fundId: f, debit: 0 }, { accountId: b, fundId: f, credit: 0 }]],
    ['a line with both sides', (a: number, b: number, f: number) => [{ accountId: a, fundId: f, debit: 5, credit: 5 }, { accountId: b, fundId: f, credit: 0, debit: 0 }]],
    ['a fractional amount', (a: number, b: number, f: number) => [{ accountId: a, fundId: f, debit: 10.5 }, { accountId: b, fundId: f, credit: 10.5 }]]
  ])('refuses %s', async (_name, build) => {
    await expect(
      asChurch(async () => postEntry({ entryDate: d(3), memo: 'bad', sourceType: 'MANUAL', lines: build(cash, tithes, general) }, await (await import('../src/common/http')).requestTx(), churchId))
    ).rejects.toThrow();
  });

  it('requires every fund to balance on its own', async () => {
    await expect(
      asChurch(async () =>
        postEntry(
          { entryDate: d(3), memo: 'cross fund', sourceType: 'MANUAL', lines: [{ accountId: cash, fundId: general, debit: 500 }, { accountId: tithes, fundId: building, credit: 500 }] },
          await (await import('../src/common/http')).requestTx(),
          churchId
        )
      )
    ).rejects.toThrow(/within fund/);
  });

  it('refuses headings, unknown accounts and other churches', async () => {
    const other = await signUp('elsewhere');
    const foreign = await runAsTenant(other.churchId, async () => accountIdByKey(await (await import('../src/common/http')).requestTx(), other.churchId, 'BANK_MAIN'));
    await expect(
      asChurch(async () => postEntry({ entryDate: d(3), memo: 'x', sourceType: 'MANUAL', lines: [{ accountId: foreign, fundId: general, debit: 5 }, { accountId: tithes, fundId: general, credit: 5 }] }, await (await import('../src/common/http')).requestTx(), churchId))
    ).rejects.toThrow(/does not exist in this church/);
    const heading = await request(app).get('/finance/accounts').set(auth);
    const assets = heading.body.find((a: any) => a.code === '1000').id;
    await expect(
      asChurch(async () => postEntry({ entryDate: d(3), memo: 'x', sourceType: 'MANUAL', lines: [{ accountId: assets, fundId: general, debit: 5 }, { accountId: tithes, fundId: general, credit: 5 }] }, await (await import('../src/common/http')).requestTx(), churchId))
    ).rejects.toThrow(/heading/);
  });

  it('is idempotent on the idempotency key', async () => {
    const body = { date: d(4), memo: 'Retry-safe', lines: [{ accountId: cash, fundId: general, debit: '10.00' }, { accountId: tithes, fundId: general, credit: '10.00' }] };
    const first = await request(app).post('/finance/journal').set(auth).set('Idempotency-Key', 'key-0000-0001').send(body);
    const second = await request(app).post('/finance/journal').set(auth).set('Idempotency-Key', 'key-0000-0001').send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.id).toBe(first.body.id);
    const changed = await request(app).post('/finance/journal').set(auth).set('Idempotency-Key', 'key-0000-0001').send({ ...body, memo: 'different' });
    expect(changed.status).toBe(422);
    const list = await request(app).get('/finance/journal').set(auth);
    expect(list.body.data).toHaveLength(1);
  });
});

describe('funds', () => {
  it('moves net assets between funds and blocks overspending a restricted fund', async () => {
    await give(100_000, d(3), general);
    await asChurch(async () => {
      const t = await (await import('../src/common/http')).requestTx();
      await postTransfer(t, churchId, { date: d(3), fromFundId: general, toFundId: building, amountMinor: 40_000, memo: 'Seed the building fund', actorId: 1 });
      expect(await fundPosition(t, churchId, building)).toBe(40_000);
      expect(await fundPosition(t, churchId, general)).toBe(60_000);
    });
    const spend = (amount: number) =>
      asChurch(async () =>
        postEntry(
          { entryDate: d(3), memo: 'Cement', sourceType: 'MANUAL', lines: [{ accountId: rent, fundId: building, debit: amount }, { accountId: cash, fundId: building, credit: amount }] },
          await (await import('../src/common/http')).requestTx(),
          churchId
        )
      );
    await spend(30_000);
    await expect(spend(10_001)).rejects.toThrow(/overspend/);
    await spend(10_000);
  });
});

describe('reversal', () => {
  it('nets an entry to zero, links both, and refuses a second reversal', async () => {
    const posted = await give(80_000);
    const reversal = await asChurch(async () =>
      reverseEntry(await (await import('../src/common/http')).requestTx(), churchId, posted.id, { reason: 'banked twice', date: d(3) })
    );
    expect(reversal.totalMinor).toBe(80_000);
    const tb = await asChurch(async () => trialBalance(await (await import('../src/common/http')).requestTx(), churchId, d(12, 31)));
    expect(tb.lines).toHaveLength(0);
    await expect(
      asChurch(async () => reverseEntry(await (await import('../src/common/http')).requestTx(), churchId, posted.id, { reason: 'again', date: d(3) }))
    ).rejects.toThrow(/already been reversed/);
    const report = await asChurch(async () => verifyLedger(await (await import('../src/common/http')).requestTx(), churchId));
    expect(report.ok).toBe(true);
    expect(report.entries).toBe(2);
  });
});

describe('integrity', () => {
  it('verifies an untouched ledger and audit chain', async () => {
    await give(10_000);
    await give(20_000, d(5));
    const res = await request(app).get('/finance/integrity').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ledger.entries).toBe(2);
  });

  it(onPostgres ? 'refuses, in the database, to edit or delete a posted line' : 'detects a line edited behind the application back', async () => {
    const posted = await give(10_000);
    if (onPostgres) {
      const owner = new (await import('pg')).default.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
      await owner.connect();
      await expect(owner.query('UPDATE journal_lines SET credit_minor = 99999 WHERE entry_id = $1 AND credit_minor > 0', [posted.id])).rejects.toThrow(/append-only/);
      await expect(owner.query('DELETE FROM journal_entries WHERE id = $1', [posted.id])).rejects.toThrow(/never be deleted/);
      await owner.end();
    } else {
      await db.sequelize.query('UPDATE journal_lines SET credit_minor = 99999, debit_minor = 0 WHERE entry_id = ? AND credit_minor > 0', { replacements: [posted.id] });
      const report = await asChurch(async () => verifyLedger(await (await import('../src/common/http')).requestTx(), churchId));
      expect(report.ok).toBe(false);
      expect(report.issues.join(' ')).toMatch(/altered|does not balance|running balance/);
    }
  });

  it('detects a tampered audit event', async () => {
    await request(app).put('/finance/settings').set(auth).send({ receiptPrefix: 'CH' });
    if (onPostgres) return; // the append-only trigger makes the tamper itself impossible there
    await db.sequelize.query(`UPDATE audit_events SET action = 'nothing.to.see' WHERE seq = 1`);
    const result = await asChurch(async () => verifyAuditChain(await (await import('../src/common/http')).requestTx(), churchId));
    expect(result.ok).toBe(false);
  });
});

describe('reading balances', () => {
  it('returns identical figures whether a range lines up with periods or cuts through one', async () => {
    await give(10_000, d(3, 2));
    await give(20_000, d(3, 20));
    await give(40_000, d(4, 5));
    const t = async () => await (await import('../src/common/http')).requestTx();
    const total = (rows: Awaited<ReturnType<typeof balancesBetween>>) => rows.reduce((s, r) => s + r.credit, 0);
    await asChurch(async () => {
      const whole = await balancesBetween(await t(), churchId, { from: d(3, 1), to: d(3, 31) });
      const partialStart = await balancesBetween(await t(), churchId, { from: d(3, 10), to: d(3, 31) });
      const partialEnd = await balancesBetween(await t(), churchId, { from: d(3, 1), to: d(3, 10) });
      const across = await balancesBetween(await t(), churchId, { from: d(3, 1), to: d(4, 30) });
      expect(total(whole)).toBe(30_000);
      expect(total(partialStart)).toBe(20_000);
      expect(total(partialEnd)).toBe(10_000);
      expect(total(across)).toBe(70_000);
      const all = await balancesBetween(await t(), churchId, { to: d(12, 31), includeClosing: true });
      expect(total(all)).toBe(70_000);
    });
  });
});

describe('the fiscal calendar', () => {
  it('closes months in order, refuses postings into a closed month, and reopens', async () => {
    const t = async () => await (await import('../src/common/http')).requestTx();
    await give(10_000, d(1, 10));
    const years = await asChurch(async () => listFiscalYears(await t(), churchId));
    const [jan, feb] = years[0].periods;
    await expect(asChurch(async () => closePeriod(await t(), churchId, feb.id, 1))).rejects.toThrow(/close .* first/);
    await asChurch(async () => closePeriod(await t(), churchId, jan.id, 1));
    await expect(give(5_000, d(1, 20))).rejects.toThrow();
    const reopen = await request(app).post(`/finance/periods/${jan.id}/reopen`).set(auth).send({ reason: 'late banking slip' });
    expect(reopen.status).toBe(200);
    await give(5_000, d(1, 20));
  });

  it('closes the year: zeroes income and expense into net assets, locks it, opens the next', async () => {
    const t = async () => await (await import('../src/common/http')).requestTx();
    await give(500_000, d(2, 10));
    await asChurch(async () =>
      postEntry(
        { entryDate: d(2, 11), memo: 'Rent', sourceType: 'MANUAL', lines: [{ accountId: rent, fundId: general, debit: 120_000 }, { accountId: cash, fundId: general, credit: 120_000 }] },
        await t(),
        churchId
      )
    );
    const years = await asChurch(async () => listFiscalYears(await t(), churchId));
    const year = years[0];
    await expect(asChurch(async () => closeFiscalYear(await t(), churchId, year.id, 1))).rejects.toThrow(/close every month first/);
    for (const period of year.periods.filter((p: any) => p.number <= 12)) {
      await asChurch(async () => closePeriod(await t(), churchId, period.id, 1));
    }
    const closed = await asChurch(async () => closeFiscalYear(await t(), churchId, year.id, 1));
    expect(closed.closingEntryId).toBeTruthy();
    expect(Object.values(closed.surplusByFund)).toEqual([380_000]);

    await asChurch(async () => {
      const activity = await balancesBetween(await t(), churchId, { from: year.startDate, to: year.endDate });
      expect(activity.filter((r) => r.accountId === tithes).reduce((s, r) => s + r.credit, 0)).toBe(500_000);
      const tb = await trialBalance(await t(), churchId, year.endDate);
      const netAssets = tb.lines.find((l) => l.code === '3010')!;
      expect(netAssets.credit).toBe(380_000);
      expect(tb.lines.find((l) => l.code === '4010')).toBeUndefined();
      expect(tb.totalDebit).toBe(tb.totalCredit);
    });
    await expect(give(1_000, d(6, 1))).rejects.toThrow();
    const next = await asChurch(async () => listFiscalYears(await t(), churchId));
    expect(next.length).toBe(2);
  });
});

describe('who may do what', () => {
  it('lets a treasurer post but not approve or close, an auditor read but not post, a member nothing', async () => {
    const treasurer = await userWithRole(auth, 'tess', 'TREASURER');
    const auditor = await userWithRole(auth, 'audrey', 'AUDITOR');
    const member = await userWithRole(auth, 'mike', 'MEMBER');
    const body = { date: d(3), memo: 'Offering', lines: [{ accountId: cash, fundId: general, debit: '5.00' }, { accountId: tithes, fundId: general, credit: '5.00' }] };

    expect((await request(app).post('/finance/journal').set(treasurer).send(body)).status).toBe(201);
    expect((await request(app).post('/finance/journal').set(auditor).send(body)).status).toBe(403);
    expect((await request(app).get('/finance/trial-balance').set(auditor)).status).toBe(200);
    expect((await request(app).get('/finance/integrity').set(auditor)).status).toBe(200);
    expect((await request(app).get('/finance/integrity').set(treasurer)).status).toBe(403);
    expect((await request(app).get('/finance/funds').set(member)).status).toBe(403);
    expect((await request(app).put('/finance/settings').set(treasurer).send({ receiptPrefix: 'X' })).status).toBe(403);
    expect((await request(app).get('/finance/funds')).status).toBe(401);
  });
});

describe('paging', () => {
  it('walks the journal and an account register by cursor with a correct running balance', async () => {
    for (let i = 1; i <= 7; i += 1) await give(1_000 * i, d(3, i));
    const first = await request(app).get('/finance/journal?limit=3').set(auth);
    expect(first.body.data).toHaveLength(3);
    expect(first.body.nextCursor).toBeTruthy();
    const second = await request(app).get(`/finance/journal?limit=3&cursor=${first.body.nextCursor}`).set(auth);
    const third = await request(app).get(`/finance/journal?limit=3&cursor=${second.body.nextCursor}`).set(auth);
    expect(third.body.data).toHaveLength(1);
    expect(third.body.nextCursor).toBeNull();
    const seen = [...first.body.data, ...second.body.data, ...third.body.data].map((e: any) => e.id);
    expect(new Set(seen).size).toBe(7);

    const page1 = await request(app).get(`/finance/accounts/${cash}/register?limit=4`).set(auth);
    const page2 = await request(app).get(`/finance/accounts/${cash}/register?limit=4&cursor=${page1.body.nextCursor}`).set(auth);
    expect(page1.body.data.map((r: any) => r.balance)).toEqual(['10.00', '30.00', '60.00', '100.00']);
    expect(page2.body.openingBalance).toBe('100.00');
    expect(page2.body.data.map((r: any) => r.balance)).toEqual(['150.00', '210.00', '280.00']);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('numbers entries gaplessly and keeps balances exact under concurrent posting', async () => {
    await Promise.all(Array.from({ length: 40 }, (_, i) => give(100 + i, d(3, (i % 20) + 1))));
    const report = await asChurch(async () => verifyLedger(await (await import('../src/common/http')).requestTx(), churchId));
    expect(report.issues).toEqual([]);
    expect(report.entries).toBe(40);
  });

  it('refuses an unbalanced entry at COMMIT even if the application is bypassed', async () => {
    const owner = new (await import('pg')).default.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    const period = (await owner.query(`SELECT id FROM fiscal_periods WHERE church_id = $1 AND number = 1`, [churchId])).rows[0].id;
    await owner.query('BEGIN');
    await owner.query(
      `INSERT INTO journal_entries (church_id, entry_no, entry_date, period_id, memo, source_type, total_minor, posted_at, prev_hash, hash)
       VALUES ($1, 9999, $2, $3, 'sneaky', 'MANUAL', 100, now(), repeat('0',64), repeat('1',64))`,
      [churchId, d(1, 5), period]
    );
    const entry = (await owner.query(`SELECT id FROM journal_entries WHERE church_id = $1 AND entry_no = 9999`, [churchId])).rows[0].id;
    await owner.query(
      `INSERT INTO journal_lines (church_id, entry_id, line_no, account_id, fund_id, debit_minor, credit_minor, entry_date, period_id)
       VALUES ($1, $2, 1, $3, $4, 100, 0, $5, $6), ($1, $2, 2, $7, $4, 0, 60, $5, $6)`,
      [churchId, entry, cash, general, d(1, 5), period, tithes]
    );
    await expect(owner.query('COMMIT')).rejects.toThrow(/unbalanced/);
    await owner.end();
  });

  it('keeps one church out of another church rows even with a hand-written query', async () => {
    await give(1_000);
    const other = await signUp('rival');
    const visible = await runAsTenant(other.churchId, async () => {
      const t = await (await import('../src/common/http')).requestTx();
      return select<any>(t, 'SELECT * FROM journal_entries');
    });
    expect(visible).toHaveLength(0);
    const leaked = await runAsTenant(other.churchId, async () => {
      const t = await (await import('../src/common/http')).requestTx();
      return select<any>(t, 'SELECT * FROM accounts WHERE church_id = ?', [churchId]);
    });
    expect(leaked).toHaveLength(0);
  });
});

void tx;

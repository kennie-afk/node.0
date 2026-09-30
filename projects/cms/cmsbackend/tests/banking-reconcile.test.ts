import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { app, Auth, Books, books, d, journal, signUp, userWithRole } from './payables-helpers';
import { parseAmount, parseDate, parseStatementCsv, splitCsv } from '../src/modules/banking/csv';
import { dedupeKeys } from '../src/modules/banking/statements.service';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let admin: Auth;
let treasurer: Auth;
let auditor: Auth;
let member: Auth;
let b: Books;
let bank: { id: number; glAccountId: number };

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  const s = await signUp('banking');
  admin = s.admin;
  treasurer = (await userWithRole(admin, 'tess', 'TREASURER')).auth;
  auditor = (await userWithRole(admin, 'audrey', 'AUDITOR')).auth;
  member = (await userWithRole(admin, 'mike', 'MEMBER')).auth;
  b = await books(admin);
  bank = (await request(app).get('/banking/accounts').set(treasurer)).body.find((a: any) => a.kind === 'BANK');
});

const deposit = (amount: string, date: string, memo = 'Offering banked') =>
  journal(admin, date, memo, [
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, debit: amount },
    { accountId: b.accounts['4020'], fundId: b.funds.GEN, credit: amount }
  ]);
const withdrawal = (amount: string, date: string, memo = 'Cheque paid') =>
  journal(admin, date, memo, [
    { accountId: b.accounts['5110'], fundId: b.funds.GEN, debit: amount },
    { accountId: b.accounts['1100'], fundId: b.funds.GEN, credit: amount }
  ]);
const importRows = (rows: unknown[], extra: Record<string, unknown> = {}, as: Auth = treasurer) =>
  request(app).post(`/banking/accounts/${bank.id}/statements`).set(as).send({ rows, ...extra });
const lines = async (status?: string) => (await request(app).get(`/banking/accounts/${bank.id}/lines${status ? `?status=${status}` : ''}`).set(treasurer)).body.data as any[];
const ledgerLineIds = async () => (await request(app).get(`/finance/accounts/${bank.glAccountId}/register`).set(treasurer)).body.data as any[];

describe('reading a statement file', () => {
  it('splits CSV with quotes, doubled quotes, commas and CRLF', () => {
    expect(splitCsv('a,"b,c","d ""q"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "q"'], ['1', '2', '3']]);
  });

  it('understands the date and amount formats banks actually produce', () => {
    expect(parseDate('2026-03-05')).toBe('2026-03-05');
    expect(parseDate('05/03/2026')).toBe('2026-03-05');
    expect(parseDate('5-3-2026')).toBe('2026-03-05');
    expect(parseDate('05 Mar 2026')).toBe('2026-03-05');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseAmount('KES 1 000')).toBe(100000);
    expect(parseAmount('(99.00)')).toBe(-9900);
    expect(parseAmount('-10')).toBe(-1000);
    expect(() => parseAmount('1.234')).toThrow();
  });

  it('maps a single amount column or separate debit and credit columns', () => {
    const one = parseStatementCsv('Date,Details,Ref,Amount,Balance\n05/03/2026,"Deposit, cash",R1,"5,000.00",15000\n06/03/2026,Fee,R2,-50.00,14950.00');
    expect(one.errors).toEqual([]);
    expect(one.rows.map((r) => r.amountMinor)).toEqual([500000, -5000]);
    expect(one.rows[0].description).toBe('Deposit, cash');
    expect(one.rows[1].balanceMinor).toBe(1495000);
    const two = parseStatementCsv('Txn Date,Narrative,Withdrawal,Paid In\n2026-03-05,Cheque 101,1000.00,\n2026-03-06,Mpesa,,250.00');
    expect(two.rows.map((r) => r.amountMinor)).toEqual([-100000, 25000]);
  });

  it('reports every bad row with its line number', () => {
    const bad = parseStatementCsv('Date,Description,Amount\nnot a date,x,10\n2026-03-05,y,abc\n2026-03-06,z,0');
    expect(bad.errors.map((e) => e.row)).toEqual([2, 3, 4]);
    expect(parseStatementCsv('Foo,Bar\n1,2').errors[0].message).toMatch(/no date column/);
  });

  it('keeps identical reference-less lines apart and identical references with different amounts apart', () => {
    const row = { date: d(1, 1), description: 'Cash deposit', reference: null, amountMinor: 1000, balanceMinor: null };
    const keys = dedupeKeys([row, row, { ...row, reference: 'X1' }, { ...row, reference: 'X1', amountMinor: -5 }]);
    expect(new Set(keys).size).toBe(4);
    expect(dedupeKeys([row, row])).toEqual(dedupeKeys([row, row]));
  });
});

describe('bank accounts', () => {
  it('seeds the four standard cash accounts, each tied to its ledger account', async () => {
    const list = await request(app).get('/banking/accounts').set(auditor);
    expect(list.status).toBe(200);
    expect(list.body.map((a: any) => a.kind).sort()).toEqual(['BANK', 'CASH', 'MPESA_PAYBILL', 'PETTY_CASH']);
    expect(new Set(list.body.map((a: any) => a.glAccountId)).size).toBe(4);
  });

  it('creates another account (with its own ledger account), refuses a second link, and gates by permission', async () => {
    const created = await request(app).post('/banking/accounts').set(treasurer).send({ name: 'Equity Bank - Building', kind: 'BANK', newAccount: { code: '1105' }, accountNumber: '0123456789' });
    expect(created.status).toBe(201);
    const dupe = await request(app).post('/banking/accounts').set(treasurer).send({ name: 'Another', kind: 'BANK', glAccountId: created.body.glAccountId });
    expect(dupe.status).toBe(409);
    const notAsset = await request(app).post('/banking/accounts').set(treasurer).send({ name: 'Wrong', kind: 'BANK', glAccountId: b.accounts['4020'] });
    expect(notAsset.status).toBe(400);
    expect((await request(app).post('/banking/accounts').set(auditor).send({ name: 'Nope', kind: 'BANK', newAccount: { code: '1199' } })).status).toBe(403);
    expect((await request(app).get('/banking/accounts').set(member)).status).toBe(403);
    await deposit('10.00', d(1, 5));
    const blocked = await request(app).put(`/banking/accounts/${bank.id}`).set(treasurer).send({ isActive: false });
    expect(blocked.status).toBe(409);
  });
});

describe('importing statements', () => {
  it('imports JSON rows, then skips duplicates when an overlapping statement is imported again', async () => {
    const rows = [
      { date: d(1, 6), description: 'Deposit', reference: 'BK1', amount: '1000.00' },
      { date: d(1, 7), description: 'Deposit', reference: null, amount: '300.00' },
      { date: d(1, 7), description: 'Deposit', reference: null, amount: '300.00' }
    ];
    const first = await importRows(rows);
    expect(first.status).toBe(201);
    expect(first.body.imported).toBe(3);
    const again = await importRows([...rows, { date: d(1, 9), description: 'New', reference: 'BK2', amount: '50.00' }]);
    expect(again.body.imported).toBe(1);
    expect(again.body.skippedDuplicates).toBe(3);
    const none = await importRows(rows);
    expect(none.body.imported).toBe(0);
    expect(none.body.statementId).toBeNull();
    expect((await lines()).length).toBe(4);
    expect((await request(app).get(`/banking/accounts/${bank.id}/statements`).set(treasurer)).body).toHaveLength(2);
  });

  it('imports a CSV, and rejects a file with any bad row without importing the good ones', async () => {
    const good = await request(app).post(`/banking/accounts/${bank.id}/statements`).set(treasurer).send({ csv: 'Date,Description,Reference,Amount\n05/01/2026,Cash,C1,"2,500.00"\n06/01/2026,Fee,C2,-45.00' });
    expect(good.status).toBe(201);
    expect(good.body.imported).toBe(2);
    const bad = await request(app).post(`/banking/accounts/${bank.id}/statements`).set(treasurer).send({ csv: 'Date,Description,Amount\n07/01/2026,ok,10\nyesterday,bad,5' });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/row 3/);
    expect((await lines()).length).toBe(2);
  });

  it('is gated: an auditor can read lines but not import', async () => {
    expect((await importRows([{ date: d(1, 6), description: 'x', amount: '1.00' }], {}, auditor)).status).toBe(403);
    expect((await request(app).get(`/banking/accounts/${bank.id}/lines`).set(auditor)).status).toBe(200);
    expect((await request(app).post(`/banking/accounts/${bank.id}/statements`).set(treasurer).send({})).status).toBe(400);
  });
});

describe('matching', () => {
  it('matches a statement line to the ledger line of the same amount, and refuses a wrong total', async () => {
    await deposit('1000.00', d(1, 5));
    await deposit('400.00', d(1, 5));
    await importRows([{ date: d(1, 6), description: 'Deposit', reference: 'BK1', amount: '1000.00' }]);
    const [line] = await lines();
    const candidates = await request(app).get(`/banking/lines/${line.id}/candidates`).set(treasurer);
    expect(candidates.body).toHaveLength(1);
    expect(candidates.body[0].amount).toBe('1000.00');

    const all = await ledgerLineIds();
    const wrong = all.find((r) => r.debit === '400.00');
    expect((await request(app).post(`/banking/lines/${line.id}/match`).set(treasurer).send({ journalLineIds: [wrong.lineId] })).status).toBe(400);
    const right = all.find((r) => r.debit === '1000.00');
    const matched = await request(app).post(`/banking/lines/${line.id}/match`).set(treasurer).send({ journalLineIds: [right.lineId] });
    expect(matched.status).toBe(200);
    expect(matched.body.status).toBe('MATCHED');
    expect((await request(app).post(`/banking/lines/${line.id}/match`).set(treasurer).send({ journalLineIds: [right.lineId] })).status).toBe(409);
  });

  it('lets one deposit clear several ledger receipts, and a ledger line clear only once', async () => {
    await deposit('600.00', d(1, 5));
    await deposit('400.00', d(1, 5));
    await deposit('1000.00', d(1, 5));
    await importRows([
      { date: d(1, 6), description: 'Bulk deposit', reference: 'B1', amount: '1000.00' },
      { date: d(1, 6), description: 'Second', reference: 'B2', amount: '1000.00' }
    ]);
    const [first, second] = (await lines()).sort((x, y) => x.id - y.id);
    const all = await ledgerLineIds();
    const pieces = all.filter((r) => r.debit === '600.00' || r.debit === '400.00').map((r) => r.lineId);
    expect((await request(app).post(`/banking/lines/${first.id}/match`).set(treasurer).send({ journalLineIds: pieces })).body.status).toBe('MATCHED');
    const clash = await request(app).post(`/banking/lines/${second.id}/match`).set(treasurer).send({ journalLineIds: [pieces[0]] });
    expect([400, 409]).toContain(clash.status);
    const undone = await request(app).delete(`/banking/lines/${first.id}/match`).set(treasurer);
    expect(undone.body.status).toBe('UNMATCHED');
    const ledgerOnly = all.find((r) => r.debit === '1000.00');
    expect((await request(app).post(`/banking/lines/${second.id}/match`).set(treasurer).send({ journalLineIds: [ledgerOnly.lineId] })).status).toBe(200);
  });

  it('ignores and un-ignores a line, and will not match the lines of a reversed entry', async () => {
    const posted = await deposit('250.00', d(1, 5));
    await request(app).post(`/finance/journal/${posted.body.id}/reverse`).set(treasurer).send({ reason: 'keyed twice' });
    await importRows([{ date: d(1, 6), description: 'Deposit', reference: 'Z1', amount: '250.00' }]);
    const [line] = await lines();
    expect((await request(app).get(`/banking/lines/${line.id}/candidates`).set(treasurer)).body).toHaveLength(0);
    const ignored = await request(app).post(`/banking/lines/${line.id}/ignore`).set(treasurer).send({ reason: 'duplicate of bank error' });
    expect(ignored.body.status).toBe('IGNORED');
    expect((await request(app).post(`/banking/lines/${line.id}/ignore`).set(treasurer).send({ reason: 'again again' })).status).toBe(409);
    expect((await request(app).post(`/banking/lines/${line.id}/unignore`).set(treasurer)).body.status).toBe('UNMATCHED');
  });
});

describe('auto-matching', () => {
  it('proposes unambiguous matches and applies only those, using the reference to break ties', async () => {
    await deposit('500.00', d(2, 3), 'Sunday offering');
    await deposit('700.00', d(2, 4), 'Youth event');
    await deposit('900.00', d(2, 4), 'Cheque CH-77');
    await deposit('900.00', d(2, 4), 'Cheque CH-78');
    await importRows([
      { date: d(2, 4), description: 'Cash dep', reference: 'A1', amount: '500.00' },
      { date: d(2, 5), description: 'Cash dep', reference: 'A2', amount: '700.00' },
      { date: d(2, 5), description: 'Cheque', reference: 'CH-78', amount: '900.00' },
      { date: d(2, 25), description: 'No ledger twin', reference: 'A4', amount: '123.00' }
    ]);
    const preview = await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({});
    expect(preview.body.applied).toBe(0);
    expect(preview.body.proposals).toHaveLength(3);
    expect((await lines('MATCHED')).length).toBe(0);
    const applied = await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({ apply: true });
    expect(applied.body.applied).toBe(3);
    const unmatched = await lines('UNMATCHED');
    expect(unmatched.map((l) => l.reference)).toEqual(['A4']);
    const cheque = (await lines('MATCHED')).find((l) => l.reference === 'CH-78');
    expect(cheque).toBeTruthy();
    const still = await request(app).get(`/banking/accounts/${bank.id}/unreconciled`).set(treasurer);
    expect(still.body.ledgerLines.map((l: any) => l.memo)).toEqual(['Cheque CH-77']);
  });
});

describe('bank-only items', () => {
  it('books a bank charge straight from the statement line and clears it', async () => {
    await importRows([{ date: d(1, 31), description: 'Monthly ledger fee', reference: 'F1', amount: '-350.00' }]);
    const [line] = await lines();
    const res = await request(app).post(`/banking/lines/${line.id}/create-entry`).set(treasurer).send({ accountId: b.accounts['5350'], fundId: b.funds.GEN });
    expect(res.status).toBe(201);
    expect(res.body.line.status).toBe('MATCHED');
    const tb = await request(app).get(`/finance/trial-balance?asOf=${d(12, 31)}`).set(auditor);
    expect(tb.body.lines.find((l: any) => l.code === '5350').debit).toBe('350.00');
    expect(tb.body.lines.find((l: any) => l.code === '1100').credit).toBe('350.00');
    expect((await request(app).post(`/banking/lines/${line.id}/create-entry`).set(treasurer).send({ accountId: b.accounts['5350'], fundId: b.funds.GEN })).status).toBe(409);
    const interest = await importRows([{ date: d(2, 28), description: 'Interest', reference: 'I1', amount: '12.50' }]);
    expect(interest.body.imported).toBe(1);
    const [il] = (await lines('UNMATCHED'));
    expect((await request(app).post(`/banking/lines/${il.id}/create-entry`).set(treasurer).send({ accountId: b.accounts['4900'], fundId: b.funds.GEN })).status).toBe(201);
    expect((await request(app).get('/finance/integrity').set(auditor)).body.ok).toBe(true);
  });
});

describe('reconciliation', () => {
  async function scenario() {
    await deposit('100000.00', d(1, 5));
    await deposit('50000.00', d(1, 10));
    await withdrawal('20000.00', d(1, 30), 'Cheque 101 (not yet presented)');
    await importRows([
      { date: d(1, 6), description: 'Deposit', reference: 'S1', amount: '100000.00' },
      { date: d(1, 11), description: 'Deposit', reference: 'S2', amount: '50000.00' },
      { date: d(1, 31), description: 'Bank charges', reference: 'S3', amount: '-500.00' }
    ]);
    await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({ apply: true });
    const fee = (await lines('UNMATCHED'))[0];
    await request(app).post(`/banking/lines/${fee.id}/create-entry`).set(treasurer).send({ accountId: b.accounts['5350'], fundId: b.funds.GEN });
  }
  const open = (statementBalance: string, date = d(1, 31), openingBalance?: string) =>
    request(app).post(`/banking/accounts/${bank.id}/reconciliations`).set(treasurer).send({ statementDate: date, statementBalance, ...(openingBalance ? { openingBalance } : {}) });

  it('reconciles to zero with an outstanding cheque, finalizes, and is then immutable', async () => {
    await scenario();
    expect((await open('159500.00')).status).toBe(400);
    const rec = await open('159500.00', d(1, 31), '10000.00');
    expect(rec.status).toBe(201);
    expect(rec.body.summary.startingBalance).toBe('10000.00');
    expect(rec.body.summary.matchedLedgerTotal).toBe('149500.00');
    expect(rec.body.summary.clearedBalance).toBe('159500.00');
    expect(rec.body.summary.difference).toBe('0.00');
    expect(rec.body.summary.canFinalize).toBe(true);

    const fin = await request(app).post(`/banking/reconciliations/${rec.body.id}/finalize`).set(treasurer);
    expect(fin.status).toBe(200);
    expect(fin.body.status).toBe('FINALIZED');
    expect(fin.body.clearedBalance).toBe('159500.00');
    expect((await lines('RECONCILED')).length).toBe(3);

    const first = (await lines('RECONCILED'))[0];
    expect((await request(app).delete(`/banking/lines/${first.id}/match`).set(treasurer)).status).toBe(409);
    expect((await request(app).post(`/banking/lines/${first.id}/ignore`).set(treasurer).send({ reason: 'trying to cheat' })).status).toBe(409);
    expect((await request(app).post(`/banking/reconciliations/${rec.body.id}/finalize`).set(treasurer)).status).toBe(409);
    expect((await request(app).delete(`/banking/reconciliations/${rec.body.id}`).set(treasurer)).status).toBe(409);
    expect((await open('159500.00', d(1, 31))).status).toBe(409);

    const unrec = await request(app).get(`/banking/accounts/${bank.id}/unreconciled`).set(treasurer);
    expect(unrec.body.ledgerLines.map((l: any) => l.amount)).toEqual(['-20000.00']);
    expect(unrec.body.statementLines).toHaveLength(0);
    expect(unrec.body.totals.net).toBe('-20000.00');
  });

  it('will not finalize while the books and the statement disagree, or bank lines are unmatched', async () => {
    await scenario();
    const wrong = await open('160000.00', d(1, 31), '10000.00');
    expect(wrong.body.summary.difference).toBe('500.00');
    const refused = await request(app).post(`/banking/reconciliations/${wrong.body.id}/finalize`).set(treasurer);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toMatch(/out by 500\.00/);
    expect((await open('1.00', d(1, 31), '0.00')).status).toBe(409);
    await request(app).delete(`/banking/reconciliations/${wrong.body.id}`).set(treasurer);

    await importRows([{ date: d(1, 20), description: 'Mystery', reference: 'S9', amount: '75.00' }]);
    const blocked = await open('159575.00', d(1, 31), '10000.00');
    expect(blocked.body.summary.unmatchedStatementLines).toHaveLength(1);
    const res = await request(app).post(`/banking/reconciliations/${blocked.body.id}/finalize`).set(treasurer);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/unmatched/);
  });

  it('carries the reconciled balance into the next one', async () => {
    await scenario();
    const first = await open('159500.00', d(1, 31), '10000.00');
    await request(app).post(`/banking/reconciliations/${first.body.id}/finalize`).set(treasurer);
    await deposit('2000.00', d(2, 10));
    await importRows([{ date: d(2, 11), description: 'Deposit', reference: 'S4', amount: '2000.00' }]);
    await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({ apply: true });
    expect((await open('161500.00', d(1, 15))).status).toBe(409);
    const second = await open('161500.00', d(2, 28), '999999.00');
    expect(second.body.summary.startingBalance).toBe('159500.00');
    expect(second.body.summary.difference).toBe('0.00');
    expect((await request(app).post(`/banking/reconciliations/${second.body.id}/finalize`).set(treasurer)).body.status).toBe('FINALIZED');
    const history = await request(app).get(`/banking/accounts/${bank.id}/reconciliations`).set(auditor);
    expect(history.body.map((r: any) => r.statementDate)).toEqual([d(2, 28), d(1, 31)]);
  });

  it('counts ignored bank items on the bank side', async () => {
    await deposit('1000.00', d(1, 5));
    await importRows([
      { date: d(1, 6), description: 'Deposit', reference: 'P1', amount: '1000.00' },
      { date: d(1, 7), description: 'Bank error', reference: 'P2', amount: '80.00' },
      { date: d(1, 8), description: 'Bank error reversed', reference: 'P3', amount: '-80.00' }
    ]);
    await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({ apply: true });
    for (const l of await lines('UNMATCHED')) await request(app).post(`/banking/lines/${l.id}/ignore`).set(treasurer).send({ reason: 'bank error and its reversal' });
    const rec = await open('1000.00', d(1, 31), '0.00');
    expect(rec.body.summary.ignoredTotal).toBe('0.00');
    expect(rec.body.summary.difference).toBe('0.00');
    expect((await request(app).post(`/banking/reconciliations/${rec.body.id}/finalize`).set(treasurer)).status).toBe(200);
  });
});

describe('churches are kept apart', () => {
  it('will not show or touch another church statements, lines or reconciliations', async () => {
    await importRows([{ date: d(1, 6), description: 'Deposit', reference: 'K1', amount: '10.00' }]);
    const [line] = await lines();
    const other = await signUp('neighbour');
    expect((await request(app).get(`/banking/accounts/${bank.id}/lines`).set(other.admin)).status).toBe(404);
    expect((await request(app).post(`/banking/lines/${line.id}/ignore`).set(other.admin).send({ reason: 'not yours to touch' })).status).toBe(404);
    expect((await request(app).get(`/banking/lines/${line.id}/candidates`).set(other.admin)).status).toBe(404);
    const ob = await books(other.admin);
    const theirBank = (await request(app).get('/banking/accounts').set(other.admin)).body.find((a: any) => a.kind === 'BANK');
    const cross = await request(app).post(`/banking/accounts/${theirBank.id}/statements`).set(other.admin).send({ rows: [{ date: d(1, 6), description: 'x', reference: 'K1', amount: '10.00' }] });
    expect(cross.body.imported).toBe(1);
    expect((await request(app).post(`/banking/lines/${line.id}/create-entry`).set(other.admin).send({ accountId: ob.accounts['5350'], fundId: ob.funds.GEN })).status).toBe(404);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('refuses, in the database, to edit or delete a finalized reconciliation or one of its matches', async () => {
    await deposit('100.00', d(1, 5));
    await importRows([{ date: d(1, 6), description: 'Deposit', reference: 'D1', amount: '100.00' }]);
    await request(app).post(`/banking/accounts/${bank.id}/auto-match`).set(treasurer).send({ apply: true });
    const rec = await request(app).post(`/banking/accounts/${bank.id}/reconciliations`).set(treasurer).send({ statementDate: d(1, 31), statementBalance: '100.00', openingBalance: '0.00' });
    await request(app).post(`/banking/reconciliations/${rec.body.id}/finalize`).set(treasurer);
    const pg = (await import('pg')).default;
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    await expect(owner.query(`UPDATE reconciliations SET statement_balance_minor = 1 WHERE id = $1`, [rec.body.id])).rejects.toThrow(/immutable/);
    await expect(owner.query(`DELETE FROM reconciliations WHERE id = $1`, [rec.body.id])).rejects.toThrow(/cannot be deleted/);
    await expect(owner.query(`DELETE FROM bank_matches WHERE reconciliation_id = $1`, [rec.body.id])).rejects.toThrow(/cannot change/);
    await owner.end();
  });

  it('matches each ledger line at most once even when two requests race', async () => {
    await deposit('100.00', d(1, 5));
    await importRows([
      { date: d(1, 6), description: 'Deposit', reference: 'R1', amount: '100.00' },
      { date: d(1, 6), description: 'Deposit', reference: 'R2', amount: '100.00' }
    ]);
    const ids = (await lines()).map((l) => l.id);
    const ledger = (await ledgerLineIds())[0].lineId;
    const results = await Promise.all(ids.map((id) => request(app).post(`/banking/lines/${id}/match`).set(treasurer).send({ journalLineIds: [ledger] })));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

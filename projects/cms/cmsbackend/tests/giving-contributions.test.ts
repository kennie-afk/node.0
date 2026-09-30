import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { Church, balanceOf, books, day, member, signUp, userWithRole, year } from './giving-helpers';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
const app = createApp();
let church: Church;
let auth: { Authorization: string };

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  church = await signUp(app, 'giving');
  auth = church.admin;
});

const give = (body: Record<string, unknown>, headers = auth) =>
  request(app).post('/contributions').set(headers).send({ date: `${day(3)}T00:00:00Z`, ...body });

describe('a contribution is a ledger posting', () => {
  it('posts Dr cash, Cr income and hands out a receipt number', async () => {
    const who = await member(app, auth, 'Amina', 'Wanjiru');
    const res = await give({ memberId: who, amount: 500, contributionType: 'Tithe' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: '500.00', amountMinor: 50000, contributionType: 'Tithe', status: 'POSTED', receiptNo: 'RCT-000001', fundCode: 'GEN', source: 'MANUAL' });

    const entry = await request(app).get(`/finance/journal/${res.body.journalEntryId}`).set(auth);
    expect(entry.body.sourceType).toBe('CONTRIBUTION');
    expect(entry.body.lines.map((l: any) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1010', '500.00', '0.00'],
      ['4010', '0.00', '500.00']
    ]);
    expect(entry.body.lines[0].memberId).toBe(who);

    const second = await give({ memberId: who, amount: '25.50' });
    expect(second.body.receiptNo).toBe('RCT-000002');
    expect(second.body.contributionType).toBe('Offering');
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '500.00' });
    expect(await balanceOf(app, auth, '4020')).toEqual({ debit: '0.00', credit: '25.50' });
  });

  it('routes each giving type to its income account and fund, and M-Pesa gifts to the M-Pesa account', async () => {
    const { fund } = await books(app, auth);
    const building = await give({ amount: 1000, contributionType: 'Building Fund', contributorName: 'Visitor' });
    expect(building.body.fundId).toBe(fund('BLD'));
    const mpesa = await give({ amount: 200, paymentMethod: 'M-Pesa' });
    const entry = await request(app).get(`/finance/journal/${mpesa.body.journalEntryId}`).set(auth);
    expect(entry.body.lines[0].accountCode).toBe('1110');
    expect(await balanceOf(app, auth, '4040')).toEqual({ debit: '0.00', credit: '1000.00' });
  });

  it('refuses an unknown type, a non-asset deposit account, a missing amount and another church member', async () => {
    const { acct } = await books(app, auth);
    expect((await give({ amount: 5, contributionType: 'Nonsense' })).status).toBe(400);
    expect((await give({ amount: 5, depositAccountId: acct('4010') })).status).toBe(400);
    expect((await give({ contributionType: 'Tithe' })).status).toBe(400);
    expect((await give({ amount: 0 })).status).toBe(400);
    expect((await give({ amount: 1.005 })).status).toBe(400);
    const other = await signUp(app, 'elsewhere');
    const stranger = await member(app, other.admin, 'Jane', 'Otieno');
    expect((await give({ amount: 5, memberId: stranger })).status).toBe(400);
  });

  it('keeps a duplicate M-Pesa / transaction id out of the books', async () => {
    expect((await give({ amount: 5, transactionId: 'ABC123XYZ' })).status).toBe(201);
    expect((await give({ amount: 5, transactionId: 'ABC123XYZ' })).status).toBe(409);
    expect((await request(app).get('/finance/journal').set(auth)).body.data).toHaveLength(1);
  });

  it('rolls the whole request back when the ledger refuses (closed period), leaving no orphan gift', async () => {
    const years = (await request(app).get('/finance/fiscal-years').set(auth)).body;
    const jan = years[0].periods[0];
    expect((await request(app).post(`/finance/periods/${jan.id}/close`).set(auth)).status).toBe(200);
    const res = await request(app).post('/contributions').set(auth).send({ date: `${year}-01-15`, amount: 10 });
    expect(res.status).toBe(409);
    expect((await request(app).get('/contributions').set(auth)).body.total).toBe(0);
  });

  it('is replay-safe with an Idempotency-Key', async () => {
    const body = { date: day(3), amount: 40 };
    const a = await request(app).post('/giving/contributions').set(auth).set('Idempotency-Key', 'gift-0000-0001').send(body);
    const b = await request(app).post('/giving/contributions').set(auth).set('Idempotency-Key', 'gift-0000-0001').send(body);
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect((await request(app).get('/giving/contributions').set(auth)).body.data).toHaveLength(1);
  });
});

describe('voiding', () => {
  it('reverses the ledger entry, keeps the receipt on file, and refuses a second void, a delete, or a money edit', async () => {
    const posted = await give({ amount: 800, contributionType: 'Tithe' });
    expect((await request(app).put(`/contributions/${posted.body.id}`).set(auth).send({ amount: 900 })).status).toBe(409);
    expect((await request(app).put(`/contributions/${posted.body.id}`).set(auth).send({ notes: 'cheque no. 44' })).body.notes).toBe('cheque no. 44');
    expect((await request(app).delete(`/contributions/${posted.body.id}`).set(auth)).status).toBe(409);

    const voided = await request(app).post(`/giving/contributions/${posted.body.id}/void`).set(auth).send({ reason: 'entered twice' });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ status: 'VOID', voidReason: 'entered twice', receiptNo: 'RCT-000001' });
    expect(await balanceOf(app, auth, '4010')).toBeNull();
    expect(await balanceOf(app, auth, '1010')).toBeNull();
    expect((await request(app).post(`/giving/contributions/${posted.body.id}/void`).set(auth).send({ reason: 'again' })).status).toBe(409);
    expect((await request(app).get('/giving/receipts/RCT-000001').set(auth)).body.status).toBe('VOID');
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);

    // a voided receipt number is never reused
    expect((await give({ amount: 5 })).body.receiptNo).toBe('RCT-000002');
  });
});

describe('who may see and record giving', () => {
  it('lets a treasurer record, a pastor and auditor read, and everyone else nothing; churches never cross', async () => {
    const treasurer = await userWithRole(app, auth, 'tess', 'TREASURER');
    const pastor = await userWithRole(app, auth, 'pastor', 'PASTOR');
    const auditor = await userWithRole(app, auth, 'audrey', 'AUDITOR');
    const approver = await userWithRole(app, auth, 'appa', 'APPROVER');
    const plain = await userWithRole(app, auth, 'mike', 'MEMBER');
    const posted = await give({ amount: 10 }, treasurer);
    expect(posted.status).toBe(201);
    for (const reader of [pastor, auditor, approver, auth]) expect((await request(app).get(`/contributions/${posted.body.id}`).set(reader)).status).toBe(200);
    for (const denied of [pastor, auditor, approver, plain]) expect((await give({ amount: 1 }, denied)).status).toBe(403);
    expect((await request(app).get('/contributions').set(plain)).status).toBe(403);
    expect((await request(app).get('/giving/types').set(plain)).status).toBe(403);
    expect((await request(app).post(`/giving/contributions/${posted.body.id}/void`).set(auditor).send({ reason: 'nope nope' })).status).toBe(403);

    const other = await signUp(app, 'rival');
    expect((await request(app).get(`/contributions/${posted.body.id}`).set(other.admin)).status).toBe(404);
    expect((await request(app).post(`/giving/contributions/${posted.body.id}/void`).set(other.admin).send({ reason: 'sneaky' })).status).toBe(404);
    expect((await request(app).get('/giving/receipts/RCT-000001').set(other.admin)).status).toBe(404);
    expect((await request(app).get('/contributions').set(other.admin)).body.total).toBe(0);
  });
});

describe('listing and statements', () => {
  it('pages by cursor and offset with filters', async () => {
    const who = await member(app, auth, 'Brian', 'Otieno');
    for (let i = 1; i <= 7; i += 1) await request(app).post('/contributions').set(auth).send({ date: day(3, i), amount: i * 10, memberId: who, contributionType: i % 2 ? 'Tithe' : 'Offering' });
    const first = await request(app).get('/giving/contributions?limit=3').set(auth);
    const second = await request(app).get(`/giving/contributions?limit=3&cursor=${first.body.nextCursor}`).set(auth);
    const third = await request(app).get(`/giving/contributions?limit=3&cursor=${second.body.nextCursor}`).set(auth);
    const ids = [...first.body.data, ...second.body.data, ...third.body.data].map((r: any) => r.id);
    expect(new Set(ids).size).toBe(7);
    expect(third.body.nextCursor).toBeNull();
    const tithes = await request(app).get('/giving/contributions?type=tithe').set(auth);
    expect(tithes.body.data).toHaveLength(4);
    const legacy = await request(app).get('/contributions?page=2&pageSize=3').set(auth);
    expect(legacy.body).toMatchObject({ page: 2, pageSize: 3, total: 7, totalPages: 3 });
    expect(legacy.body.data[0].member.firstName).toBe('Brian');
  });

  it('builds a yearly member statement from posted gifts only, with the deductible total', async () => {
    const who = await member(app, auth, 'Amina', 'Wanjiru');
    await give({ memberId: who, amount: 1000, contributionType: 'Tithe' });
    await give({ memberId: who, amount: 5000, contributionType: 'Building Fund' });
    const dropped = await give({ memberId: who, amount: 700, contributionType: 'Missions' });
    await request(app).post(`/giving/contributions/${dropped.body.id}/void`).set(auth).send({ reason: 'bounced' });
    await request(app).post('/contributions').set(auth).send({ memberId: who, amount: 300, date: `${year - 1}-12-20` });
    const statement = await request(app).get(`/giving/statements/members/${who}?year=${year}`).set(auth);
    expect(statement.status).toBe(200);
    expect(statement.body).toMatchObject({ year, total: '6000.00', taxDeductibleTotal: '5000.00', giftCount: 2, currency: 'KES' });
    expect(statement.body.byType).toEqual(expect.arrayContaining([{ type: 'Tithe', amount: '1000.00' }, { type: 'Building Fund', amount: '5000.00' }]));
    expect(statement.body.gifts.map((g: any) => g.receiptNo)).toEqual(['RCT-000001', 'RCT-000002']);
    expect((await request(app).get(`/giving/statements/members/${who}?year=${year - 1}`).set(auth)).body.total).toBe('300.00');
  });

  it('lets a church add a giving type of its own and refuses a duplicate', async () => {
    const { acct } = await books(app, auth);
    const made = await request(app).post('/giving/types').set(auth).send({ code: 'FIRSTFRUITS', name: 'First Fruits', incomeAccountId: acct('4060'), taxDeductible: false });
    expect(made.status).toBe(201);
    expect((await request(app).post('/giving/types').set(auth).send({ code: 'FIRSTFRUITS', name: 'Other', incomeAccountId: acct('4060') })).status).toBe(409);
    expect((await request(app).post('/giving/types').set(auth).send({ code: 'BAD', name: 'Bad', incomeAccountId: acct('1010') })).status).toBe(400);
    expect((await give({ amount: 12, contributionType: 'first fruits' })).body.contributionType).toBe('First Fruits');
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('hands out gapless, unique receipt numbers to 25 gifts recorded at the same instant', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => give({ amount: 10 + i, transactionId: `CONC${i}` })));
    expect(results.map((r) => r.status)).toEqual(Array(25).fill(201));
    const numbers = results.map((r) => Number(r.body.receiptNo.split('-')[1])).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);
  });

  it('shows one church nothing of another, even through a hand-written query', async () => {
    await give({ amount: 10 });
    const other = await signUp(app, 'rival');
    const { runAsTenant } = await import('../src/common/tenant-run');
    const { requestTx } = await import('../src/common/http');
    const { select } = await import('../src/modules/finance/sql');
    const rows = await runAsTenant(other.id, async () => select(await requestTx(), 'SELECT * FROM contribution'));
    expect(rows).toHaveLength(0);
    const types = await runAsTenant(other.id, async () => select(await requestTx(), 'SELECT * FROM giving_types WHERE church_id = ?', [church.id]));
    expect(types).toHaveLength(0);
  });
});

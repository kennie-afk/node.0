import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import db from '@models';
import { createApp } from '../src/app';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';
import { generateDueRecurringGifts } from '../src/modules/giving/recurring.service';
import { dueDate, installmentsDue } from '../src/modules/giving/shared';
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
  church = await signUp(app, 'flows');
  auth = church.admin;
});

describe('counting batches with dual control', () => {
  async function openBatch(amounts: Array<[string, number, number?]>) {
    const batch = await request(app).post('/giving/batches').set(auth).send({ name: 'Sunday 10am service', serviceDate: day(3, 2) });
    expect(batch.status).toBe(201);
    for (const [type, amount, memberId] of amounts) {
      const item = await request(app).post(`/giving/batches/${batch.body.id}/items`).set(auth).send({ contributionType: type, amount, memberId });
      expect(item.status).toBe(201);
      expect(item.body).toMatchObject({ status: 'PENDING', receiptNo: null, journalEntryId: null });
    }
    return batch.body.id as number;
  }

  it('posts nothing until a second person verifies, then posts ONE entry and numbers every gift', async () => {
    const who = await member(app, auth, 'Amina', 'Wanjiru');
    const treasurer = await userWithRole(app, auth, 'tess', 'TREASURER');
    const id = await openBatch([['Tithe', 1000, who], ['Tithe', 500], ['Offering', 250], ['Building Fund', 2000]]);
    expect(await balanceOf(app, auth, '4010')).toBeNull();

    const counted = await request(app).post(`/giving/batches/${id}/count`).set(auth).send({ countedTotal: '3750.00' });
    expect(counted.body).toMatchObject({ status: 'COUNTED', itemsTotal: '3750.00', countedTotal: '3750.00', variance: '0.00', itemCount: 4 });
    expect((await request(app).post(`/giving/batches/${id}/items`).set(auth).send({ amount: 5 })).status).toBe(409);

    const self = await request(app).post(`/giving/batches/${id}/verify`).set(auth);
    expect(self.status).toBe(403);
    expect(await balanceOf(app, auth, '4010')).toBeNull();

    const verified = await request(app).post(`/giving/batches/${id}/verify`).set(treasurer);
    expect(verified.status).toBe(200);
    expect(verified.body.status).toBe('POSTED');
    const entry = await request(app).get(`/finance/journal/${verified.body.journalEntryId}`).set(auth);
    expect(entry.body.sourceType).toBe('GIVING_BATCH');
    // three income accounts + two funds' cash lines = one aggregated entry, not four
    expect(entry.body.lines).toHaveLength(5);
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '1500.00' });
    expect(await balanceOf(app, auth, '4040')).toEqual({ debit: '0.00', credit: '2000.00' });

    const detail = await request(app).get(`/giving/batches/${id}`).set(auth);
    expect(detail.body.items.map((i: any) => i.receiptNo)).toEqual(['RCT-000001', 'RCT-000002', 'RCT-000003', 'RCT-000004']);
    expect((await request(app).post(`/giving/batches/${id}/verify`).set(treasurer)).status).toBe(409);
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);
  });

  it('refuses to verify a count that does not match, and lets the batch be reopened and corrected', async () => {
    const treasurer = await userWithRole(app, auth, 'tess', 'TREASURER');
    const id = await openBatch([['Offering', 100], ['Offering', 50]]);
    const counted = await request(app).post(`/giving/batches/${id}/count`).set(auth).send({ countedTotal: 140 });
    expect(counted.body.variance).toBe('-10.00');
    const mismatch = await request(app).post(`/giving/batches/${id}/verify`).set(treasurer);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.message).toMatch(/does not match/);
    expect((await request(app).post(`/giving/batches/${id}/reopen`).set(auth)).body.status).toBe('OPEN');
    const items = (await request(app).get(`/giving/batches/${id}`).set(auth)).body.items;
    expect((await request(app).delete(`/giving/batches/${id}/items/${items[1].id}`).set(auth)).status).toBe(204);
    await request(app).post(`/giving/batches/${id}/count`).set(auth).send({ countedTotal: 100 });
    expect((await request(app).post(`/giving/batches/${id}/verify`).set(treasurer)).body.status).toBe('POSTED');
  });

  it('can void one gift of a posted batch with a compensating entry for just that gift', async () => {
    const treasurer = await userWithRole(app, auth, 'tess', 'TREASURER');
    const id = await openBatch([['Tithe', 1000], ['Tithe', 400]]);
    await request(app).post(`/giving/batches/${id}/count`).set(auth).send({ countedTotal: 1400 });
    await request(app).post(`/giving/batches/${id}/verify`).set(treasurer);
    const items = (await request(app).get(`/giving/batches/${id}`).set(auth)).body.items;
    const voided = await request(app).post(`/giving/contributions/${items[1].id}/void`).set(auth).send({ reason: 'bounced cheque' });
    expect(voided.body.status).toBe('VOID');
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '1000.00' });
    expect((await request(app).get('/finance/integrity').set(auth)).body.ok).toBe(true);
  });

  it('allows one person to do it all only if the church has switched separation of duties off', async () => {
    const id = await openBatch([['Offering', 60]]);
    await request(app).post(`/giving/batches/${id}/count`).set(auth).send({ countedTotal: 60 });
    expect((await request(app).post(`/giving/batches/${id}/verify`).set(auth)).status).toBe(403);
    await request(app).put('/finance/settings').set(auth).send({ requireSeparationOfDuties: false });
    expect((await request(app).post(`/giving/batches/${id}/verify`).set(auth)).body.status).toBe('POSTED');
  });

  it('cannot count an empty batch', async () => {
    const batch = await request(app).post('/giving/batches').set(auth).send({ name: 'Empty', serviceDate: day(3, 2) });
    expect((await request(app).post(`/giving/batches/${batch.body.id}/count`).set(auth).send({ countedTotal: 10 })).status).toBe(400);
  });
});

describe('campaigns and pledges', () => {
  it('tracks fulfilment, outstanding, progress and campaign totals from posted gifts', async () => {
    const who = await member(app, auth, 'Brian', 'Otieno');
    const { fund } = await books(app, auth);
    const campaign = await request(app).post('/giving/campaigns').set(auth).send({ name: 'New sanctuary', goal: 100000, startDate: day(1, 1), fundId: fund('BLD') });
    expect(campaign.status).toBe(201);
    const pledge = await request(app).post('/giving/pledges').set(auth).send({ memberId: who, campaignId: campaign.body.id, amount: 12000, installment: 1000, frequency: 'MONTHLY', startDate: day(1, 1) });
    expect(pledge.status).toBe(201);
    expect(pledge.body).toMatchObject({ amount: '12000.00', fulfilled: '0.00', outstanding: '12000.00', status: 'ACTIVE' });
    expect(Number(pledge.body.dueToDate)).toBeGreaterThan(0);

    const gift = await request(app).post('/contributions').set(auth).send({ date: day(1, 5), amount: 4500, pledgeId: pledge.body.id, contributionType: 'Building Fund' });
    expect(gift.status).toBe(201);
    expect(gift.body).toMatchObject({ memberId: who, campaignId: campaign.body.id, pledgeId: pledge.body.id });
    const after = (await request(app).get(`/giving/pledges/${pledge.body.id}`).set(auth)).body;
    expect(after).toMatchObject({ fulfilled: '4500.00', outstanding: '7500.00', progressBasisPoints: 3750, status: 'ACTIVE' });

    const progress = (await request(app).get(`/giving/campaigns/${campaign.body.id}`).set(auth)).body;
    expect(progress).toMatchObject({ raised: '4500.00', pledged: '12000.00', goal: '100000.00', progressBasisPoints: 450, remaining: '95500.00', donorCount: 1 });

    // completing the pledge flips it to FULFILLED; voiding a gift flips it back
    const rest = await request(app).post('/contributions').set(auth).send({ date: day(2, 5), amount: 7500, pledgeId: pledge.body.id, contributionType: 'Building Fund' });
    expect((await request(app).get(`/giving/pledges/${pledge.body.id}`).set(auth)).body.status).toBe('FULFILLED');
    await request(app).post(`/giving/contributions/${rest.body.id}/void`).set(auth).send({ reason: 'mistake' });
    expect((await request(app).get(`/giving/pledges/${pledge.body.id}`).set(auth)).body).toMatchObject({ status: 'ACTIVE', fulfilled: '4500.00' });
  });

  it('refuses gifts to a cancelled pledge and pledges for strangers, and reports who is behind', async () => {
    const who = await member(app, auth, 'Carol', 'Mwangi');
    const pledge = await request(app).post('/giving/pledges').set(auth).send({ memberId: who, amount: 6000, installment: 500, frequency: 'MONTHLY', startDate: `${year - 1}-01-01` });
    const behind = await request(app).get('/giving/pledges?behindOnly=true').set(auth);
    expect(behind.body.data.map((p: any) => p.id)).toContain(pledge.body.id);
    await request(app).post(`/giving/pledges/${pledge.body.id}/cancel`).set(auth).send({ reason: 'moved away' });
    expect((await request(app).post('/contributions').set(auth).send({ date: day(3), amount: 5, pledgeId: pledge.body.id })).status).toBe(400);
    expect((await request(app).get('/giving/pledges?behindOnly=true').set(auth)).body.data).toHaveLength(0);
    const other = await signUp(app, 'elsewhere');
    expect((await request(app).post('/giving/pledges').set(other.admin).send({ memberId: who, amount: 10, startDate: day(1, 1) })).status).toBe(400);
    expect((await request(app).get(`/giving/pledges/${pledge.body.id}`).set(other.admin)).status).toBe(404);
  });

  it('computes installment due dates from the start, without month-end drift', () => {
    expect(dueDate('2026-01-31', 'MONTHLY', 1)).toBe('2026-02-28');
    expect(dueDate('2026-01-31', 'MONTHLY', 2)).toBe('2026-03-31');
    expect(dueDate('2026-01-01', 'WEEKLY', 2)).toBe('2026-01-15');
    expect(dueDate('2024-02-29', 'ANNUAL', 1)).toBe('2025-02-28');
    expect(installmentsDue('2026-01-01', 'MONTHLY', '2026-03-15')).toBe(3);
    expect(installmentsDue('2026-01-01', 'MONTHLY', '2026-03-15', '2026-02-10')).toBe(2);
    expect(installmentsDue('2026-06-01', 'MONTHLY', '2026-03-15')).toBe(0);
  });
});

describe('recurring gifts', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const monthsAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 10);
  };

  it('creates each due gift exactly once, however often it is run', async () => {
    const who = await member(app, auth, 'Dan', 'Kamau');
    const { fund } = await books(app, auth);
    const types = (await request(app).get('/giving/types').set(auth)).body;
    const tithe = types.find((t: any) => t.code === 'TITHE').id;
    const created = await request(app).post('/giving/recurring').set(auth).send({ memberId: who, givingTypeId: tithe, amount: 2500, frequency: 'MONTHLY', startDate: monthsAgo(2), fundId: fund('GEN') });
    expect(created.status).toBe(201);

    const first = await request(app).post('/giving/recurring/run').set(auth).send({});
    expect(first.body).toMatchObject({ generated: 3, failed: [] });
    const second = await request(app).post('/giving/recurring/run').set(auth).send({});
    expect(second.body.generated).toBe(0);
    const gifts = (await request(app).get('/giving/contributions?source=RECURRING').set(auth)).body.data;
    expect(gifts).toHaveLength(3);
    expect(new Set(gifts.map((g: any) => g.transactionId)).size).toBe(3);
    expect(await balanceOf(app, auth, '4010')).toEqual({ debit: '0.00', credit: '7500.00' });
    const schedule = (await request(app).get(`/giving/recurring/${created.body.id}`).set(auth)).body;
    expect(schedule.nextDueDate > today()).toBe(true);

    const paused = await request(app).put(`/giving/recurring/${created.body.id}`).set(auth).send({ status: 'PAUSED' });
    expect(paused.body.status).toBe('PAUSED');
  });

  it.runIf(onPostgres)('does not double-create when two workers run at the same moment', async () => {
    const who = await member(app, auth, 'Eve', 'Njoroge');
    const types = (await request(app).get('/giving/types').set(auth)).body;
    await request(app).post('/giving/recurring').set(auth).send({ memberId: who, givingTypeId: types[0].id, amount: 100, frequency: 'WEEKLY', startDate: monthsAgo(1) });
    const run = () => runAsTenant(church.id, async () => generateDueRecurringGifts(await requestTx(), church.id, today())).catch((e) => ({ error: String(e) }));
    const results = await Promise.all([run(), run()]);
    const total = (await request(app).get('/giving/contributions?source=RECURRING&limit=200').set(auth)).body.data;
    const distinct = new Set(total.map((g: any) => g.transactionId));
    expect(distinct.size).toBe(total.length);
    expect(total.length).toBeGreaterThanOrEqual(4);
    expect(results.filter((r: any) => r.error).length).toBeLessThanOrEqual(1);
  });

  it('reports a schedule it cannot post, leaves it due, and still serves the others', async () => {
    const who = await member(app, auth, 'Fay', 'Achieng');
    const types = (await request(app).get('/giving/types').set(auth)).body;
    await request(app).post('/giving/recurring').set(auth).send({ memberId: who, givingTypeId: types[0].id, amount: 100, frequency: 'MONTHLY', startDate: `${year}-01-05` });
    const years = (await request(app).get('/finance/fiscal-years').set(auth)).body;
    await request(app).post(`/finance/periods/${years[0].periods[0].id}/close`).set(auth);
    const run = await request(app).post('/giving/recurring/run').set(auth).send({ asOf: `${year}-02-20` });
    expect(run.body.generated).toBe(0);
    expect(run.body.failed).toHaveLength(1);
    const schedule = (await request(app).get('/giving/recurring').set(auth)).body[0];
    expect(schedule.nextDueDate).toBe(`${year}-01-05`);
    expect(schedule.status).toBe('ACTIVE');
  });
});

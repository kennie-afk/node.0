import { afterAll, describe, expect, it, vi } from 'vitest';
import { assertLedgerBalanced, assertLoanBookAgrees, boot, fullStaff, get, lendUntil, makeMember, makeProduct, newTenant, nairobiDay, on, patch, post, shutdown } from './helpers';
import { trialByCode } from './mpesa-helpers';
import { runPenalties } from '../src/loans/service';
import { runDailyForOrg, lockKey } from '../src/loans/scheduler';

vi.setConfig({ testTimeout: 180_000 });
afterAll(shutdown);

const K = (n: number) => n * 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type Row = { dueDate: string; interestCents: number; paidInterestCents: number; principalCents: number; paidPrincipalCents: number };

async function detail(auth: { Authorization: string }, id: string) {
  return (await get(auth, `/v1/loans/${id}`)).body;
}

describe.runIf(on)('interest accrual (real Postgres)', () => {
  it('accrues each instalment once when it falls due, clears the receivable on repayment, and recognises early-paid interest on receipt', async () => {
    const t = await newTenant('Accrual');
    const s = await fullStaff(t);
    const m = await makeMember(t.owner.auth);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 0 });
    const id = await lendUntil(s, m.id, p, K(12_000), 6, 'disbursed', nairobiDay(-75));
    const before = await detail(t.owner.auth, id);
    const due = (before.schedule as Row[]).filter((r) => r.dueDate <= before.asOf);
    expect(due).toHaveLength(2);
    const interestDue = sum(due.map((r) => r.interestCents));

    const run = await post(s.accountant.auth, '/v1/interest-accrual/run');
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ installments: 2, accruedCents: interestDue });
    expect((await post(s.accountant.auth, '/v1/interest-accrual/run')).body).toMatchObject({ installments: 0, accruedCents: 0 });
    let tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1120']).toBe(interestDue);
    expect(tb.byCode['4100']).toBe(-interestDue);
    expect(tb.totalDebit).toBe(tb.totalCredit);

    // paying the first instalment clears receivable, not income: income was already booked at accrual
    const first = before.schedule[0];
    const pay = await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: first.principalCents + first.interestCents, channel: 'cash' });
    expect(pay.body).toMatchObject({ interestCents: first.interestCents, principalCents: first.principalCents });
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1120']).toBe(interestDue - first.interestCents);
    expect(tb.byCode['4100']).toBe(-interestDue);
    await assertLoanBookAgrees(t);

    // paying everything that is left, including instalments not yet due, recognises that interest on receipt
    const mid = await detail(t.owner.auth, id);
    const all = await post(s.teller.auth, `/v1/loans/${id}/repay`, { amountCents: mid.outstandingTotalCents, channel: 'cash' });
    expect(all.body.closed).toBe(true);
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1120'] ?? 0).toBe(0);
    const fullInterest = sum((before.schedule as Row[]).map((r) => r.interestCents));
    expect(tb.byCode['4100']).toBe(-fullInterest);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    await assertLedgerBalanced(t);
  });

  it('takes accrued, unpaid interest off the receivable when a loan is written off or restructured', async () => {
    const t = await newTenant('Accrual Exits');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 0 });
    const a = await makeMember(t.owner.auth);
    const b = await makeMember(t.owner.auth);
    const bad = await lendUntil(s, a.id, p, K(9_000), 3, 'disbursed', nairobiDay(-200));
    const slow = await lendUntil(s, b.id, p, K(12_000), 6, 'disbursed', nairobiDay(-75));
    expect((await post(s.accountant.auth, '/v1/interest-accrual/run')).body.installments).toBe(5);
    let tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1120']).toBeGreaterThan(0);

    expect((await post(s.manager.auth, `/v1/loans/${bad}/write-off`, { note: 'gone' })).status).toBe(200);
    tb = await trialByCode(t.owner.auth);
    const slowDetail = await detail(t.owner.auth, slow);
    const slowAccrued = sum((slowDetail.schedule as Row[]).filter((r) => r.dueDate <= slowDetail.asOf).map((r) => r.interestCents - r.paidInterestCents));
    expect(tb.byCode['1120']).toBe(slowAccrued);
    expect(tb.totalDebit).toBe(tb.totalCredit);

    expect((await post(s.manager.auth, `/v1/loans/${slow}/restructure`, { newTermMonths: 6, note: 'hardship' })).status).toBe(201);
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1120'] ?? 0).toBe(0);
    // the written-off loan's interest was reversed and the restructured loan's waived: no interest income is left from either
    expect(tb.byCode['4100'] ?? 0).toBe(0);
    await assertLedgerBalanced(t);
  });
});

describe.runIf(on)('the penalty run and the daily jobs (real Postgres)', () => {
  it('works in batches, charges each instalment once, skips a loan a repayment holds, and picks it up next time', async () => {
    const t = await newTenant('Penalty Batches');
    const s = await fullStaff(t);
    const { pool } = await boot();
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 500 });
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(6_000), 3, 'disbursed', nairobiDay(-70)));
    const asOf = nairobiDay();

    // a repayment is in flight on loan 0: its row lock is held while the run goes through the book
    const first = await runWhileLocked(pool, t.orgId, ids[0]!, () => runPenalties(t.orgId, t.owner.id, asOf, { batchSize: 2 }));
    expect(first.batches).toBe(3);
    expect(first.loansSeen).toBe(5);
    expect(first.skippedBusy).toBe(1);
    // each other loan has one overdue instalment (due about 40 days ago) and, if the second is also past, two
    const charged = await Promise.all(ids.slice(1).map(async (id) => sum(((await detail(t.owner.auth, id)).schedule as Array<{ penaltyCents: number }>).map((r) => r.penaltyCents))));
    expect(sum(charged)).toBe(first.totalCents);
    expect(first.totalCents).toBeGreaterThan(0);
    expect(sum(((await detail(t.owner.auth, ids[0]!)).schedule as Array<{ penaltyCents: number }>).map((r) => r.penaltyCents))).toBe(0);

    const second = await runPenalties(t.orgId, t.owner.id, asOf, { batchSize: 2 });
    expect(second.skippedBusy).toBe(0);
    expect(second.charged).toBeGreaterThan(0);
    const third = await runPenalties(t.orgId, t.owner.id, asOf, { batchSize: 2 });
    expect(third).toMatchObject({ charged: 0, totalCents: 0 });
    // one journal entry per loan per run, and the ledger agrees with the schedules
    const entries = await pool.withOrg(t.orgId, async (c) => Number((await c.query(`SELECT count(*)::int AS n FROM journal_entries WHERE source_type = 'loan_penalty'`)).rows[0].n));
    expect(entries).toBe(5);
    const tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1110']).toBe(first.totalCents + second.totalCents);
    expect(tb.byCode['4200']).toBe(-(first.totalCents + second.totalCents));
    await assertLedgerBalanced(t);
  });

  it('runs the daily jobs once a day per organisation, under an advisory lock, and a repeat adds nothing', async () => {
    const t = await newTenant('Daily');
    const s = await fullStaff(t);
    const { pool } = await boot();
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 500 });
    await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(6_000), 3, 'disbursed', nairobiDay(-70));
    const day = nairobiDay();

    // another instance holds this organisation's lock: skip, do nothing
    const [k1, k2] = lockKey(t.orgId);
    const holder = await pool.pool.connect();
    await holder.query('SELECT pg_advisory_lock($1, $2)', [k1, k2]);
    try {
      expect(await runDailyForOrg(t.orgId, day)).toBe('skipped');
    } finally {
      await holder.query('SELECT pg_advisory_unlock($1, $2)', [k1, k2]);
      holder.release();
    }
    expect((await trialByCode(t.owner.auth)).byCode['1110'] ?? 0).toBe(0);

    expect(await runDailyForOrg(t.orgId, day)).toBe('ran');
    const afterFirst = await trialByCode(t.owner.auth);
    expect(afterFirst.byCode['1110']).toBeGreaterThan(0);
    expect(afterFirst.byCode['1120']).toBeGreaterThan(0);
    expect(await runDailyForOrg(t.orgId, day)).toBe('skipped');
    expect(await runDailyForOrg(t.orgId, day, { force: true })).toBe('ran');
    expect(await trialByCode(t.owner.auth)).toEqual(afterFirst);
    await assertLedgerBalanced(t);
  });
});

/** Holds a FOR UPDATE lock on one loan in its own transaction while `during` runs, then releases it. */
async function runWhileLocked<T>(pool: Awaited<ReturnType<typeof boot>>['pool'], orgId: string, loanId: string, during: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let locked!: () => void;
  const ready = new Promise<void>((resolve) => { locked = resolve; });
  const holder = pool.withOrg(orgId, async (c) => {
    await c.query('SELECT 1 FROM loans WHERE id = $1 FOR UPDATE', [loanId]);
    locked();
    await held;
  });
  await ready;
  try {
    return await during();
  } finally {
    release();
    await holder;
  }
}

describe.runIf(on)('loan loss provisioning (real Postgres)', () => {
  it('requires the configured percentage of each ageing bucket, posts only the difference, and releases when a loan is repaid', async () => {
    const t = await newTenant('Provision');
    const s = await fullStaff(t);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200, penaltyRateBp: 0 });
    expect((await patch(t.owner.auth, '/v1/settings', { provisionRatesBp: { current: 0, '1-30': 1000, '31-60': 3000 } })).status).toBe(200);
    const a = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(10_000), 6, 'disbursed', nairobiDay(-40)); // oldest unpaid ~10 days late
    const b = await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(20_000), 6, 'disbursed', nairobiDay(-75)); // oldest unpaid ~45 days late
    await lendUntil(s, (await makeMember(t.owner.auth)).id, p, K(5_000), 6, 'disbursed', nairobiDay()); // current
    await post(s.accountant.auth, '/v1/interest-accrual/run');

    const exposure = async (id: string) => {
      const d = await detail(t.owner.auth, id);
      return d.outstandingPrincipalCents + sum((d.schedule as Row[]).filter((r) => r.dueDate <= d.asOf).map((r) => r.interestCents - r.paidInterestCents));
    };
    const expA = await exposure(a);
    const expB = await exposure(b);
    const required = Math.round(expA * 0.1) + Math.round(expB * 0.3);

    const preview = (await get(s.accountant.auth, '/v1/provisioning')).body;
    expect(preview.notice).toMatch(/NOT regulatory guidance/);
    expect(preview.preview.requiredCents).toBe(required);
    expect(preview.preview.buckets.find((x: { bucket: string }) => x.bucket === '1-30')).toMatchObject({ loans: 1, exposureCents: expA, requiredCents: Math.round(expA * 0.1) });
    expect(preview.preview.buckets.find((x: { bucket: string }) => x.bucket === '31-60')).toMatchObject({ loans: 1, exposureCents: expB });
    expect(preview.preview.buckets.find((x: { bucket: string }) => x.bucket === 'current')).toMatchObject({ loans: 1, requiredCents: 0 });

    const run = await post(s.accountant.auth, '/v1/provisioning/run');
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ requiredCents: required, adjustmentCents: required, heldBeforeCents: 0 });
    let tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1190']).toBe(-required);
    expect(tb.byCode['5150']).toBe(required);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const again = await post(s.accountant.auth, '/v1/provisioning/run');
    expect(again.body).toMatchObject({ adjustmentCents: 0, journalSeq: null });

    // loan A is repaid in full: its slice of the provision is released
    expect((await post(s.teller.auth, `/v1/loans/${a}/repay`, { amountCents: (await detail(t.owner.auth, a)).outstandingTotalCents, channel: 'cash' })).body.closed).toBe(true);
    const release = await post(s.accountant.auth, '/v1/provisioning/run');
    expect(release.body.adjustmentCents).toBe(-Math.round(expA * 0.1));
    tb = await trialByCode(t.owner.auth);
    expect(tb.byCode['1190']).toBe(-(required - Math.round(expA * 0.1)));
    await assertLedgerBalanced(t);
    expect((await post(s.teller.auth, '/v1/provisioning/run')).status).toBe(403);
  });
});

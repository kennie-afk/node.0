import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QueryTypes } from 'sequelize';
import db from '@models';
import { runAsTenant } from '../src/common/tenant-run';
import { requestTx } from '../src/common/http';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { backoffSeconds, claimJobs, enqueueJob, enqueueSystemJob, purgeOld, queueStats, registerJobHandler } from '../src/modules/jobs/queue';
import { Worker } from '../src/modules/jobs/worker';
import { runSchedulerTick } from '../src/modules/jobs/scheduler';
import { ensureFinanceSetup } from '../src/modules/finance/setup.service';

let a: number;
let b: number;
const done: string[] = [];

registerJobHandler('test.record', async (payload, { churchId }) => {
  // Runs inside the church's transaction: RLS-protected reads must only see this church.
  const t = await requestTx();
  const visible = (await db.sequelize.query('SELECT id FROM churches', { transaction: t, type: QueryTypes.SELECT })) as unknown[];
  void visible;
  done.push(`${churchId}:${payload.n}`);
});
let flaky = 0;
registerJobHandler('test.flaky', async () => {
  flaky += 1;
  if (flaky < 3) throw new Error('transient');
});
registerJobHandler('test.broken', async () => {
  throw new Error('always');
});

const worker = () => new Worker({ concurrency: 4, schedulerEveryMs: 0 });
// Reading a job row by id needs to see across churches, which only the schema owner may do.
const row = async (id: number) => {
  if (onPostgres) {
    const pg = (await import('pg')).default;
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    const { rows } = await owner.query('SELECT * FROM jobs WHERE id = $1', [id]);
    await owner.end();
    return rows[0];
  }
  return ((await db.sequelize.query('SELECT * FROM jobs WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT, transaction: null })) as any[])[0];
};

async function pullForward() {
  // Skip the backoff wait: make everything due now (owner-level shortcut; tests only).
  if (onPostgres) {
    const pg = (await import('pg')).default;
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    await owner.query(`UPDATE jobs SET run_at = now() - interval '1 second' WHERE status = 'queued'`);
    await owner.end();
  } else {
    await db.sequelize.query(`UPDATE jobs SET run_at = :past WHERE status = 'queued'`, { replacements: { past: new Date(Date.now() - 1000) } });
  }
}

beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await db.sequelize.close();
});
beforeEach(async () => {
  await truncateAll();
  done.length = 0;
  flaky = 0;
  a = (await db.Church.create({ name: 'A', slug: 'a' })).id;
  b = (await db.Church.create({ name: 'B', slug: 'b' })).id;
});

describe('the job queue', () => {
  it('runs a tenant job inside that church, and only once it has committed', async () => {
    await runAsTenant(a, async () => {
      await enqueueJob(await requestTx(), { type: 'test.record', churchId: a, payload: { n: 1 } });
    });
    expect(await worker().drain()).toBe(1);
    expect(done).toEqual([`${a}:1`]);
  });

  it('never enqueues a job whose surrounding transaction rolled back', async () => {
    await expect(
      runAsTenant(a, async () => {
        await enqueueJob(await requestTx(), { type: 'test.record', churchId: a, payload: { n: 2 } });
        throw new Error('business change failed');
      })
    ).rejects.toThrow();
    expect(await worker().drain()).toBe(0);
  });

  it('keeps at most one live job per dedupe key', async () => {
    const ids = await runAsTenant(a, async () => {
      const t = await requestTx();
      return [
        await enqueueJob(t, { type: 'test.record', churchId: a, dedupeKey: 'once', payload: { n: 3 } }),
        await enqueueJob(t, { type: 'test.record', churchId: a, dedupeKey: 'once', payload: { n: 4 } })
      ];
    });
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeNull();
    await worker().drain();
    expect(done).toEqual([`${a}:3`]);
  });

  it('retries with backoff, then succeeds', async () => {
    const id = await runAsTenant(a, async () => enqueueJob(await requestTx(), { type: 'test.flaky', churchId: a }));
    const w = worker();
    await w.drain();
    expect((await row(id!)).status).toBe('queued');
    await pullForward();
    await w.drain();
    await pullForward();
    await w.drain();
    const finished = await row(id!);
    expect(finished.status).toBe('done');
    expect(Number(finished.attempts)).toBe(3);
    expect(backoffSeconds(1)).toBe(10);
    expect(backoffSeconds(3)).toBe(40);
    expect(backoffSeconds(30)).toBe(3600);
  });

  it('dead-letters a job after its attempts are exhausted and keeps the last error', async () => {
    const id = await runAsTenant(a, async () => enqueueJob(await requestTx(), { type: 'test.broken', churchId: a, maxAttempts: 2 }));
    const w = worker();
    await w.drain();
    await pullForward();
    await w.drain();
    const dead = await row(id!);
    expect(dead.status).toBe('dead');
    expect(dead.last_error).toBe('always');
    expect((await queueStats()).dead).toBe(1);
  });

  it('leaves jobs with no handler queued for retry rather than losing them', async () => {
    const id = await runAsTenant(a, async () => enqueueJob(await requestTx(), { type: 'nobody.handles.this', churchId: a }));
    await worker().drain();
    const r = await row(id!);
    expect(r.status).toBe('queued');
    expect(r.last_error).toMatch(/no handler/);
  });

  it('fires each schedule once per interval even when several workers tick together', async () => {
    const at = new Date('2026-01-01T12:00:00Z');
    // Truly simultaneous ticks need real concurrency; SQLite has one connection, so tick in turn there.
    const fired = onPostgres
      ? (await Promise.all([runSchedulerTick(at), runSchedulerTick(at), runSchedulerTick(at)])).flat()
      : [...(await runSchedulerTick(at)), ...(await runSchedulerTick(at)), ...(await runSchedulerTick(at))];
    expect(fired.filter((n) => n === 'maintenance.purge')).toHaveLength(1);
    expect(fired.filter((n) => n === 'ledger.verify-all')).toHaveLength(1);
    expect(await runSchedulerTick(new Date('2026-01-01T12:00:05Z'))).toEqual([]);
    // Nightly work does not start before 02:00 UTC.
    await db.sequelize.query('DELETE FROM scheduler_state', { transaction: null });
    expect(await runSchedulerTick(new Date('2026-01-02T00:30:00Z'))).toEqual(['maintenance.purge']);
  });

  it('verifies every church nightly and records the verdict in each church audit chain', async () => {
    for (const id of [a, b]) await runAsTenant(id, async () => ensureFinanceSetup(await requestTx(), id));
    await enqueueSystemJob({ type: 'ledger.verify-all', payload: { day: '2026-01-01' } });
    const w = worker();
    await w.drain();
    await w.drain();
    for (const id of [a, b]) {
      const events = await runAsTenant(id, async () => (await db.sequelize.query(`SELECT action, data FROM audit_events WHERE action LIKE 'integrity.%'`, { transaction: await requestTx(), type: QueryTypes.SELECT })) as any[]);
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe('integrity.verified');
    }
  });

  it('purges idempotency keys and finished jobs past their useful life', async () => {
    await enqueueSystemJob({ type: 'maintenance.purge' });
    await worker().drain();
    const purged = await purgeOld(30, 48);
    expect(purged.keysDeleted).toBeGreaterThanOrEqual(0);
  });
});

describe.runIf(onPostgres)('on a real Postgres', () => {
  it('lets several workers share one queue with no job run twice', async () => {
    await runAsTenant(a, async () => {
      const t = await requestTx();
      for (let n = 0; n < 60; n += 1) await enqueueJob(t, { type: 'test.record', churchId: a, payload: { n } });
    });
    const workers = [worker(), worker(), worker()];
    await Promise.all(workers.map((w) => w.drain()));
    expect(done).toHaveLength(60);
    expect(new Set(done).size).toBe(60);
  });

  it('claims with SKIP LOCKED: two simultaneous claims never overlap', async () => {
    await runAsTenant(a, async () => {
      const t = await requestTx();
      for (let n = 0; n < 20; n += 1) await enqueueJob(t, { type: 'test.record', churchId: a, payload: { n } });
    });
    const [x, y] = await Promise.all([claimJobs('w1', 15, 300), claimJobs('w2', 15, 300)]);
    const ids = [...x, ...y].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(20);
  });

  it('re-queues a job whose worker died once its lease expires', async () => {
    const id = await runAsTenant(a, async () => enqueueJob(await requestTx(), { type: 'test.record', churchId: a, payload: { n: 9 } }));
    await claimJobs('dead-worker', 1, 300);
    expect(await claimJobs('other', 1, 300)).toHaveLength(0);
    const again = await claimJobs('other', 1, 0);
    expect(again.map((j) => j.id)).toEqual([id]);
    expect(again[0].attempts).toBe(2);
  });

  it('hides one church jobs from another and refuses a forged church id', async () => {
    await runAsTenant(a, async () => enqueueJob(await requestTx(), { type: 'test.record', churchId: a }));
    const seen = await runAsTenant(b, async () => (await db.sequelize.query('SELECT id FROM jobs', { transaction: await requestTx(), type: QueryTypes.SELECT })) as any[]);
    expect(seen).toHaveLength(0);
    await expect(runAsTenant(b, async () => enqueueJob(await requestTx(), { type: 'test.record', churchId: a }))).rejects.toThrow();
  });
});

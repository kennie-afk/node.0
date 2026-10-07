import { afterAll, describe, expect, it } from 'vitest';
import { boot, on, shutdown } from './helpers';

describe.runIf(on)('billing cycle at scale (real Postgres, seeded in bulk with SQL)', () => {
  afterAll(shutdown);

  it('visits only organisations with something to do, in batches, and only one runner at a time', async () => {
    const { pool } = await boot();
    const billing = await import('../src/billing/service');
    await billing.runBillingCycle(); // clear anything left over from other tests

    const tag = `scale${Date.now()}`;
    // 3000 firms in a fresh trial (nothing due), 130 whose trial ends in 2 days (invoice window is open: lead is 3 days)
    await pool.withMigrator(async (c) => {
      await c.query(`INSERT INTO organisations (id, name) SELECT gen_random_uuid(), $1 || '-' || g FROM generate_series(1, 3130) g`, [tag]);
      await c.query(
        `INSERT INTO subscriptions (org_id, status, trial_ends_at, billing_ref)
         SELECT o.id, 'trial', CASE WHEN n <= 130 THEN now() + interval '2 days' ELSE now() + interval '10 days' END, 'ZZ' || $1 || n
           FROM (SELECT id, row_number() OVER (ORDER BY id) AS n FROM organisations WHERE name LIKE $1 || '-%') o`,
        [tag]
      );
    });
    const dueIds = await pool.withMigrator(async (c) =>
      (await c.query(`SELECT s.org_id FROM subscriptions s JOIN organisations o ON o.id = s.org_id WHERE o.name LIKE $1 || '-%' AND s.trial_ends_at < now() + interval '3 days'`, [tag])).rows.map((r) => r.org_id as string)
    );
    expect(dueIds).toHaveLength(130);

    const first = await billing.runBillingCycle(new Date(), undefined, 40); // 40 per page: several pages
    expect(first.skipped).toBeUndefined();
    expect(first.invoicesIssued).toBeGreaterThanOrEqual(130);
    expect(first.organisations).toBeLessThan(500); // not 3130+ every hour
    const issued = await pool.withMigrator(async (c) => (await c.query(`SELECT count(*)::int AS n FROM invoices WHERE org_id = ANY($1::uuid[])`, [dueIds])).rows[0].n);
    expect(issued).toBe(130);

    // the same hour again: issued invoices are not re-walked unless their stored status is stale
    const second = await billing.runBillingCycle();
    expect(second.invoicesIssued).toBe(0);
    expect(second.organisations).toBeLessThan(10);

    // a second replica while the first holds the lock does nothing
    const holder = await pool.withoutTenant(async (c) => {
      await c.query('SELECT pg_advisory_lock($1)', [7_340_002]);
      const concurrent = await billing.runBillingCycle();
      await c.query('SELECT pg_advisory_unlock($1)', [7_340_002]);
      return concurrent;
    });
    expect(holder.skipped).toBe(true);
    expect(holder.organisations).toBe(0);
  }, 120_000);
});

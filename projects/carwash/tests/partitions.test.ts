import { afterAll, describe, expect, it } from 'vitest';

const on = process.env.FORECOURT_INTEGRATION === '1';
const monthName = (parent: string, monthsAhead: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return `${parent}_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

describe.runIf(on)('monthly partitions keep up with the calendar (real Postgres)', () => {
  afterAll(async () => {
    const pool = await import('../src/persistence/pool');
    await pool.closePool();
    await pool.closeMigrationPool();
  });

  it('recreates a missing future partition for both tables, and is safe to call twice at once', async () => {
    const pool = await import('../src/persistence/pool');
    const { ensurePartitions } = await import('../src/persistence/partitions');
    const exists = (name: string) =>
      pool.withMigrator(async (c) => (await c.query('SELECT to_regclass($1) AS found', [name])).rows[0].found !== null);

    for (const parent of ['job_events', 'telemetry']) {
      await pool.withMigrator((c) => c.query(`DROP TABLE IF EXISTS ${monthName(parent, 3)}`));
      expect(await exists(monthName(parent, 3))).toBe(false);
    }

    const results = await Promise.all([ensurePartitions(3), ensurePartitions(3)]);

    expect(results).toContain(true);
    for (const parent of ['job_events', 'telemetry']) {
      expect(await exists(monthName(parent, 3))).toBe(true);
    }
  });

  it('reaches further ahead when asked to', async () => {
    const pool = await import('../src/persistence/pool');
    const { ensurePartitions } = await import('../src/persistence/partitions');

    await ensurePartitions(6);

    const found = await pool.withMigrator(async (c) => (await c.query('SELECT to_regclass($1) AS found', [monthName('job_events', 6)])).rows[0].found);
    expect(found).not.toBeNull();
  });
});

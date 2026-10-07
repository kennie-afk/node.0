/** The migration runner: serialised by an advisory lock, and an applied file that is edited afterwards is refused. */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { on, boot, shutdown } from './helpers';

describe.skipIf(!on)('migration runner', () => {
  afterAll(async () => {
    const { pool } = await boot();
    await pool.withMigrator(async (c) => {
      await c.query(`DROP TABLE IF EXISTS _mig_probe`);
      await c.query(`DELETE FROM schema_migrations WHERE name LIKE '09%'`);
    });
    await shutdown();
  });

  it('applies a file once under concurrent runs, records its checksum, and refuses an edited applied file', async () => {
    const { migrate } = await import('../src/persistence/migrate');
    const { pool } = await boot();
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mig-'));
    try {
      await writeFile(path.join(dir, '0900_probe.sql'), 'CREATE TABLE _mig_probe (id int);');
      const runs = await Promise.all([migrate(dir), migrate(dir), migrate(dir)]);
      expect(runs.flat()).toEqual(['0900_probe.sql']);
      const row = await pool.withMigrator(async (c) => (await c.query(`SELECT checksum FROM schema_migrations WHERE name = '0900_probe.sql'`)).rows[0]);
      expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);

      // an unchanged applied file is fine, a legacy row without a checksum is pinned, not rejected
      expect(await migrate(dir)).toEqual([]);
      await pool.withMigrator((c) => c.query(`UPDATE schema_migrations SET checksum = NULL WHERE name = '0900_probe.sql'`));
      expect(await migrate(dir)).toEqual([]);

      await writeFile(path.join(dir, '0900_probe.sql'), 'CREATE TABLE _mig_probe (id int, extra int);');
      await expect(migrate(dir)).rejects.toThrow(/edited after it was applied/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the real migrations directory is consistent with what is recorded', async () => {
    const { migrate } = await import('../src/persistence/migrate');
    expect(await migrate()).toEqual([]);
  });
});

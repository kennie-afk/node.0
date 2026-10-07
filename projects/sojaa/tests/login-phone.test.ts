import { afterAll, describe, expect, it } from 'vitest';
import { boot, newTenant, nextPhone, on, shutdown } from './helpers';

describe.runIf(on)('one phone number, one active sign-in (real Postgres)', () => {
  afterAll(shutdown);

  it('refuses the same number in a second organisation, whatever the application layer checked first', async () => {
    const { pool } = await boot();
    const a = await newTenant('Firm A');
    const b = await newTenant('Firm B');
    const phone = nextPhone();
    const insert = (orgId: string) =>
      pool.withMigrator((client) =>
        client.query(
          `INSERT INTO users (org_id, display_name, role, phone, pin_hash) VALUES ($1, 'Twin', 'ops_manager', $2, 'x')`,
          [orgId, phone]
        )
      );

    await insert(a.orgId);
    await expect(insert(b.orgId)).rejects.toMatchObject({ code: '23505' });
  });

  it('lets a number be reused once the old account is disabled, so a person who changes firm can sign up again', async () => {
    const { pool } = await boot();
    const a = await newTenant('Firm C');
    const b = await newTenant('Firm D');
    const phone = nextPhone();
    const insert = (orgId: string) =>
      pool.withMigrator((client) =>
        client.query(
          `INSERT INTO users (org_id, display_name, role, phone, pin_hash) VALUES ($1, 'Mover', 'ops_manager', $2, 'x')`,
          [orgId, phone]
        )
      );

    await insert(a.orgId);
    await pool.withMigrator((client) => client.query(`UPDATE users SET status = 'disabled' WHERE phone = $1`, [phone]));

    await expect(insert(b.orgId)).resolves.toBeDefined();
  });

  it('answers a sign-in lookup from an index, not a table scan', async () => {
    const { pool } = await boot();
    const plan = await pool.withMigrator(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('SET LOCAL enable_seqscan = off');
        return (await client.query(`EXPLAIN SELECT id FROM users WHERE phone = '254700000000' AND status = 'active'`)).rows
          .map((row: Record<string, string>) => row['QUERY PLAN'])
          .join('\n');
      } finally {
        await client.query('ROLLBACK');
      }
    });
    expect(plan).toMatch(/users_phone_active_unique/);
  });
});

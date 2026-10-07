import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import pg from 'pg';
import db from '@models';
import { createApp } from '../src/app';
import { onPostgres, prepareDatabase, truncateAll } from './harness';
import { member, signUp } from './giving-helpers';

const app = createApp();
beforeAll(async () => {
  await prepareDatabase();
});
afterAll(async () => {
  await truncateAll();
  await db.sequelize.close();
});

describe('member list totals (count without the join)', () => {
  it('pages, searches and counts exactly as before, including a family include', async () => {
    const { admin } = await signUp(app, 'perf');
    for (let i = 0; i < 7; i += 1) await member(app, admin, `Perf${i}`, i % 2 ? 'Odd' : 'Even');
    const all = await request(app).get('/members?page=1&pageSize=3').set(admin);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 7, page: 1, pageSize: 3, totalPages: 3, hasNext: true, hasPrevious: false });
    expect(all.body.data).toHaveLength(3);
    const last = await request(app).get('/members?page=3&pageSize=3').set(admin);
    expect(last.body.data).toHaveLength(1);
    expect(last.body).toMatchObject({ total: 7, hasNext: false, hasPrevious: true });
    const search = await request(app).get('/members?q=odd&page=1').set(admin);
    expect(search.body.total).toBe(3);
    expect(search.body.data.every((m: { lastName: string }) => m.lastName === 'Odd')).toBe(true);
    expect((await request(app).get('/members?q=no-such-person&page=1').set(admin)).body.total).toBe(0);
  });

  it('never leaks another church\'s members into the count', async () => {
    const a = await signUp(app, 'perfa');
    const b = await signUp(app, 'perfb');
    await member(app, a.admin, 'Alone', 'InA');
    expect((await request(app).get('/members?page=1').set(b.admin)).body.total).toBe(0);
  });
});

describe.runIf(onPostgres)('indexes from migration 20261004100000 (Postgres only)', () => {
  it('exist, are valid, and the planner picks them for the ordered list and the dashboard on a realistic table', async () => {
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    try {
      const { rows } = await owner.query(
        `SELECT c.relname, i.indisvalid FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
          WHERE c.relname IN ('members_church_first_name_id','members_church_created_at','contribution_posted_report','contribution_posted_member')`
      );
      expect(rows).toHaveLength(4);
      expect(rows.every((r) => r.indisvalid)).toBe(true);

      // A planner only prefers an index on a table big enough to matter, so build one (synthetic names).
      const church = (await owner.query(`INSERT INTO churches (name, slug) VALUES ('Plan Check', 'plan-check') RETURNING id`)).rows[0].id as number;
      await owner.query(
        `INSERT INTO members (church_id, first_name, last_name, email, phone_number, status, membership_date)
         SELECT $1, substr(md5(i::text), 1, 8), substr(md5((i * 7)::text), 1, 8), 'plan-' || i || '@plan.test', '07' || lpad((20000000 + i)::text, 8, '0'), 'Active', current_date
           FROM generate_series(1, 30000) AS i`,
        [church]
      );
      await owner.query('ANALYZE members');
      const plan = async (sql: string) => (await owner.query(`EXPLAIN ${sql}`, [church])).rows.map((r) => r['QUERY PLAN']).join('\n');
      const ordered = await plan(`SELECT id FROM members WHERE church_id = $1 ORDER BY first_name, id LIMIT 25`);
      expect(ordered).toMatch(/members_church_first_name_id/);
      expect(ordered).not.toMatch(/\bSort\b/);
      const recent = await plan(`SELECT id FROM members WHERE church_id = $1 ORDER BY created_at DESC, id DESC LIMIT 5`);
      expect(recent).toMatch(/members_church_created_at/);
    } finally {
      await owner.end();
    }
  }, 60_000);
});

/**
 * Tests run against in-memory SQLite by default (fast, no setup). Set TEST_DATABASE_URL (and
 * TEST_OWNER_DATABASE_URL, the schema owner) to run the very same suite against a real, migrated
 * Postgres, where row-level security, triggers, partitioning and concurrency are all live.
 */
import pg from 'pg';
import db from '@models';
import { forgetSetupCache } from '../src/modules/finance/setup.service';

export const onPostgres = Boolean(process.env.TEST_DATABASE_URL);

export async function prepareDatabase(): Promise<void> {
  if (!onPostgres) {
    await db.sequelize.sync({ force: true });
  }
  await truncateAll();
}

export async function truncateAll(): Promise<void> {
  forgetSetupCache();
  if (onPostgres) {
    const owner = new pg.Client({ connectionString: process.env.TEST_OWNER_DATABASE_URL });
    await owner.connect();
    try {
      const { rows } = await owner.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'sequelize_meta' AND tablename !~ '^journal_lines_p[0-9]+$'`
      );
      const names = rows.map((r: { tablename: string }) => `"${r.tablename}"`).join(', ');
      await owner.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
    } finally {
      await owner.end();
    }
    return;
  }
  await db.sequelize.query('PRAGMA foreign_keys = OFF');
  for (const model of Object.values(db.sequelize.models)) {
    await (model as any).destroy({ where: {}, truncate: true });
  }
  await db.sequelize.query('PRAGMA foreign_keys = ON');
}

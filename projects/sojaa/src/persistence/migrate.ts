import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { withMigrator } from './pool';
import { env } from '../config/env';
import { logger } from '../common/logger';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');
// Any constant: two replicas starting together queue on this instead of both applying a file.
const MIGRATION_LOCK_KEY = 7_340_001;

export const checksumOf = (sql: string): string => createHash('sha256').update(sql).digest('hex');

export async function migrate(dir: string = MIGRATIONS_DIR): Promise<string[]> {
  return withMigrator(async (client) => {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await migrateLocked(client, dir);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  });
}

async function migrateLocked(client: import('pg').PoolClient, dir: string): Promise<string[]> {
  {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );
    // Added after the first migrations were applied, so it is a runner concern, not a numbered migration.
    await client.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');

    const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT name, checksum FROM schema_migrations');
    const applied = new Map<string, string | null>(rows.map((row) => [row.name as string, row.checksum as string | null]));
    const ran: string[] = [];

    for (const file of files) {
      const sql = await readFile(path.join(dir, file), 'utf8');
      const sum = checksumOf(sql);
      if (applied.has(file)) {
        const recorded = applied.get(file);
        if (recorded === null || recorded === undefined) {
          // Applied before checksums existed: nothing to compare with, so pin what is on disk now.
          await client.query('UPDATE schema_migrations SET checksum = $2 WHERE name = $1', [file, sum]);
        } else if (recorded !== sum) {
          throw new Error(`migration ${file} was edited after it was applied (checksum differs); add a new numbered migration instead`);
        }
        continue;
      }

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, sum]);
        await client.query('COMMIT');
        ran.push(file);
        logger.info('migration applied', { file });
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // sojaa_app is created LOGIN by migration 0001 but no migration file ever sets its
    // password (a static SQL file is the wrong place for a secret). Set it here, every run,
    // from an env var - idempotent, and lets the password rotate by changing the env and
    // re-running rather than editing a migration. ALTER ROLE's PASSWORD clause is a string
    // literal in the grammar, not a bind-parameter position, so this uses pg's own
    // escapeLiteral rather than a $1 placeholder (which is a syntax error here).
    const escapedPassword = client.escapeLiteral(env.SOJAA_APP_PASSWORD);
    await client.query(`ALTER ROLE sojaa_app WITH LOGIN PASSWORD ${escapedPassword}`);

    return ran;
  }
}

if (process.argv[1]?.includes('migrate')) {
  migrate()
    .then((ran) => {
      logger.info('migrations complete', { applied: ran.length, files: ran });
      process.exit(0);
    })
    .catch((error) => {
      logger.error('migrations failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exit(1);
    });
}

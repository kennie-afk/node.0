import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { withMigrator } from './pool';
import { env } from '../config/env';
import { logger } from '../common/logger';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'migrations');

export async function migrate(): Promise<string[]> {
  return withMigrator(async (client) => {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    );

    const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort();
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.name));
    const ran: string[] = [];

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
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

    // forecourt_app is created LOGIN by migration 0004 but no migration file ever sets its
    // password (a static SQL file is the wrong place for a secret). Set it here, every run,
    // from an env var - idempotent, and lets the password rotate by changing the env and
    // re-running rather than editing a migration. ALTER ROLE's PASSWORD clause is a string
    // literal in the grammar, not a bind-parameter position, so this uses pg's own
    // escapeLiteral rather than a $1 placeholder (which is a syntax error here).
    const escapedPassword = client.escapeLiteral(env.FORECOURT_APP_PASSWORD);
    await client.query(`ALTER ROLE forecourt_app WITH LOGIN PASSWORD ${escapedPassword}`);

    return ran;
  });
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

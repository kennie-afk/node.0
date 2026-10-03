import { Pool, PoolClient, types } from 'pg';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';

// A DATE column has no time zone. node-postgres turns it into a JS Date at local midnight, so on a
// host that is not on UTC a business day of 2026-09-27 came back as 2026-09-26T21:00:00Z and the
// console showed the wrong day. Keep dates as the plain YYYY-MM-DD strings they are.
types.setTypeParser(1082, (value: string) => value);

function databaseTls(): { rejectUnauthorized: boolean; ca?: string } | undefined {
  if (!env.DATABASE_SSL) {
    return undefined;
  }
  return env.DATABASE_CA_CERT
    ? { rejectUnauthorized: true, ca: env.DATABASE_CA_CERT }
    : { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: databaseTls()
});

pool.on('error', (error) => {
  logger.error('idle database client failed', { error: error.message });
});

export async function withOrg<T>(
  orgId: string,
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['hazina.org_id', orgId]);
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withoutTenant<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

// Migrations create and grant the app role (hazina_app), which hazina_app itself has no
// privilege to do. This connects with DATABASE_MIGRATION_URL - a role with CREATEROLE and
// ownership of the schema - kept entirely separate from the app's own restricted pool above.
const migrationPool = new Pool({
  connectionString: env.DATABASE_MIGRATION_URL,
  max: 1,
  connectionTimeoutMillis: 5_000,
  ssl: databaseTls()
});

export async function withMigrator<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await migrationPool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
}

export async function closeMigrationPool(): Promise<void> {
  await migrationPool.end();
}

/**
 * Refuses to run (in production) when tenant isolation would be silently off: the connected role
 * bypasses row-level security, or a table that carries org_id has RLS switched off or not forced.
 * The second check is what makes a table forgotten by a later migration impossible to miss.
 */
export async function assertRlsIsEffective(): Promise<void> {
  const problems: string[] = [];

  const { rows } = await pool.query(
    `SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user`
  );
  if (rows[0]?.bypasses) {
    problems.push(
      'the database user bypasses row level security, so tenant isolation is not enforced; ' +
        'connect as a NOSUPERUSER NOBYPASSRLS role such as hazina_app'
    );
  }

  const unprotected = await pool.query(
    `SELECT c.relname
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
      WHERE c.relkind = 'r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
      ORDER BY c.relname`
  );
  if (unprotected.rows.length > 0) {
    problems.push(
      `tables with org_id but no forced row level security: ${unprotected.rows.map((row) => row.relname).join(', ')}`
    );
  }

  if (problems.length > 0) {
    const message = problems.join('; ');
    if (isProduction) {
      throw new Error(message);
    }
    logger.warn(message);
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

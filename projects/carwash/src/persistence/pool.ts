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
    await client.query('SELECT set_config($1, $2, true)', ['forecourt.org_id', orgId]);
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

// Migrations create and grant the app role (forecourt_app), which forecourt_app itself has no
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

export async function assertRlsIsEffective(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT rolsuper OR rolbypassrls AS bypasses FROM pg_roles WHERE rolname = current_user`
  );

  if (rows[0]?.bypasses) {
    const message =
      'the database user bypasses row level security, so tenant isolation is not enforced; ' +
      'connect as a NOSUPERUSER NOBYPASSRLS role such as forecourt_app';
    if (isProduction) {
      throw new Error(message);
    }
    logger.warn(message, { user: 'current' });
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

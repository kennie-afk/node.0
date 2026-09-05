import { Pool, PoolClient } from 'pg';
import { env, isProduction } from '../config/env';
import { logger } from '../common/logger';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: isProduction ? { rejectUnauthorized: false } : undefined
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

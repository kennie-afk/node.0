import { PoolClient } from 'pg';

/** The next number of a per-organisation series (guards, incidents, invoices). Gap-free: the upsert is also the lock. */
export async function nextCounter(client: PoolClient, orgId: string, key: string): Promise<number> {
  const { rows } = await client.query(
    `INSERT INTO org_counters (org_id, key, n) VALUES ($1, $2, 1) ON CONFLICT (org_id, key) DO UPDATE SET n = org_counters.n + 1 RETURNING n`,
    [orgId, key]
  );
  return Number(rows[0].n);
}

export const pad = (n: number, width = 4) => String(n).padStart(width, '0');

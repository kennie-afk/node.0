import { QueryTypes, Transaction } from 'sequelize';
import db from '@models';
import { isPostgres } from '../../common/tenant-db';

export type Params = Record<string, unknown> | unknown[];

/** SELECT returning rows. Always pass the transaction so the statement joins the caller's work. */
export async function select<T = Record<string, any>>(t: Transaction, sql: string, replacements?: Params): Promise<T[]> {
  return db.sequelize.query(sql, { transaction: t, replacements: replacements as any, type: QueryTypes.SELECT }) as Promise<T[]>;
}

export async function selectOne<T = Record<string, any>>(t: Transaction, sql: string, replacements?: Params): Promise<T | null> {
  const rows = await select<T>(t, sql, replacements);
  return rows[0] ?? null;
}

/** INSERT / UPDATE / DELETE. */
export async function exec(t: Transaction, sql: string, replacements?: Params): Promise<void> {
  await db.sequelize.query(sql, { transaction: t, replacements: replacements as any });
}

/**
 * Rows affected by an UPDATE or DELETE, which is where optimistic concurrency checks live. Uses
 * RETURNING (Postgres, SQLite 3.35+) because the affected-row metadata differs per driver.
 */
export async function execCount(t: Transaction, sql: string, replacements?: Params): Promise<number> {
  if (!isPostgres(db.sequelize)) {
    // SQLite's driver runs INSERT/UPDATE/DELETE without returning rows, even with RETURNING, so
    // read the connection's own change counter straight afterwards.
    await db.sequelize.query(sql, { transaction: t, replacements: replacements as any });
    const [row] = (await db.sequelize.query('SELECT changes() AS n', { transaction: t, type: QueryTypes.SELECT })) as Array<{ n: number }>;
    return Number(row?.n ?? 0);
  }
  const rows = (await db.sequelize.query(`${sql} RETURNING 1 AS affected`, {
    transaction: t,
    replacements: replacements as any,
    type: QueryTypes.SELECT
  })) as unknown[];
  return rows.length;
}

/** `FOR UPDATE` on Postgres; SQLite serialises writers already and has no such clause. */
export function forUpdate(): string {
  return isPostgres(db.sequelize) ? 'FOR UPDATE' : '';
}

export function inClause(values: number[]): string {
  return values.map(() => '?').join(',');
}

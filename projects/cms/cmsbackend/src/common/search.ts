import { Op, WhereOptions } from 'sequelize';
import db from '@models';

/**
 * A "contains" filter across columns, run by the database so a list never has to be fetched whole
 * and filtered in the browser. Wildcards the user types are stripped, so `%` and `_` search for
 * themselves' absence rather than matching everything.
 */
export function searchWhere(columns: readonly string[], raw: unknown): WhereOptions | undefined {
  const q = typeof raw === 'string' ? raw.trim().slice(0, 80) : '';
  if (!q || columns.length === 0) return undefined;
  const like = db.sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
  const term = `%${q.replace(/[%_\\]/g, '')}%`;
  return { [Op.or]: columns.map((column) => ({ [column]: { [like]: term } })) } as WhereOptions;
}

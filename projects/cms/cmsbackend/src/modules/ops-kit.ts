/**
 * Small helpers shared by the church-operations modules (comms, volunteers, checkin, facilities,
 * visitors, care, selfservice, dataops). They keep each module's service code about the domain:
 * generic insert/update that stamp church and timestamps, row mapping, and a few lookups.
 */
import { DataTypes, Model, ModelAttributeColumnOptions, ModelStatic, QueryTypes, Sequelize, Transaction } from 'sequelize';
import BaseModel from '../common/base.model';
import { currentTenant } from '../common/tenant-context';
import { select, selectOne } from './finance/sql';
import db from '@models';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors';
import { isPostgres } from '../common/tenant-db';
import { encodeCursor, decodeCursor } from '../common/keyset';

export const T = {
  int: { type: DataTypes.INTEGER, allowNull: true },
  intReq: { type: DataTypes.INTEGER, allowNull: false },
  str: (n = 255, required = false, defaultValue?: string): ModelAttributeColumnOptions => ({ type: DataTypes.STRING(n), allowNull: !required, defaultValue }),
  text: { type: DataTypes.TEXT, allowNull: true },
  textReq: { type: DataTypes.TEXT, allowNull: false },
  bool: (defaultValue = false): ModelAttributeColumnOptions => ({ type: DataTypes.BOOLEAN, allowNull: false, defaultValue }),
  ts: { type: DataTypes.DATE, allowNull: true },
  tsReq: { type: DataTypes.DATE, allowNull: false },
  day: { type: DataTypes.DATEONLY, allowNull: true },
  dayReq: { type: DataTypes.DATEONLY, allowNull: false }
} as const;

/** Defines a Sequelize model that mirrors a migration table so the SQLite test database can be built. */
export function tableModel(
  sequelize: Sequelize,
  modelName: string,
  tableName: string,
  attrs: Record<string, ModelAttributeColumnOptions | { type: any; allowNull: boolean }>,
  options: { timestamps?: boolean; indexes?: Array<{ fields: string[]; unique?: boolean; name?: string }> } = {}
): ModelStatic<Model> {
  class Anon extends BaseModel<any> {}
  Object.defineProperty(Anon, 'name', { value: modelName });
  const timestamps = options.timestamps !== false;
  return Anon.initModel(
    {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      churchId: { type: DataTypes.INTEGER, allowNull: false },
      // Sequelize writes column metadata into these option objects, so each model needs its own copies.
      ...Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { ...value }])),
      ...(timestamps ? { createdAt: { type: DataTypes.DATE, allowNull: true }, updatedAt: { type: DataTypes.DATE, allowNull: true } } : {})
    },
    { tableName, modelName, underscored: true, timestamps: false, indexes: options.indexes },
    sequelize
  ) as unknown as ModelStatic<Model>;
}

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camelKey = (key: string) => key.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

export const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 't';

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** node-postgres builds DATE columns as local-midnight Dates; format them back without shifting the day. */
function localDay(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export interface MapOptions {
  bools?: string[];
  json?: string[];
  omit?: string[];
  days?: string[];
}

/** snake_case row -> camelCase DTO, with booleans, DATE and JSON columns normalised across drivers. */
export function camel<R = any>(row: Record<string, any>, options: MapOptions = {}): R {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (options.omit?.includes(key)) continue;
    let v = value;
    if (options.bools?.includes(key)) v = bool(v);
    else if (options.json?.includes(key)) v = typeof v === 'string' ? JSON.parse(v) : v;
    else if (v instanceof Date && (options.days?.includes(key) || /(_on|_date)$/.test(key) || key === 'date_of_birth')) v = localDay(v);
    else if (typeof v === 'string' && options.days?.includes(key)) v = v.slice(0, 10);
    out[camelKey(key)] = v;
  }
  return out as R;
}

export const nowDate = () => new Date();

/** INSERT ... RETURNING id. Stamps church_id and timestamps; values are bound, never interpolated. */
export async function insertRow(t: Transaction, table: string, churchId: number, row: Record<string, unknown>, timestamps = true): Promise<number> {
  const data: Record<string, unknown> = { church_id: churchId, ...Object.fromEntries(Object.entries(row).map(([k, v]) => [snake(k), v === undefined ? null : v])) };
  if (timestamps) {
    data.created_at = nowDate();
    data.updated_at = data.created_at;
  }
  const columns = Object.keys(data);
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  const values = columns.map((c) => data[c]);
  if (isPostgres(db.sequelize)) {
    const rows = await select<{ id: number }>(t, `${sql} RETURNING id`, values);
    return Number(rows[0].id);
  }
  // SQLite's driver runs an INSERT through `run`, which reports the new rowid instead of rows.
  const [lastId] = (await db.sequelize.query(sql, { transaction: t, replacements: values as any, type: QueryTypes.INSERT })) as unknown as [number, number];
  return Number(lastId);
}

/** UPDATE one church-owned row by id. Returns false when nothing matched. */
export async function updateRow(t: Transaction, table: string, churchId: number, id: number, patch: Record<string, unknown>, timestamps = true): Promise<boolean> {
  const data: Record<string, unknown> = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));
  if (timestamps) data.updated_at = nowDate();
  const columns = Object.keys(data);
  if (columns.length === 0) return true;
  const rows = await select(
    t,
    `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE church_id = ? AND id = ? RETURNING id`,
    [...columns.map((c) => data[c]), churchId, id]
  );
  return rows.length > 0;
}

export async function deleteRow(t: Transaction, table: string, churchId: number, id: number): Promise<boolean> {
  const rows = await select(t, `DELETE FROM ${table} WHERE church_id = ? AND id = ? RETURNING id`, [churchId, id]);
  return rows.length > 0;
}

export async function getRow(t: Transaction, table: string, churchId: number, id: number, label: string): Promise<Record<string, any>> {
  const row = await selectOne(t, `SELECT * FROM ${table} WHERE church_id = ? AND id = ?`, [churchId, id]);
  if (!row) throw new NotFoundError(`${label} ${id} was not found`);
  return row;
}

export function me() {
  const tenant = currentTenant();
  return { churchId: tenant.churchId, userId: tenant.userId, role: tenant.role, isAdmin: tenant.role === 'ADMIN' };
}

export async function assertMember(t: Transaction, churchId: number, memberId: number | null | undefined, field = 'memberId'): Promise<void> {
  if (memberId === null || memberId === undefined) return;
  const row = await selectOne(t, `SELECT id FROM members WHERE church_id = ? AND id = ?`, [churchId, memberId]);
  if (!row) throw new BadRequestError(`${field} does not refer to a member of this church`);
}

export async function assertRef(t: Transaction, table: string, churchId: number, id: number | null | undefined, field: string): Promise<void> {
  if (id === null || id === undefined) return;
  const row = await selectOne(t, `SELECT id FROM ${table} WHERE church_id = ? AND id = ?`, [churchId, id]);
  if (!row) throw new BadRequestError(`${field} does not refer to a record in this church`);
}

/** The member a signed-in user is linked to (see selfservice), or null. */
export async function linkedMemberId(t: Transaction, churchId: number, userId: number): Promise<number | null> {
  const row = await selectOne<any>(t, `SELECT member_id FROM users WHERE church_id = ? AND id = ?`, [churchId, userId]);
  return row?.member_id === null || row?.member_id === undefined ? null : Number(row.member_id);
}

export async function requireLinkedMember(t: Transaction, churchId: number, userId: number): Promise<number> {
  const id = await linkedMemberId(t, churchId, userId);
  if (id === null) throw new ForbiddenError('your account is not linked to a member record; ask an administrator to link it');
  return id;
}

export async function tableExists(t: Transaction, table: string): Promise<boolean> {
  if (isPostgres(db.sequelize)) {
    return Boolean(await selectOne(t, `SELECT 1 AS x FROM pg_tables WHERE schemaname = 'public' AND tablename = ?`, [table]));
  }
  return Boolean(await selectOne(t, `SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]));
}

export async function columnExists(t: Transaction, table: string, column: string): Promise<boolean> {
  if (isPostgres(db.sequelize)) {
    return Boolean(await selectOne(t, `SELECT 1 AS x FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? AND column_name = ?`, [table, column]));
  }
  const cols = await select<any>(t, `PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

/** Keyset paging on (created order) id DESC: `WHERE id < cursor`. */
export function idCursor(cursor: string | undefined): number | null {
  return decodeCursor<{ id: number }>(cursor)?.id ?? null;
}
export function idNext<T extends { id: number }>(rows: T[], limit: number): { data: T[]; nextCursor: string | null; limit: number } {
  const more = rows.length > limit;
  const data = more ? rows.slice(0, limit) : rows;
  return { data, nextCursor: more ? encodeCursor({ id: data[data.length - 1].id }) : null, limit };
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // A cell that starts with a formula character is prefixed so spreadsheets do not execute it.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

/** Kenyan numbers to E.164 (+2547XXXXXXXX); null when it is not a plausible number. */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, '');
  let d = digits.startsWith('+') ? digits.slice(1) : digits;
  if (d.startsWith('0') && d.length === 10) d = `254${d.slice(1)}`;
  else if ((d.startsWith('7') || d.startsWith('1')) && d.length === 9) d = `254${d}`;
  return /^254[17]\d{8}$/.test(d) ? `+${d}` : /^\d{10,14}$/.test(d) && digits.startsWith('+') ? `+${d}` : null;
}

export { select, selectOne };

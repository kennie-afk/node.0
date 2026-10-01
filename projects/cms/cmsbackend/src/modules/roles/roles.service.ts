import { Transaction } from 'sequelize';
import db from '@models';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { currentTenantOrNull } from '../../common/tenant-context';
import { setTenantLocal, type TenantTx } from '../../common/tenant-db';
import { ADMIN_ROLE, DEFAULT_ROLE, DEFAULT_ROLES, PERMISSIONS, ROLE_KEY_PATTERN, isPermission } from '../../auth/permissions';
import { insertRow, updateRow } from '../ops-kit';
import { select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';

export interface ChurchRoleDto {
  key: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount?: number;
}

const ALL: readonly string[] = PERMISSIONS;

/**
 * One church's roles, cached in this process. A request needs its permissions on every call, so
 * the table is read at most once per TTL per church per replica instead of once per request. A
 * change made on this replica clears its own cache at once; another replica sees it within the
 * TTL (ROLE_CACHE_TTL_MS, default 15 s), which is the price of not coordinating replicas.
 */
const ttlMs = () => Number(process.env.ROLE_CACHE_TTL_MS ?? 15_000);
const cache = new Map<number, { loadedAt: number; roles: Map<string, ChurchRoleDto> }>();

export const invalidateRoles = (churchId: number) => void cache.delete(churchId);
/** Drops every church's cached roles; for tests that reset the database underneath the cache. */
export const clearRoleCache = () => cache.clear();

const parsePermissions = (raw: unknown): string[] => {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  return Array.isArray(value) ? value.filter(isPermission) : [];
};
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
};
const toDto = (row: Record<string, any>): ChurchRoleDto => ({
  key: row.role_key,
  label: row.label,
  description: row.description ?? null,
  isSystem: row.is_system === true || row.is_system === 1 || row.is_system === 't',
  permissions: row.role_key === ADMIN_ROLE ? [...ALL] : parsePermissions(row.permissions)
});

/** Gives a church the built-in roles it does not have yet. Safe to call repeatedly. */
export async function ensureDefaultRoles(t: Transaction, churchId: number): Promise<void> {
  const have = new Set((await select<{ role_key: string }>(t, 'SELECT role_key FROM church_roles WHERE church_id = ?', [churchId])).map((r) => r.role_key));
  for (const template of DEFAULT_ROLES) {
    if (have.has(template.key)) continue;
    await insertRow(t, 'church_roles', churchId, {
      roleKey: template.key,
      label: template.label,
      description: template.description,
      isSystem: true,
      permissions: JSON.stringify(template.permissions)
    });
  }
}

async function inChurchTx<T>(churchId: number, tx: TenantTx | undefined, work: (t: Transaction) => Promise<T>): Promise<T> {
  if (tx) return work(await tx.acquire());
  const ctx = currentTenantOrNull();
  if (ctx?.tenantTx && ctx.churchId === churchId) return work(await ctx.tenantTx.acquire());
  return db.sequelize.transaction(async (t: Transaction) => {
    await setTenantLocal(db.sequelize, t, churchId);
    return work(t);
  });
}

async function loadRoles(churchId: number, tx?: TenantTx): Promise<Map<string, ChurchRoleDto>> {
  const hit = cache.get(churchId);
  if (hit && Date.now() - hit.loadedAt < ttlMs()) return hit.roles;
  const roles = await inChurchTx(churchId, tx, async (t) => {
    let rows = await select(t, 'SELECT role_key, label, description, is_system, permissions FROM church_roles WHERE church_id = ? ORDER BY id', [churchId]);
    // A church that predates roles (or lost a built-in) heals itself on first use.
    if (!rows.some((r) => r.role_key === ADMIN_ROLE) || rows.length === 0) {
      await ensureDefaultRoles(t, churchId);
      rows = await select(t, 'SELECT role_key, label, description, is_system, permissions FROM church_roles WHERE church_id = ? ORDER BY id', [churchId]);
    }
    return new Map(rows.map((r) => [r.role_key as string, toDto(r)]));
  });
  cache.set(churchId, { loadedAt: Date.now(), roles });
  return roles;
}

/**
 * What a role may do in a church. ADMIN is always everything; a role that no longer exists holds
 * nothing (least privilege) rather than falling back to some default.
 */
export async function resolvePermissions(churchId: number, role: string, tx?: TenantTx): Promise<ReadonlySet<string>> {
  if (role === ADMIN_ROLE) return new Set(ALL);
  const roles = await loadRoles(churchId, tx);
  return new Set(roles.get(role)?.permissions ?? []);
}

export async function roleLabel(churchId: number, role: string, tx?: TenantTx): Promise<string> {
  return (await loadRoles(churchId, tx)).get(role)?.label ?? role;
}

/** Names only, by church slug, for the sign-in picker. Says nothing about what a role can do. */
export async function publicRoleNames(slug: string): Promise<Array<{ role: string; label: string }>> {
  const church = await db.Church.findOne({ where: { slug, isActive: true }, attributes: ['id'] });
  if (!church) return [];
  return [...(await loadRoles(church.id)).values()].map((r) => ({ role: r.key, label: r.label }));
}

/** Rejects a role key this church has not defined; used when a user is created or moved to a role. */
export async function assertRoleDefined(key: string): Promise<void> {
  const ctx = currentTenantOrNull();
  if (!ctx) throw new Error('assertRoleDefined must run inside an authenticated request');
  if (!(await loadRoles(ctx.churchId, ctx.tenantTx)).has(key)) throw new BadRequestError(`there is no role ${key} in this church`);
}

export async function roleExists(t: Transaction, churchId: number, key: string): Promise<boolean> {
  return (await selectOne(t, 'SELECT 1 AS ok FROM church_roles WHERE church_id = ? AND role_key = ?', [churchId, key])) !== null;
}

// ---- administration -----------------------------------------------------------------------------

export async function listRoles(t: Transaction, churchId: number): Promise<ChurchRoleDto[]> {
  await ensureDefaultRoles(t, churchId);
  const rows = await select(t, 'SELECT role_key, label, description, is_system, permissions FROM church_roles WHERE church_id = ? ORDER BY id', [churchId]);
  const counts = new Map((await select<{ role: string; n: number | string }>(t, 'SELECT role, COUNT(*) AS n FROM users WHERE church_id = ? GROUP BY role', [churchId])).map((r) => [r.role, Number(r.n)]));
  return rows.map((r) => ({ ...toDto(r), userCount: counts.get(r.role_key) ?? 0 }));
}

/** Nobody may hand out more than they hold, so a delegated "manage users" cannot mint a super-role. */
function assertGrantable(permissions: string[], held: ReadonlySet<string>) {
  const bad = permissions.filter((p) => !isPermission(p));
  if (bad.length) throw new BadRequestError(`unknown permission: ${bad.join(', ')}`);
  const over = permissions.filter((p) => !held.has(p));
  if (over.length) throw new ForbiddenError(`you cannot grant permissions you do not hold: ${over.join(', ')}`);
}

export interface RoleInput {
  label: string;
  description?: string | null;
  permissions: string[];
}

export async function createRole(t: Transaction, churchId: number, held: ReadonlySet<string>, key: string, input: RoleInput): Promise<ChurchRoleDto> {
  if (!ROLE_KEY_PATTERN.test(key)) throw new BadRequestError('a role key is 2-20 capital letters, digits or underscores, starting with a letter');
  if (await roleExists(t, churchId, key)) throw new ConflictError(`the role ${key} already exists`);
  assertGrantable(input.permissions, held);
  const permissions = [...new Set(input.permissions)];
  await insertRow(t, 'church_roles', churchId, { roleKey: key, label: input.label, description: input.description ?? null, isSystem: false, permissions: JSON.stringify(permissions) });
  await recordAudit(t, churchId, { action: 'role.create', entityType: 'role', entityId: key, data: { label: input.label, permissions } });
  invalidateRoles(churchId);
  return { key, label: input.label, description: input.description ?? null, isSystem: false, permissions, userCount: 0 };
}

export async function updateRole(t: Transaction, churchId: number, held: ReadonlySet<string>, key: string, input: Partial<RoleInput>): Promise<ChurchRoleDto> {
  const row = await selectOne<Record<string, any>>(t, 'SELECT id, role_key, label, description, is_system, permissions FROM church_roles WHERE church_id = ? AND role_key = ?', [churchId, key]);
  if (!row) throw new NotFoundError(`no role ${key}`);
  if (key === ADMIN_ROLE && input.permissions) throw new ForbiddenError('the Administrator role always holds every permission');
  const before = parsePermissions(row.permissions);
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.permissions) {
    const next = [...new Set(input.permissions)];
    // Only the permissions being ADDED must be ones the editor holds; taking some away is always fine.
    assertGrantable(next.filter((p) => !before.includes(p)), held);
    const unknown = next.filter((p) => !isPermission(p));
    if (unknown.length) throw new BadRequestError(`unknown permission: ${unknown.join(', ')}`);
    patch.permissions = JSON.stringify(next);
  }
  await updateRow(t, 'church_roles', churchId, Number(row.id), patch);
  await recordAudit(t, churchId, { action: 'role.update', entityType: 'role', entityId: key, data: { before: { label: row.label, permissions: before }, after: { label: input.label, permissions: input.permissions } } });
  invalidateRoles(churchId);
  return (await listRoles(t, churchId)).find((r) => r.key === key)!;
}

export async function deleteRole(t: Transaction, churchId: number, key: string): Promise<void> {
  const row = await selectOne<Record<string, any>>(t, 'SELECT id, is_system FROM church_roles WHERE church_id = ? AND role_key = ?', [churchId, key]);
  if (!row) throw new NotFoundError(`no role ${key}`);
  if (key === ADMIN_ROLE || key === DEFAULT_ROLE) throw new ForbiddenError(`the ${key} role is required and cannot be deleted`);
  const users = await selectOne<{ n: number | string }>(t, 'SELECT COUNT(*) AS n FROM users WHERE church_id = ? AND role = ?', [churchId, key]);
  if (Number(users?.n ?? 0) > 0) throw new ConflictError(`${users!.n} user(s) still hold ${key}; move them to another role first`);
  await select(t, 'DELETE FROM church_roles WHERE church_id = ? AND role_key = ? RETURNING id', [churchId, key]);
  await recordAudit(t, churchId, { action: 'role.delete', entityType: 'role', entityId: key, data: {} });
  invalidateRoles(churchId);
}

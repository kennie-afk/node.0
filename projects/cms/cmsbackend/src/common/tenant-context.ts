import { AsyncLocalStorage } from 'node:async_hooks';
import { ADMIN_ROLE, PERMISSIONS, type Role } from '../auth/permissions';
import type { TenantTx } from './tenant-db';

export interface TenantContext {
  churchId: number;
  userId: number;
  isAdmin: boolean;
  role: Role;
  /** What this request's role may do, resolved once per request from the church's own roles. */
  permissions: ReadonlySet<string>;
  requestId: string;
  /** The request-scoped database transaction; begun lazily by the first query. */
  tenantTx?: TenantTx;
}

const storage = new AsyncLocalStorage<TenantContext>();

export class MissingTenantError extends Error {
  constructor() {
    super(
      'no church is in scope for this operation; a tenant-scoped query was attempted outside an authenticated request'
    );
    this.name = 'MissingTenantError';
  }
}

export function runWithTenant<T>(
  context: Omit<TenantContext, 'role' | 'permissions'> & { role?: Role; permissions?: ReadonlySet<string> },
  callback: () => T
): T {
  const role: Role = context.role ?? (context.isAdmin ? ADMIN_ROLE : 'MEMBER');
  // Without resolved grants only the administrator is known to hold everything; anyone else holds nothing.
  const permissions = context.permissions ?? (role === ADMIN_ROLE ? new Set<string>(PERMISSIONS) : new Set<string>());
  return storage.run({ ...context, role, permissions }, callback);
}

export function currentTenant(): TenantContext {
  const context = storage.getStore();
  if (!context) {
    throw new MissingTenantError();
  }
  return context;
}

export function currentTenantOrNull(): TenantContext | null {
  return storage.getStore() ?? null;
}

export function currentChurchId(): number {
  return currentTenant().churchId;
}

/** True when the current request's role holds the permission (resolved from the church's own roles). */
export const holds = (permission: string): boolean => currentTenant().permissions.has(permission);

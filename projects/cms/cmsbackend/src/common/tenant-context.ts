import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '../auth/permissions';
import type { TenantTx } from './tenant-db';

export interface TenantContext {
  churchId: number;
  userId: number;
  isAdmin: boolean;
  role: Role;
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
  context: Omit<TenantContext, 'role'> & { role?: Role },
  callback: () => T
): T {
  const role: Role = context.role ?? (context.isAdmin ? 'ADMIN' : 'MEMBER');
  return storage.run({ ...context, role }, callback);
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

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  churchId: number;
  userId: number;
  isAdmin: boolean;
  requestId: string;
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

export function runWithTenant<T>(context: TenantContext, callback: () => T): T {
  return storage.run(context, callback);
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

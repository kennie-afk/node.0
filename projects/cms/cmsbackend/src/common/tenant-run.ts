import db from '@models';
import { runWithTenant, TenantContext } from './tenant-context';
import { createTenantTx } from './tenant-db';
import type { Role } from '../auth/permissions';
import { resolvePermissions } from '../modules/roles/roles.service';

export interface RunAsTenantOptions {
  userId?: number;
  role?: Role;
  requestId?: string;
  preferReplica?: boolean;
}

/**
 * Runs work on behalf of one church outside an HTTP request (background jobs, scripts, tests)
 * with the same guarantees a request gets: one transaction stamped with the church, committed if
 * the work succeeds and rolled back if it throws.
 */
export async function runAsTenant<T>(churchId: number, work: () => Promise<T>, options: RunAsTenantOptions = {}): Promise<T> {
  const tenantTx = createTenantTx(db.sequelize, churchId);
  tenantTx.preferReplica = options.preferReplica ?? false;
  const role = options.role ?? 'ADMIN';
  const context: TenantContext = {
    churchId,
    userId: options.userId ?? 0,
    isAdmin: role === 'ADMIN',
    role,
    permissions: await resolvePermissions(churchId, role, tenantTx),
    requestId: options.requestId ?? `job-${churchId}-${Date.now()}`,
    tenantTx
  };
  let result: T;
  try {
    result = await runWithTenant(context, work);
  } catch (error) {
    await tenantTx.finish(false).catch(() => undefined);
    throw error;
  }
  await tenantTx.finish(true);
  return result;
}

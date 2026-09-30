/**
 * Mirror of cmsbackend/src/auth/permissions.ts. The server is the authority and enforces every
 * rule; this copy exists only so the console can hide what a role cannot use. If the two drift,
 * the worst outcome is a menu item that answers 403, never a bypass. Keep them in step.
 */
export const ROLES = ['ADMIN', 'TREASURER', 'APPROVER', 'AUDITOR', 'PASTOR', 'SECRETARY', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'members:read',
  'members:write',
  'giving:read',
  'giving:write',
  'finance:read',
  'finance:post',
  'finance:approve',
  'finance:close',
  'finance:settings',
  'payroll:read',
  'payroll:run',
  'payroll:approve',
  'audit:read',
  'care:read',
  'care:write',
  'comms:send',
  'users:manage'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  TREASURER: ['members:read', 'giving:read', 'giving:write', 'finance:read', 'finance:post', 'finance:close', 'payroll:read', 'payroll:run'],
  APPROVER: ['members:read', 'giving:read', 'finance:read', 'finance:approve', 'payroll:read', 'payroll:approve'],
  AUDITOR: ['members:read', 'giving:read', 'finance:read', 'payroll:read', 'audit:read'],
  PASTOR: ['members:read', 'members:write', 'giving:read', 'finance:read', 'care:read', 'care:write', 'comms:send'],
  SECRETARY: ['members:read', 'members:write', 'care:read', 'comms:send'],
  MEMBER: []
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** A token issued before roles existed only carries isAdmin. */
export function effectiveRole(role: unknown, isAdmin: boolean): Role {
  if (isAdmin) return 'ADMIN';
  return isRole(role) ? role : 'MEMBER';
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => can(role, permission));
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  TREASURER: 'Treasurer',
  APPROVER: 'Approver',
  AUDITOR: 'Auditor',
  PASTOR: 'Pastor',
  SECRETARY: 'Secretary',
  MEMBER: 'Member'
};

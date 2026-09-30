/**
 * One matrix decides who may do what. Routes ask for a permission, never for a role, so adding a
 * role or moving a permission is a one-line change here and cannot be missed on some route.
 */
export const ROLES = [
  'ADMIN',
  'TREASURER',
  'APPROVER',
  'AUDITOR',
  'PASTOR',
  'SECRETARY',
  'MEMBER'
] as const;
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
  TREASURER: [
    'members:read',
    'giving:read',
    'giving:write',
    'finance:read',
    'finance:post',
    'finance:close',
    'payroll:read',
    'payroll:run'
  ],
  APPROVER: ['members:read', 'giving:read', 'finance:read', 'finance:approve', 'payroll:read', 'payroll:approve'],
  AUDITOR: ['members:read', 'giving:read', 'finance:read', 'payroll:read', 'audit:read'],
  PASTOR: ['members:read', 'members:write', 'giving:read', 'finance:read', 'care:read', 'care:write', 'comms:send'],
  SECRETARY: ['members:read', 'members:write', 'care:read', 'comms:send'],
  MEMBER: []
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** A token or row from before roles existed only knows isAdmin. */
export function effectiveRole(role: unknown, isAdmin: boolean): Role {
  if (isAdmin) return 'ADMIN';
  return isRole(role) ? role : 'MEMBER';
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsOf(role: Role): readonly Permission[] {
  return MATRIX[role];
}

/**
 * The vocabulary of permissions and the starting roles every church is given.
 *
 * Permission NAMES live here because route guards are written in code and must agree with them.
 * Which role holds which permission does not: that is data, per church, in the church_roles table
 * (src/modules/roles), editable by an administrator. DEFAULT_ROLES below only seeds a new church;
 * once seeded, the church's own rows are the authority and this list is never consulted again.
 */
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

/** A role is a per-church key such as TREASURER or a name the church invented. */
export type Role = string;

/** The one role that always holds every permission and cannot be edited or removed (no lock-outs). */
export const ADMIN_ROLE = 'ADMIN';
/** The role a person without one falls back to. */
export const DEFAULT_ROLE = 'MEMBER';
export const ROLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{1,19}$/;

/** What the role editor shows beside each permission. */
export const PERMISSION_INFO: Record<Permission, { group: string; description: string }> = {
  'members:read': { group: 'People', description: 'See members, families, ministries, events and sermons' },
  'members:write': { group: 'People', description: 'Add and change members, families, ministries, events and sermons' },
  'giving:read': { group: 'Giving', description: 'See gifts, pledges, campaigns and statements' },
  'giving:write': { group: 'Giving', description: 'Record, count and void gifts' },
  'finance:read': { group: 'Finance', description: 'See the ledger, reports, budgets and bills' },
  'finance:post': { group: 'Finance', description: 'Post journal entries, enter bills and make payments' },
  'finance:approve': { group: 'Finance', description: 'Approve bills and budgets' },
  'finance:close': { group: 'Finance', description: 'Close fiscal periods and years' },
  'finance:settings': { group: 'Finance', description: 'Change finance settings and reopen periods' },
  'payroll:read': { group: 'Payroll', description: 'See employees, pay runs and payslips' },
  'payroll:run': { group: 'Payroll', description: 'Prepare and pay payroll runs' },
  'payroll:approve': { group: 'Payroll', description: 'Approve payroll runs' },
  'audit:read': { group: 'Oversight', description: 'Read the audit trail and integrity checks' },
  'care:read': { group: 'Care', description: 'See pastoral notes, prayer requests and visits' },
  'care:write': { group: 'Care', description: 'Write pastoral notes, prayer requests and visits' },
  'comms:send': { group: 'Communication', description: 'Send messages to members' },
  'users:manage': { group: 'Administration', description: 'Manage users and roles' }
};

export interface RoleTemplate {
  key: string;
  label: string;
  description: string;
  permissions: readonly Permission[];
}

export const DEFAULT_ROLES: readonly RoleTemplate[] = [
  { key: 'ADMIN', label: 'Administrator', description: 'Everything, always', permissions: PERMISSIONS },
  {
    key: 'TREASURER',
    label: 'Treasurer',
    description: 'Records gifts, enters bills and runs payroll',
    permissions: ['members:read', 'giving:read', 'giving:write', 'finance:read', 'finance:post', 'finance:close', 'payroll:read', 'payroll:run']
  },
  {
    key: 'APPROVER',
    label: 'Approver',
    description: 'Approves bills, budgets and payroll',
    permissions: ['members:read', 'giving:read', 'finance:read', 'finance:approve', 'payroll:read', 'payroll:approve']
  },
  {
    key: 'AUDITOR',
    label: 'Auditor',
    description: 'Read-only access to the books and the audit trail',
    permissions: ['members:read', 'giving:read', 'finance:read', 'payroll:read', 'audit:read']
  },
  {
    key: 'PASTOR',
    label: 'Pastor',
    description: 'People, pastoral care and messaging',
    permissions: ['members:read', 'members:write', 'giving:read', 'finance:read', 'care:read', 'care:write', 'comms:send']
  },
  {
    key: 'SECRETARY',
    label: 'Secretary',
    description: 'Keeps member records and sends messages',
    permissions: ['members:read', 'members:write', 'care:read', 'comms:send']
  },
  { key: 'MEMBER', label: 'Member', description: 'Own account only', permissions: [] }
];

/** A token issued before roles existed only carries isAdmin. */
export function effectiveRole(role: unknown, isAdmin: boolean): Role {
  if (isAdmin) return ADMIN_ROLE;
  return typeof role === 'string' && role.length > 0 ? role : DEFAULT_ROLE;
}

export function isPermission(value: unknown): value is Permission {
  return typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);
}

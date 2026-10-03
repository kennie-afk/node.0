/**
 * Who may do what. One table, so the API, the console and the tests cannot disagree.
 *
 *  owner        everything, across every branch, including billing, settings and wages
 *  ops_manager  runs operations: guards, sites, rosters, swaps, overtime approval, incidents, patrol; no payroll or invoicing
 *  supervisor   works one branch: records attendance, scans patrols, edits that branch's roster, reports incidents; sees no wages
 *  payroll      wages and money: payroll runs and closing, deduction tables, client invoices and payments; reads operations
 *  auditor      reads everything, changes nothing
 *
 * Wages are sensitive: only owner, payroll and auditor may see what any guard is paid.
 */
export const ROLES = ['owner', 'ops_manager', 'supervisor', 'payroll', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'read'
  | 'salary_view'
  | 'guards_write'
  | 'sites_write'
  | 'roster_write'
  | 'swap_approve'
  | 'attendance_record'
  | 'attendance_override'
  | 'overtime_approve'
  | 'patrol_scan'
  | 'incident_write'
  | 'incident_close'
  | 'clients_write'
  | 'invoices_write'
  | 'payments_post'
  | 'payroll_run'
  | 'payroll_close'
  | 'rates_write'
  | 'reports'
  | 'settings'
  | 'team_write'
  | 'branches_write'
  | 'billing';

const ALL: readonly Role[] = ROLES;

const MATRIX: Record<Permission, readonly Role[]> = {
  read: ALL,
  salary_view: ['owner', 'payroll', 'auditor'],
  guards_write: ['owner', 'ops_manager'],
  sites_write: ['owner', 'ops_manager'],
  roster_write: ['owner', 'ops_manager', 'supervisor'],
  swap_approve: ['owner', 'ops_manager'],
  attendance_record: ['owner', 'ops_manager', 'supervisor'],
  attendance_override: ['owner', 'ops_manager', 'supervisor'],
  overtime_approve: ['owner', 'ops_manager'],
  patrol_scan: ['owner', 'ops_manager', 'supervisor'],
  incident_write: ['owner', 'ops_manager', 'supervisor'],
  incident_close: ['owner', 'ops_manager'],
  clients_write: ['owner', 'ops_manager', 'payroll'],
  invoices_write: ['owner', 'payroll'],
  payments_post: ['owner', 'payroll'],
  payroll_run: ['owner', 'payroll'],
  payroll_close: ['owner', 'payroll'],
  rates_write: ['owner', 'payroll'],
  reports: ['owner', 'ops_manager', 'payroll', 'auditor'],
  settings: ['owner'],
  team_write: ['owner', 'ops_manager'],
  branches_write: ['owner'],
  billing: ['owner']
};

export function can(role: string, permission: Permission): boolean {
  return (MATRIX[permission] as readonly string[]).includes(role);
}

export function permissionsOf(role: string): Permission[] {
  return (Object.keys(MATRIX) as Permission[]).filter((p) => can(role, p));
}

/** An ops manager may create supervisors only; the owner anyone but another owner. */
export function canGrantRole(actor: string, target: string): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'ops_manager') return target === 'supervisor';
  return false;
}

/**
 * Who may do what. One table, so the API, the console and the tests cannot disagree.
 *
 *  owner        everything, across every branch, including billing and settings
 *  manager      runs the day: approves loans and large withdrawals, assigns payments, staff below them
 *  loan_officer registers members, takes applications, appraises, runs statement analysis; cannot approve or pay out
 *  teller       registers members, posts deposits and repayments, assigns M-Pesa payments; cannot approve or lend
 *  accountant   disburses approved loans, posts journals, financial statements and returns
 *  auditor      reads everything, changes nothing
 *
 * Maker-checker (a loan's applicant, appraiser and approver are different people; a withdrawal's requester and approver
 * differ) is enforced by the services, on top of these permissions.
 */
export const ROLES = ['owner', 'manager', 'loan_officer', 'teller', 'accountant', 'auditor'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'read'
  | 'members_write'
  | 'savings_post'
  | 'withdraw_approve'
  | 'products_write'
  | 'loan_apply'
  | 'loan_appraise'
  | 'loan_approve'
  | 'loan_disburse'
  | 'loan_repay'
  | 'loan_writeoff'
  | 'penalties_run'
  | 'recon'
  | 'intake'
  | 'journal_post'
  | 'accounts_write'
  | 'returns'
  | 'reports'
  | 'settings'
  | 'team_write'
  | 'branches_write'
  | 'billing';

const ALL: readonly Role[] = ROLES;

const MATRIX: Record<Permission, readonly Role[]> = {
  read: ALL,
  members_write: ['owner', 'manager', 'loan_officer', 'teller'],
  savings_post: ['owner', 'manager', 'teller'],
  withdraw_approve: ['owner', 'manager'],
  products_write: ['owner', 'manager'],
  loan_apply: ['owner', 'manager', 'loan_officer'],
  loan_appraise: ['owner', 'manager', 'loan_officer'],
  loan_approve: ['owner', 'manager'],
  loan_disburse: ['owner', 'manager', 'accountant'],
  loan_repay: ['owner', 'manager', 'teller', 'loan_officer', 'accountant'],
  loan_writeoff: ['owner', 'manager'],
  penalties_run: ['owner', 'manager', 'accountant'],
  recon: ['owner', 'manager', 'teller', 'accountant'],
  intake: ['owner', 'manager', 'loan_officer'],
  journal_post: ['owner', 'accountant'],
  accounts_write: ['owner', 'accountant'],
  returns: ['owner', 'manager', 'accountant'],
  reports: ['owner', 'manager', 'accountant', 'auditor'],
  settings: ['owner'],
  team_write: ['owner', 'manager'],
  branches_write: ['owner'],
  billing: ['owner']
};

export function can(role: string, permission: Permission): boolean {
  return (MATRIX[permission] as readonly string[]).includes(role);
}

/** A manager may create staff below them, never another manager or an owner. */
export function canGrantRole(actor: string, target: string): boolean {
  if (actor === 'owner') return target !== 'owner';
  if (actor === 'manager') return target === 'loan_officer' || target === 'teller' || target === 'accountant' || target === 'auditor';
  return false;
}

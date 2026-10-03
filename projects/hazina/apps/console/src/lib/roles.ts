/**
 * The console's copy of the API's permission table (src/domain/roles.ts in the API). The API is the authority and refuses
 * anything this table lets through by mistake; the copy exists only so the menu and buttons do not offer what would be refused.
 */
export type Permission =
  | "read" | "members_write" | "savings_post" | "withdraw_approve" | "products_write" | "loan_apply" | "loan_appraise" | "loan_approve"
  | "loan_disburse" | "loan_repay" | "loan_writeoff" | "penalties_run" | "recon" | "intake" | "journal_post" | "accounts_write"
  | "returns" | "reports" | "settings" | "team_write" | "branches_write" | "billing";

const ALL = ["owner", "manager", "loan_officer", "teller", "accountant", "auditor"];
const MATRIX: Record<Permission, string[]> = {
  read: ALL,
  members_write: ["owner", "manager", "loan_officer", "teller"],
  savings_post: ["owner", "manager", "teller"],
  withdraw_approve: ["owner", "manager"],
  products_write: ["owner", "manager"],
  loan_apply: ["owner", "manager", "loan_officer"],
  loan_appraise: ["owner", "manager", "loan_officer"],
  loan_approve: ["owner", "manager"],
  loan_disburse: ["owner", "manager", "accountant"],
  loan_repay: ["owner", "manager", "teller", "loan_officer", "accountant"],
  loan_writeoff: ["owner", "manager"],
  penalties_run: ["owner", "manager", "accountant"],
  recon: ["owner", "manager", "teller", "accountant"],
  intake: ["owner", "manager", "loan_officer"],
  journal_post: ["owner", "accountant"],
  accounts_write: ["owner", "accountant"],
  returns: ["owner", "manager", "accountant"],
  reports: ["owner", "manager", "accountant", "auditor"],
  settings: ["owner"],
  team_write: ["owner", "manager"],
  branches_write: ["owner"],
  billing: ["owner"]
};

export const can = (role: string, permission: Permission): boolean => MATRIX[permission].includes(role);
/** The API serves /billing to owner and manager; only the owner pays. */
export const canSeeBilling = (role: string): boolean => role === "owner" || role === "manager";
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", manager: "Manager", loan_officer: "Loan officer", teller: "Teller", accountant: "Accountant", auditor: "Auditor" };

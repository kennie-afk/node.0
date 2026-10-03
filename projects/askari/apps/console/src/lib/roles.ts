/**
 * The console's copy of the API's permission table (src/domain/roles.ts in the API). The API is the authority and refuses anything this table
 * lets through by mistake; the copy exists only so the menu and buttons do not offer what would be refused.
 */
export type Permission =
  | "read" | "salary_view" | "guards_write" | "sites_write" | "roster_write" | "swap_approve" | "attendance_record" | "attendance_override" | "overtime_approve" | "patrol_scan"
  | "incident_write" | "incident_close" | "clients_write" | "invoices_write" | "payments_post" | "payroll_run" | "payroll_close" | "rates_write" | "reports" | "settings"
  | "team_write" | "branches_write" | "billing";

const ALL = ["owner", "ops_manager", "supervisor", "payroll", "auditor"];
const MATRIX: Record<Permission, string[]> = {
  read: ALL,
  salary_view: ["owner", "payroll", "auditor"],
  guards_write: ["owner", "ops_manager"],
  sites_write: ["owner", "ops_manager"],
  roster_write: ["owner", "ops_manager", "supervisor"],
  swap_approve: ["owner", "ops_manager"],
  attendance_record: ["owner", "ops_manager", "supervisor"],
  attendance_override: ["owner", "ops_manager", "supervisor"],
  overtime_approve: ["owner", "ops_manager"],
  patrol_scan: ["owner", "ops_manager", "supervisor"],
  incident_write: ["owner", "ops_manager", "supervisor"],
  incident_close: ["owner", "ops_manager"],
  clients_write: ["owner", "ops_manager", "payroll"],
  invoices_write: ["owner", "payroll"],
  payments_post: ["owner", "payroll"],
  payroll_run: ["owner", "payroll"],
  payroll_close: ["owner", "payroll"],
  rates_write: ["owner", "payroll"],
  reports: ["owner", "ops_manager", "payroll", "auditor"],
  settings: ["owner"],
  team_write: ["owner", "ops_manager"],
  branches_write: ["owner"],
  billing: ["owner"]
};

export const can = (role: string, permission: Permission): boolean => MATRIX[permission].includes(role);
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", ops_manager: "Operations manager", supervisor: "Supervisor", payroll: "Payroll", auditor: "Auditor" };

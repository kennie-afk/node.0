import { Banknote, BarChart3, BookOpen, Calculator, CalendarCheck, FileText, Gift, Handshake, Landmark, LayoutGrid, Library, PiggyBank, Receipt, Repeat, Scale, ScrollText, Settings2, ShieldCheck, Smartphone, Target, Users, Wallet, Wrench } from 'lucide-react';
import type { NavItem } from './types';

const READ = 'finance:read' as const;
const GIVING = ['giving:read', 'finance:read'] as const;

/**
 * Finance-side menu entries. The legacy "Contributions" screen stays in the Giving group for now;
 * "Gifts" is its replacement (receipts, funds, batches) and the two read the same records.
 */
export const financeNav: NavItem[] = [
  { label: 'Finance overview', path: '/finance', icon: LayoutGrid, group: 'finance', permission: [READ, 'giving:read'], order: 0, end: true },

  { label: 'Gifts', path: '/giving/contributions', icon: Gift, group: 'giving', permission: GIVING, order: 20 },
  { label: 'Counting batches', path: '/giving/batches', icon: Library, group: 'giving', permission: GIVING, order: 30 },
  { label: 'Pledges', path: '/giving/pledges', icon: Handshake, group: 'giving', permission: GIVING, order: 40 },
  { label: 'Campaigns', path: '/giving/campaigns', icon: Target, group: 'giving', permission: GIVING, order: 50 },
  { label: 'Recurring gifts', path: '/giving/recurring', icon: Repeat, group: 'giving', permission: GIVING, order: 60 },
  { label: 'M-Pesa inbox', path: '/giving/mpesa', icon: Smartphone, group: 'giving', permission: GIVING, order: 70 },
  { label: 'Giving statements', path: '/giving/statements', icon: FileText, group: 'giving', permission: GIVING, order: 80 },
  { label: 'Giving types', path: '/giving/types', icon: Wrench, group: 'giving', permission: GIVING, order: 90 },

  { label: 'Journal', path: '/finance/journal', icon: BookOpen, group: 'finance', permission: READ, order: 10 },
  { label: 'Chart of accounts', path: '/finance/accounts', icon: ScrollText, group: 'finance', permission: READ, order: 20 },
  { label: 'Funds', path: '/finance/funds', icon: PiggyBank, group: 'finance', permission: READ, order: 30 },
  { label: 'Budgets', path: '/budgets', icon: Calculator, group: 'finance', permission: READ, order: 40 },
  { label: 'Cash & bank', path: '/banking/accounts', icon: Landmark, group: 'finance', permission: READ, order: 50 },
  { label: 'Reconciliations', path: '/banking/reconciliations', icon: Scale, group: 'finance', permission: READ, order: 55 },
  { label: 'Fiscal periods', path: '/finance/periods', icon: CalendarCheck, group: 'finance', permission: READ, order: 60 },
  { label: 'Audit & integrity', path: '/finance/audit', icon: ShieldCheck, group: 'finance', permission: 'audit:read', order: 70 },
  { label: 'Finance settings', path: '/finance/settings', icon: Settings2, group: 'finance', permission: READ, order: 80 },

  { label: 'Bills', path: '/payables/bills', icon: Receipt, group: 'payables', permission: READ, order: 10 },
  { label: 'Vendors', path: '/payables/vendors', icon: Users, group: 'payables', permission: READ, order: 20 },
  { label: 'Petty cash', path: '/payables/petty-cash', icon: Wallet, group: 'payables', permission: READ, order: 30 },
  { label: 'Payables aging', path: '/payables/aging', icon: Banknote, group: 'payables', permission: READ, order: 40 },

  { label: 'Pay runs', path: '/payroll/runs', icon: Banknote, group: 'payroll', permission: 'payroll:read', order: 10 },
  { label: 'Employees', path: '/payroll/employees', icon: Users, group: 'payroll', permission: 'payroll:read', order: 20 },
  { label: 'Staff advances', path: '/payroll/advances', icon: Wallet, group: 'payroll', permission: 'payroll:read', order: 30 },
  { label: 'Statutory', path: '/payroll/statutory', icon: Scale, group: 'payroll', permission: 'payroll:read', order: 40 },
  { label: 'Rates', path: '/payroll/rates', icon: ScrollText, group: 'payroll', permission: 'payroll:read', order: 50 },

  { label: 'All reports', path: '/reports', icon: BarChart3, group: 'reports', permission: [READ, 'giving:read'], order: 0, end: true },
  { label: 'Income statement', path: '/reports/income-statement', icon: FileText, group: 'reports', permission: READ, order: 10 },
  { label: 'Balance sheet', path: '/reports/balance-sheet', icon: Scale, group: 'reports', permission: READ, order: 20 },
  { label: 'Cash flow', path: '/reports/cash-flow', icon: Banknote, group: 'reports', permission: READ, order: 30 },
  { label: 'Giving reports', path: '/reports/giving', icon: Gift, group: 'reports', permission: GIVING, order: 40 }
];

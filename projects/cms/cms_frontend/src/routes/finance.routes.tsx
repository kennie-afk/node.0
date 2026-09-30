import type { ReactElement } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { lazyPage } from './lazy';

/** Finance-side routes: giving, ledger, payables, banking, budgets, payroll and reports. */
const page = (key: string, path: string, loader: Parameters<typeof lazyPage>[0], permission?: Parameters<typeof lazyPage>[1]): ReactElement => (
  <Route key={key} path={path} element={lazyPage(loader, permission)} />
);

const GIVING_READ = ['giving:read', 'finance:read'] as const;
const GIVING_WRITE = 'giving:write' as const;
const FIN_READ = 'finance:read' as const;
const FIN_POST = 'finance:post' as const;
const PAY_READ = 'payroll:read' as const;
const PAY_RUN = 'payroll:run' as const;

export const financeRoutes: ReactElement[] = [
  page('fin-overview', '/finance', () => import('../pages/finance/FinanceOverviewPage'), [FIN_READ, 'giving:read']),

  // ---- Giving
  <Route key="giving-index" path="/giving" element={<Navigate to="/giving/contributions" replace />} />,
  page('giving-gifts', '/giving/contributions', () => import('../pages/giving/ContributionsPage'), GIVING_READ),
  page('giving-gift-new', '/giving/contributions/new', () => import('../pages/giving/ContributionFormPage'), GIVING_WRITE),
  page('giving-gift', '/giving/contributions/:id', () => import('../pages/giving/ContributionDetailPage'), GIVING_READ),
  page('giving-types', '/giving/types', () => import('../pages/giving/GivingTypesPage'), GIVING_READ),
  page('giving-type-new', '/giving/types/new', () => import('../pages/giving/GivingTypeFormPage'), GIVING_WRITE),
  page('giving-type-edit', '/giving/types/:id/edit', () => import('../pages/giving/GivingTypeFormPage'), GIVING_WRITE),
  page('giving-batches', '/giving/batches', () => import('../pages/giving/BatchesPage'), GIVING_READ),
  page('giving-batch-new', '/giving/batches/new', () => import('../pages/giving/BatchNewPage'), GIVING_WRITE),
  page('giving-batch', '/giving/batches/:id', () => import('../pages/giving/BatchDetailPage'), GIVING_READ),
  page('giving-batch-entry', '/giving/batches/:id/entry', () => import('../pages/giving/BatchEntryPage'), GIVING_WRITE),
  page('giving-campaigns', '/giving/campaigns', () => import('../pages/giving/CampaignsPage'), GIVING_READ),
  page('giving-campaign-new', '/giving/campaigns/new', () => import('../pages/giving/CampaignFormPage'), GIVING_WRITE),
  page('giving-campaign', '/giving/campaigns/:id', () => import('../pages/giving/CampaignDetailPage'), GIVING_READ),
  page('giving-campaign-edit', '/giving/campaigns/:id/edit', () => import('../pages/giving/CampaignFormPage'), GIVING_WRITE),
  page('giving-pledges', '/giving/pledges', () => import('../pages/giving/PledgesPage'), GIVING_READ),
  page('giving-pledge-new', '/giving/pledges/new', () => import('../pages/giving/PledgeFormPage'), GIVING_WRITE),
  page('giving-pledge', '/giving/pledges/:id', () => import('../pages/giving/PledgeDetailPage'), GIVING_READ),
  page('giving-pledge-edit', '/giving/pledges/:id/edit', () => import('../pages/giving/PledgeFormPage'), GIVING_WRITE),
  page('giving-recurring', '/giving/recurring', () => import('../pages/giving/RecurringPage'), GIVING_READ),
  page('giving-recurring-new', '/giving/recurring/new', () => import('../pages/giving/RecurringFormPage'), GIVING_WRITE),
  page('giving-statements', '/giving/statements', () => import('../pages/giving/StatementsPage'), GIVING_READ),
  page('giving-statement', '/giving/statements/:memberId', () => import('../pages/giving/StatementPage'), GIVING_READ),
  page('giving-mpesa', '/giving/mpesa', () => import('../pages/giving/MpesaInboxPage'), GIVING_READ),
  page('giving-mpesa-stk', '/giving/mpesa/stk', () => import('../pages/giving/MpesaStkPage'), GIVING_WRITE),
  page('giving-mpesa-allocate', '/giving/mpesa/:id/allocate', () => import('../pages/giving/MpesaAllocatePage'), GIVING_WRITE),

  // ---- Ledger
  <Route key="finance-journal-index" path="/finance/ledger" element={<Navigate to="/finance/journal" replace />} />,
  page('fin-journal', '/finance/journal', () => import('../pages/finance/JournalPage'), FIN_READ),
  page('fin-journal-new', '/finance/journal/new', () => import('../pages/finance/JournalFormPage'), FIN_POST),
  page('fin-journal-entry', '/finance/journal/:id', () => import('../pages/finance/JournalEntryPage'), FIN_READ),
  page('fin-transfer-new', '/finance/transfers/new', () => import('../pages/finance/TransferFormPage'), FIN_POST),
  page('fin-accounts', '/finance/accounts', () => import('../pages/finance/AccountsPage'), FIN_READ),
  page('fin-account-new', '/finance/accounts/new', () => import('../pages/finance/AccountFormPage'), FIN_POST),
  page('fin-account-edit', '/finance/accounts/:id/edit', () => import('../pages/finance/AccountFormPage'), FIN_POST),
  page('fin-account-register', '/finance/accounts/:id/register', () => import('../pages/finance/AccountRegisterPage'), FIN_READ),
  page('fin-funds', '/finance/funds', () => import('../pages/finance/FundsPage'), FIN_READ),
  page('fin-fund-new', '/finance/funds/new', () => import('../pages/finance/FundFormPage'), FIN_POST),
  page('fin-fund-edit', '/finance/funds/:id/edit', () => import('../pages/finance/FundFormPage'), FIN_POST),
  page('fin-periods', '/finance/periods', () => import('../pages/finance/PeriodsPage'), FIN_READ),
  page('fin-close-year', '/finance/periods/close-year/:id', () => import('../pages/finance/CloseYearPage'), 'finance:close'),
  page('fin-settings', '/finance/settings', () => import('../pages/finance/SettingsPage'), FIN_READ),
  page('fin-audit', '/finance/audit', () => import('../pages/finance/AuditPage'), [FIN_READ, 'audit:read']),

  // ---- Payables
  <Route key="pay-index" path="/payables" element={<Navigate to="/payables/bills" replace />} />,
  page('pay-bills', '/payables/bills', () => import('../pages/payables/BillsPage'), FIN_READ),
  page('pay-bill-new', '/payables/bills/new', () => import('../pages/payables/BillFormPage'), FIN_POST),
  page('pay-claim-new', '/payables/claims/new', () => import('../pages/payables/BillFormPage'), FIN_POST),
  page('pay-bill', '/payables/bills/:id', () => import('../pages/payables/BillDetailPage'), FIN_READ),
  page('pay-bill-edit', '/payables/bills/:id/edit', () => import('../pages/payables/BillFormPage'), FIN_POST),
  page('pay-bill-pay', '/payables/bills/:id/pay', () => import('../pages/payables/BillPayPage'), FIN_POST),
  page('pay-vendors', '/payables/vendors', () => import('../pages/payables/VendorsPage'), FIN_READ),
  page('pay-vendor-new', '/payables/vendors/new', () => import('../pages/payables/VendorFormPage'), FIN_POST),
  page('pay-vendor-edit', '/payables/vendors/:id/edit', () => import('../pages/payables/VendorFormPage'), FIN_POST),
  page('pay-petty', '/payables/petty-cash', () => import('../pages/payables/PettyCashPage'), FIN_READ),
  page('pay-petty-new', '/payables/petty-cash/new', () => import('../pages/payables/VoucherFormPage'), FIN_POST),
  page('pay-aging', '/payables/aging', () => import('../pages/payables/AgingPage'), FIN_READ),

  // ---- Banking
  <Route key="bank-index" path="/banking" element={<Navigate to="/banking/accounts" replace />} />,
  page('bank-accounts', '/banking/accounts', () => import('../pages/banking/BankAccountsPage'), FIN_READ),
  page('bank-account-new', '/banking/accounts/new', () => import('../pages/banking/BankAccountFormPage'), FIN_POST),
  page('bank-account', '/banking/accounts/:id', () => import('../pages/banking/BankAccountPage'), FIN_READ),
  page('bank-import', '/banking/accounts/:id/import', () => import('../pages/banking/StatementImportPage'), FIN_POST),
  page('bank-match', '/banking/accounts/:id/match', () => import('../pages/banking/MatchingPage'), FIN_READ),
  page('bank-reconcile-new', '/banking/accounts/:id/reconcile/new', () => import('../pages/banking/ReconcileNewPage'), FIN_POST),
  page('bank-line-entry', '/banking/lines/:id/create-entry', () => import('../pages/banking/LineEntryPage'), FIN_POST),
  page('bank-recs', '/banking/reconciliations', () => import('../pages/banking/ReconciliationsPage'), FIN_READ),
  page('bank-rec', '/banking/reconciliations/:id', () => import('../pages/banking/ReconciliationPage'), FIN_READ),

  // ---- Budgets
  page('budgets', '/budgets', () => import('../pages/budgets/BudgetsPage'), FIN_READ),
  page('budget-new', '/budgets/new', () => import('../pages/budgets/BudgetNewPage'), FIN_POST),
  page('budget', '/budgets/:id', () => import('../pages/budgets/BudgetEditorPage'), FIN_READ),
  page('budget-copy', '/budgets/:id/copy', () => import('../pages/budgets/BudgetCopyPage'), FIN_POST),
  page('budget-variance', '/budgets/:id/variance', () => import('../pages/budgets/VariancePage'), FIN_READ),

  // ---- Payroll
  <Route key="payroll-index" path="/payroll" element={<Navigate to="/payroll/runs" replace />} />,
  page('payroll-runs', '/payroll/runs', () => import('../pages/payroll/RunsPage'), PAY_READ),
  page('payroll-run-new', '/payroll/runs/new', () => import('../pages/payroll/RunNewPage'), PAY_RUN),
  page('payroll-run', '/payroll/runs/:id', () => import('../pages/payroll/RunDetailPage'), PAY_READ),
  page('payroll-run-pay', '/payroll/runs/:id/pay', () => import('../pages/payroll/RunPayPage'), PAY_RUN),
  page('payroll-run-remit', '/payroll/runs/:id/remit', () => import('../pages/payroll/RunRemitPage'), PAY_RUN),
  page('payroll-payslip', '/payroll/runs/:id/payslips/:employeeId', () => import('../pages/payroll/PayslipPage'), PAY_READ),
  page('payroll-employees', '/payroll/employees', () => import('../pages/payroll/EmployeesPage'), PAY_READ),
  page('payroll-employee-new', '/payroll/employees/new', () => import('../pages/payroll/EmployeeFormPage'), PAY_RUN),
  page('payroll-employee-edit', '/payroll/employees/:id/edit', () => import('../pages/payroll/EmployeeFormPage'), PAY_RUN),
  page('payroll-advances', '/payroll/advances', () => import('../pages/payroll/AdvancesPage'), PAY_READ),
  page('payroll-advance-new', '/payroll/advances/new', () => import('../pages/payroll/AdvanceFormPage'), PAY_RUN),
  page('payroll-statutory', '/payroll/statutory', () => import('../pages/payroll/StatutoryPage'), PAY_READ),
  page('payroll-rates', '/payroll/rates', () => import('../pages/payroll/RatesPage'), PAY_READ),

  // ---- Reports
  page('reports', '/reports', () => import('../pages/reports/ReportsHubPage'), [FIN_READ, 'giving:read']),
  page('report-income', '/reports/income-statement', () => import('../pages/reports/IncomeStatementPage'), FIN_READ),
  page('report-balance', '/reports/balance-sheet', () => import('../pages/reports/BalanceSheetPage'), FIN_READ),
  page('report-cashflow', '/reports/cash-flow', () => import('../pages/reports/CashFlowPage'), FIN_READ),
  page('report-funds', '/reports/fund-balances', () => import('../pages/reports/FundBalancesPage'), FIN_READ),
  page('report-trial', '/reports/trial-balance', () => import('../pages/reports/TrialBalancePage'), FIN_READ),
  page('report-gl', '/reports/general-ledger', () => import('../pages/reports/GeneralLedgerPage'), FIN_READ),
  page('report-ministry', '/reports/expenses-by-ministry', () => import('../pages/reports/MinistryExpensesPage'), FIN_READ),
  page('report-giving', '/reports/giving', () => import('../pages/reports/GivingReportsPage'), GIVING_READ)
];

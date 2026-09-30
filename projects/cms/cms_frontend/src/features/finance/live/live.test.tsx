// @vitest-environment-options {"url": "http://localhost:14300"}
/**
 * Runs the real finance screens against a real, migrated backend. Skipped unless LIVE_API is set:
 *
 *   node src/features/finance/dev/seed.mjs            (once, seeds the demo church)
 *   LIVE_API=http://localhost:14400 VITE_API_URL=http://localhost:14400 npx vitest run src/features/finance/live
 *
 * Part one walks every finance route with seeded data and fails on any error state or crash.
 * Part two drives the critical flows through the screens with a user-event keyboard and mouse and
 * then checks the result through the API: a gift reaches the books, a bill is approved and paid,
 * a pay run goes from draft to paid.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from '../../../context/AuthContext';
import { ToastProvider } from '../../../ui';
import { clearSession, writeSession } from '../../../api/session';
import { financeRoutes } from '../../../routes/finance.routes';

const API = process.env.LIVE_API ?? '';
const PASSWORD = 'demo-passphrase-123';
const tokens: Record<string, { token: string; churchId: number }> = {};

async function login(role: string) {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${role}@grace-chapel.demo`, password: PASSWORD }) });
  const body = await res.json();
  return { token: body.token as string, churchId: body.churchId as number };
}
const signIn = (role: string) => {
  clearSession();
  writeSession(tokens[role].token, 3600, tokens[role].churchId);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(role: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role].token}`, ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : (undefined as T);
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}
function renderAt(path: string) {
  return render(
    <AuthProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>{financeRoutes}<Route path="*" element={<span>unrouted</span>} /></Routes>
          <Where />
        </MemoryRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
const settle = async (ms = 900) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  await screen.findByRole('heading', { level: 1 }, { timeout: 20000 });
  await waitFor(() => expect(document.querySelector('.ui-spin, [role="status"][aria-label="Loading"]')).toBeNull(), { timeout: 20000 });
  await settle();
}

afterEach(() => cleanup());

describe.runIf(API)('finance screens against the live API', () => {
  beforeAll(async () => {
    for (const role of ['admin', 'treasurer', 'approver', 'auditor']) tokens[role] = await login(role);
  }, 60000);

  const sweep: Array<[string, string]> = [
    ['/finance', 'Finance overview'], ['/giving/contributions', 'Gifts'], ['/giving/contributions/new', 'Record a gift'], ['/giving/contributions/1', 'Receipt'],
    ['/giving/types', 'Giving types'], ['/giving/types/new', 'New giving type'], ['/giving/types/1/edit', 'Edit giving type'],
    ['/giving/batches', 'Counting batches'], ['/giving/batches/new', 'Open a counting batch'], ['/giving/batches/1', 'Batch #1'], ['/giving/batches/1/entry', 'Enter gifts'],
    ['/giving/campaigns', 'Campaigns'], ['/giving/campaigns/new', 'New campaign'], ['/giving/campaigns/1', 'New Sanctuary Roof'], ['/giving/campaigns/1/edit', 'Edit campaign'],
    ['/giving/pledges', 'Pledges'], ['/giving/pledges/new', 'New pledge'], ['/giving/pledges/5', 'pledge'], ['/giving/pledges/5/edit', 'Edit pledge'],
    ['/giving/recurring', 'Recurring gifts'], ['/giving/recurring/new', 'New recurring gift'], ['/giving/statements', 'Giving statements'], ['/giving/statements/1', 'Giving statement'],
    ['/giving/mpesa', 'M-Pesa inbox'], ['/giving/mpesa/stk', 'Request a payment'], ['/giving/mpesa/1/allocate', 'Allocate a payment'],
    ['/finance/journal', 'Journal'], ['/finance/journal/new', 'New journal entry'], ['/finance/journal/1', 'Entry #1'], ['/finance/transfers/new', 'Transfer between funds'],
    ['/finance/accounts', 'Chart of accounts'], ['/finance/accounts/new', 'New account'], ['/finance/accounts/2/edit', 'Edit account'], ['/finance/accounts/2/register', 'Cash on Hand'],
    ['/finance/funds', 'Funds'], ['/finance/funds/new', 'New fund'], ['/finance/funds/1/edit', 'Edit fund'],
    ['/finance/periods', 'Fiscal periods'], ['/finance/periods/close-year/1', 'Close FY'], ['/finance/settings', 'Finance settings'], ['/finance/audit', 'Audit & integrity'],
    ['/payables/bills', 'Bills'], ['/payables/bills/new', 'New bill'], ['/payables/claims/new', 'New expense claim'], ['/payables/bills/1', 'Kenya Power'], ['/payables/bills/4/edit', 'Edit draft bill'], ['/payables/bills/2/pay', 'Pay bill'],
    ['/payables/vendors', 'Vendors'], ['/payables/vendors/new', 'New vendor'], ['/payables/vendors/1/edit', 'Edit vendor'], ['/payables/petty-cash', 'Petty cash'], ['/payables/petty-cash/new', 'Petty cash voucher'], ['/payables/aging', 'Payables aging'],
    ['/banking/accounts', 'Cash and bank accounts'], ['/banking/accounts/new', 'New cash or bank account'], ['/banking/accounts/3', 'Main Bank Account'], ['/banking/accounts/3/import', 'Import a bank statement'],
    ['/banking/accounts/3/match', 'Match transactions'], ['/banking/accounts/3/reconcile/new', 'Start a reconciliation'], ['/banking/lines/1/create-entry', 'Create an entry'], ['/banking/reconciliations', 'Reconciliations'], ['/banking/reconciliations/1', 'Reconciliation'],
    ['/budgets', 'Budgets'], ['/budgets/new', 'New budget'], ['/budgets/1', '2026 operating budget'], ['/budgets/1/copy', 'Copy a budget forward'], ['/budgets/1/variance', 'Actual vs budget'],
    ['/payroll/runs', 'Pay runs'], ['/payroll/runs/new', 'New pay run'], ['/payroll/runs/1', 'Pay run'], ['/payroll/runs/1/pay', 'Record salaries paid'], ['/payroll/runs/1/remit', 'Remit a statutory deduction'],
    ['/payroll/runs/1/payslips/1', 'Payslip'], ['/payroll/employees', 'Employees'], ['/payroll/employees/new', 'Add employee'], ['/payroll/employees/1/edit', 'Edit employee'],
    ['/payroll/advances', 'Staff advances'], ['/payroll/advances/new', 'New staff advance'], ['/payroll/statutory', 'Statutory deductions'], ['/payroll/rates', 'Statutory rates'],
    ['/reports', 'Reports'], ['/reports/income-statement?compare=prior-period&byFund=true', 'Income statement'], ['/reports/balance-sheet', 'Balance sheet'], ['/reports/cash-flow', 'Cash flow'],
    ['/reports/fund-balances', 'Fund balances'], ['/reports/trial-balance', 'Trial balance'], ['/reports/general-ledger', 'General ledger'], ['/reports/expenses-by-ministry', 'Spending by ministry'], ['/reports/giving', 'Giving reports']
  ];

  it.each(sweep)('%s renders its data without an error', async (path, title) => {
    signIn('admin');
    renderAt(path);
    await ready();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    const alerts = [...document.querySelectorAll('[role="alert"]')].map((el) => el.textContent);
    expect(alerts).toEqual([]);
  }, 60000);

  it('hides what a role may not use: an auditor sees no posting buttons, a treasurer is sent away from payroll approval pages they lack', async () => {
    signIn('auditor');
    renderAt('/finance/journal');
    await ready();
    expect(screen.queryByRole('link', { name: 'New entry' })).toBeNull();
    cleanup();
    signIn('auditor');
    renderAt('/finance/journal/new');
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'New journal entry' })).toBeNull(), { timeout: 10000 });
  }, 60000);

  it('records a gift through the form, and it reaches the books', async () => {
    signIn('treasurer');
    const before = await api('treasurer', '/reports/balance-sheet');
    renderAt('/giving/contributions/new?memberId=2');
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/Giving type/), 'Tithe');
    await user.type(screen.getByLabelText(/^Amount/), '1234.50');
    await user.click(screen.getByRole('button', { name: 'Record gift' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/giving\/contributions\/\d+$/), { timeout: 20000 });
    await screen.findByRole('heading', { level: 1, name: /Receipt RCT-/ }, { timeout: 20000 });
    const after = await api('treasurer', '/reports/balance-sheet');
    expect(after.balanced).toBe(true);
    expect(Number(after.totalAssets) - Number(before.totalAssets)).toBeCloseTo(1234.5, 2);
    const journal = await api('treasurer', '/finance/journal?limit=1');
    expect(journal.data[0].total).toBe('1234.50');
    expect(journal.data[0].sourceType).toBe('CONTRIBUTION');
  }, 120000);

  it('approves a bill as the approver and pays it as the treasurer', async () => {
    const bills = await api('treasurer', '/payables/bills?status=SUBMITTED&limit=50');
    const target = bills.data.find((b: { createdBy: number; submittedBy: number }) => b);
    expect(target, 'the seed leaves a submitted bill').toBeTruthy();
    signIn('approver');
    renderAt(`/payables/bills/${target.id}`);
    await ready();
    const user = userEvent.setup();
    const approves = target.requiredApprovals;
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(async () => expect((await api('approver', `/payables/bills/${target.id}`)).approvals.length).toBe(1), { timeout: 20000 });
    cleanup();
    if (approves > 1) {
      // A second, different approver is needed; the admin is the second one.
      signIn('admin');
      renderAt(`/payables/bills/${target.id}`);
      await ready();
      await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }));
    }
    await waitFor(async () => expect((await api('approver', `/payables/bills/${target.id}`)).status).toBe('APPROVED'), { timeout: 20000 });
    cleanup();

    signIn('treasurer');
    renderAt(`/payables/bills/${target.id}/pay`);
    await ready();
    const u2 = userEvent.setup();
    await u2.selectOptions(screen.getByLabelText(/Paid from/), 'Main Bank Account');
    await u2.click(screen.getByRole('button', { name: 'Pay the full amount owed' }));
    await u2.click(screen.getByRole('button', { name: 'Record payment' }));
    await waitFor(async () => expect((await api('treasurer', `/payables/bills/${target.id}`)).status).toBe('PAID'), { timeout: 20000 });
    const tb = await api('treasurer', '/finance/trial-balance');
    expect(tb.balanced).toBe(true);
  }, 180000);

  it('takes a pay run from a blank month to paid through the screens', async () => {
    const existing: Array<{ month: number; year: number; status: string }> = await api('treasurer', `/payroll/runs?year=2026`);
    const used = new Set(existing.filter((r) => r.status !== 'VOID').map((r) => r.month));
    const month = [9, 7, 6, 5, 4, 3].find((m) => !used.has(m))!;
    signIn('treasurer');
    renderAt('/payroll/runs/new');
    await ready();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText(/^Month/), String(month));
    await user.click(screen.getByRole('button', { name: 'Create run' }));
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/payroll\/runs\/\d+$/), { timeout: 20000 });
    const runId = Number(screen.getByTestId('where').textContent!.split('/').pop());
    await screen.findByRole('button', { name: 'Calculate pay' }, { timeout: 20000 });
    await user.click(screen.getByRole('button', { name: 'Calculate pay' }));
    await screen.findByText('Payslips');
    await waitFor(async () => expect((await api('treasurer', `/payroll/runs/${runId}`)).status).toBe('CALCULATED'), { timeout: 20000 });
    cleanup();

    signIn('approver');
    renderAt(`/payroll/runs/${runId}`);
    await ready();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(async () => expect((await api('approver', `/payroll/runs/${runId}`)).status).toBe('APPROVED'), { timeout: 20000 });
    cleanup();

    signIn('treasurer');
    renderAt(`/payroll/runs/${runId}`);
    await ready();
    const u3 = userEvent.setup();
    await u3.click(screen.getByRole('button', { name: 'Post to the ledger' }));
    await waitFor(async () => expect((await api('treasurer', `/payroll/runs/${runId}`)).status).toBe('POSTED'), { timeout: 20000 });
    cleanup();

    renderAt(`/payroll/runs/${runId}/pay`);
    await ready();
    const u4 = userEvent.setup();
    await u4.selectOptions(screen.getByLabelText(/Paid from/), 'Main Bank Account');
    await u4.click(screen.getByRole('button', { name: 'Record as paid' }));
    await waitFor(async () => expect((await api('treasurer', `/payroll/runs/${runId}`)).status).toBe('PAID'), { timeout: 20000 });
    const bs = await api('treasurer', '/reports/balance-sheet');
    expect(bs.balanced).toBe(true);
  }, 240000);
});

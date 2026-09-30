import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, Field, FilterBar, PageHeader, Select, StatusPill, useQuery } from '../../ui';
import { listBudgets, type BudgetSummary } from '../../api/budgetsApi';
import { listFiscalYears } from '../../api/financeApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';

export default function BudgetsPage() {
  const { can } = useAuth();
  const [yearId, setYearId] = useState('');
  const years = useQuery(() => listFiscalYears(), []);
  const { data, error, loading, refetch } = useQuery(() => listBudgets(yearId ? Number(yearId) : undefined), [yearId]);
  const yearName = (id: number) => years.data?.find((y) => y.id === id)?.name ?? `#${id}`;
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Budgets" subtitle="Plan the year by account, fund and month, then watch actuals against it" actions={can('finance:post') && <Button to="/budgets/new" variant="primary" size="sm">New budget</Button>} />
      <FilterBar><Field label="Fiscal year">{(c) => <Select {...c} value={yearId} onChange={(e) => setYearId(e.target.value)}><option value="">All years</option>{(years.data ?? []).map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</Select>}</Field></FilterBar>
      <DataTable<BudgetSummary>
        rowKey={(b) => b.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowHref={(b) => `/budgets/${b.id}`}
        columns={[
          { key: 'name', header: 'Budget' },
          { key: 'year', header: 'Year', render: (b) => yearName(b.fiscalYearId) },
          { key: 'inc', header: 'Planned income', numeric: true, render: (b) => <Money value={b.totalIncome} /> },
          { key: 'exp', header: 'Planned spending', numeric: true, render: (b) => <Money value={b.totalExpense} /> },
          { key: 'status', header: 'Status', render: (b) => <StatusPill status={b.status} /> },
          { key: 'var', header: '', render: (b) => <Link to={`/budgets/${b.id}/variance`}>Actual vs budget</Link> }
        ]}
        empty={<EmptyState title="No budgets" message="Create a budget for the year. Only one budget can be active per fiscal year." action={can('finance:post') ? <Link to="/budgets/new">New budget</Link> : undefined} />}
      />
    </div>
  );
}

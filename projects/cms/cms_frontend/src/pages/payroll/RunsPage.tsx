import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, Field, FilterBar, monthLabel, PageHeader, Select, StatusPill, useQuery } from '../../ui';
import { listRuns, type Run } from '../../api/payrollApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { yearsBack } from '../../features/finance/components/helpers';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function RunsPage() {
  const { can } = useAuth();
  const [year, setYear] = useState(String(new Date().getUTCFullYear()));
  const { data, error, loading, refetch } = useQuery(() => listRuns(year ? Number(year) : undefined), [year]);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Pay runs" subtitle="One run per month: calculate, approve, post, pay, remit" actions={can('payroll:run') && <Button to="/payroll/runs/new" variant="primary" size="sm">New pay run</Button>} />
      <SectionTabs section="payroll" active="/payroll/runs" />
      <FilterBar><Field label="Year">{(c) => <Select {...c} value={year} onChange={(e) => setYear(e.target.value)}>{yearsBack().map((y) => <option key={y}>{y}</option>)}<option value="">All years</option></Select>}</Field></FilterBar>
      <DataTable<Run>
        rowKey={(r) => r.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowHref={(r) => `/payroll/runs/${r.id}`}
        columns={[
          { key: 'period', header: 'Month', render: (r) => `${monthLabel(r.month)} ${r.year}` },
          { key: 'n', header: 'Staff', numeric: true, render: (r) => r.employeeCount },
          { key: 'gross', header: 'Gross', numeric: true, render: (r) => <Money value={r.totals.gross} /> },
          { key: 'paye', header: 'PAYE', numeric: true, render: (r) => <Money value={r.totals.paye} /> },
          { key: 'net', header: 'Net pay', numeric: true, render: (r) => <Money value={r.totals.net} strong /> },
          { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} /> }
        ]}
        empty={<EmptyState title="No pay runs" message="Start this month’s run once your employees are set up." action={can('payroll:run') ? <Link to="/payroll/runs/new">New pay run</Link> : undefined} />}
      />
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, Field, FilterBar, LoadMore, PageHeader, SearchInput, Select, StatusPill, useKeysetList } from '../../ui';
import type { Employee } from '../../api/payrollApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function EmployeesPage() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const list = useKeysetList<Employee>('/payroll/employees', { q, status });
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Employees" subtitle="Everyone who goes on the payroll" actions={can('payroll:run') && <Button to="/payroll/employees/new" variant="primary" size="sm">Add employee</Button>} />
      <SectionTabs section="payroll" active="/payroll/employees" />
      <FilterBar>
        <SearchInput onSearch={setQ} placeholder="Search by name" />
        <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select>}</Field>
      </FilterBar>
      <DataTable<Employee>
        rowKey={(e) => e.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(e) => `/payroll/employees/${e.id}/edit`}
        columns={[
          { key: 'name', header: 'Name', render: (e) => e.fullName },
          { key: 'title', header: 'Role', render: (e) => e.jobTitle ?? '-' },
          { key: 'pin', header: 'KRA PIN', render: (e) => e.kraPin ?? <span className="fin-muted">missing</span> },
          { key: 'basic', header: 'Basic salary', numeric: true, render: (e) => <Money value={e.basicSalary} /> },
          { key: 'allow', header: 'Allowances', numeric: true, render: (e) => <Money value={e.allowances.reduce((s, a) => s + Math.round(Number(a.amount) * 100), 0) / 100 + ''} muted /> },
          { key: 'since', header: 'Since', render: (e) => e.startDate },
          { key: 'status', header: 'Status', render: (e) => <StatusPill status={e.status} /> }
        ]}
        empty={<EmptyState title="No employees" message="Add pastors and staff, then run payroll each month." action={can('payroll:run') ? <Link to="/payroll/employees/new">Add employee</Link> : undefined} />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="employees" />}
      />
    </div>
  );
}

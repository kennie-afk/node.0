import { Button, DataTable, EmptyState, PageHeader, useQuery } from '../../ui';
import { listAdvances, type Advance } from '../../api/payrollApi';
import { useAuth } from '../../context/auth-context';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function AdvancesPage() {
  const { can } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => listAdvances(), []);
  const cell = (a: Advance, key: string) => String((a as Record<string, unknown>)[key] ?? '-');
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Staff advances" subtitle="Money lent to staff and recovered from their pay a little each month" actions={can('payroll:run') && <Button to="/payroll/advances/new" variant="primary" size="sm">New advance</Button>} />
      <SectionTabs section="payroll" active="/payroll/advances" />
      <DataTable<Advance>
        rowKey={(a) => a.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        columns={[
          { key: 'emp', header: 'Employee', render: (a) => cell(a, 'employeeName') !== '-' ? cell(a, 'employeeName') : `#${a.employeeId}` },
          { key: 'amount', header: 'Amount', numeric: true, render: (a) => cell(a, 'amount') },
          { key: 'rec', header: 'Monthly recovery', numeric: true, render: (a) => cell(a, 'monthlyRecovery') },
          { key: 'bal', header: 'Balance', numeric: true, render: (a) => cell(a, 'balance') },
          { key: 'date', header: 'Date', render: (a) => cell(a, 'date') },
          { key: 'status', header: 'Status', render: (a) => cell(a, 'status') }
        ]}
        empty={<EmptyState title="No advances" message="An advance is posted to staff advances and recovered automatically by each pay run." />}
      />
    </div>
  );
}

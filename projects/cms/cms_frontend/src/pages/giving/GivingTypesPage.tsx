import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery } from '../../ui';
import { listGivingTypes } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { useAllAccounts, useFunds } from '../../features/finance/components/lookups';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function GivingTypesPage() {
  const { can } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => listGivingTypes(true), []);
  const accounts = useAllAccounts();
  const funds = useFunds();
  const account = (id: number) => accounts.data?.find((a) => a.id === id);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Giving types" subtitle="Each type posts to an income account and a default fund" actions={can('giving:write') && <Button to="/giving/types/new" variant="primary" size="sm">New type</Button>} />
      <SectionTabs section="giving" active="/giving/types" />
      <DataTable
        rowKey={(t) => t.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        rowHref={(t) => (can('giving:write') ? `/giving/types/${t.id}/edit` : undefined)}
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Name' },
          { key: 'income', header: 'Income account', render: (t) => { const a = account(t.incomeAccountId); return a ? `${a.code} · ${a.name}` : t.incomeAccountId; } },
          { key: 'fund', header: 'Default fund', render: (t) => funds.data?.find((f) => f.id === t.defaultFundId)?.name ?? '-' },
          { key: 'tax', header: 'Tax deductible', render: (t) => (t.taxDeductible ? 'Yes' : 'No') },
          { key: 'status', header: 'Status', render: (t) => <StatusPill status={t.isActive ? 'Active' : 'Inactive'} tone={t.isActive ? 'ok' : 'neutral'} /> }
        ]}
        empty={<EmptyState title="No giving types" message="Add a type such as Tithe or Offering." action={<Link to="/giving/types/new">New type</Link>} />}
      />
    </div>
  );
}

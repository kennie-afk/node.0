import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery, Card, Donut, formatMoney, toMinor } from '../../ui';
import { listFunds } from '../../api/financeApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

const RESTRICTION: Record<string, string> = { UNRESTRICTED: 'Unrestricted', TEMPORARILY_RESTRICTED: 'Temporarily restricted', PERMANENTLY_RESTRICTED: 'Permanently restricted' };

export default function FundsPage() {
  const { can } = useAuth();
  const { data, error, loading, refetch } = useQuery(() => listFunds(true), []);
  const positive = (data ?? []).filter((f) => toMinor(f.position ?? '0') > 0);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Funds" subtitle="Each fund is its own set of books: gifts given for a purpose stay with that purpose" actions={<div className="ui-row">{can('finance:post') && <Button to="/finance/transfers/new" size="sm">Transfer between funds</Button>}{can('finance:post') && <Button to="/finance/funds/new" variant="primary" size="sm">New fund</Button>}</div>} />
      <SectionTabs section="ledger" active="/finance/funds" />
      <DataTable
        rowKey={(f) => f.id}
        rows={data ?? []}
        loading={loading}
        error={error}
        onRetry={refetch}
        columns={[
          { key: 'code', header: 'Code' },
          { key: 'name', header: 'Fund', render: (f) => (can('finance:post') ? <Link to={`/finance/funds/${f.id}/edit`}>{f.name}</Link> : f.name) },
          { key: 'restriction', header: 'Restriction', render: (f) => RESTRICTION[f.restriction] ?? f.restriction },
          { key: 'position', header: 'Net position', numeric: true, render: (f) => <Money value={f.position ?? '0.00'} strong /> },
          { key: 'status', header: 'Status', render: (f) => <StatusPill status={f.isActive ? 'Active' : 'Inactive'} tone={f.isActive ? 'ok' : 'neutral'} /> }
        ]}
        empty={<EmptyState title="No funds" message="Create a fund for each purpose you must report on separately." />}
      />
      {positive.length > 1 && (
        <Card title="Share of net position">
          <Donut label="Net position by fund" slices={positive.map((f) => ({ label: f.name, value: toMinor(f.position ?? '0') / 100 }))} format={(n) => formatMoney(n.toFixed(2))} />
        </Card>
      )}
    </div>
  );
}

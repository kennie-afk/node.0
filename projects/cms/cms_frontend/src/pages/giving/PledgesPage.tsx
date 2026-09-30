import { useState } from 'react';
import { Button, DataTable, EmptyState, Field, FilterBar, formatDate, LoadMore, PageHeader, Select, StatusPill, useKeysetList } from '../../ui';
import type { Pledge } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { Money, Progress } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function PledgesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('ACTIVE');
  const [behind, setBehind] = useState(false);
  const list = useKeysetList<Pledge>('/giving/pledges', { status, behindOnly: behind ? 'true' : undefined });
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Pledges" subtitle="Promises to give, measured against what has actually been given" actions={can('giving:write') && <Button to="/giving/pledges/new" variant="primary" size="sm">New pledge</Button>} />
      <SectionTabs section="giving" active="/giving/pledges" />
      <FilterBar>
        <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="ACTIVE">Active</option><option value="FULFILLED">Fulfilled</option><option value="CANCELLED">Cancelled</option></Select>}</Field>
        <label className="ui-row"><input type="checkbox" checked={behind} onChange={(e) => setBehind(e.target.checked)} /> Behind schedule only</label>
      </FilterBar>
      <DataTable<Pledge>
        rowKey={(p) => p.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(p) => `/giving/pledges/${p.id}`}
        columns={[
          { key: 'who', header: 'Member', render: (p) => p.memberName },
          { key: 'freq', header: 'Schedule', render: (p) => `${p.frequency.replace('_', ' ').toLowerCase()}${p.installment ? ` · ${p.installment}` : ''}` },
          { key: 'start', header: 'Since', render: (p) => formatDate(p.startDate) },
          { key: 'amount', header: 'Pledged', numeric: true, render: (p) => <Money value={p.amount} /> },
          { key: 'given', header: 'Given', numeric: true, render: (p) => <Money value={p.fulfilled} /> },
          { key: 'behind', header: 'Behind', numeric: true, render: (p) => (p.behind === '0.00' ? '-' : <Money value={p.behind} />) },
          { key: 'bar', header: 'Progress', render: (p) => <Progress basisPoints={p.progressBasisPoints} tone={p.progressBasisPoints >= 10000 ? 'ok' : undefined} /> },
          { key: 'status', header: 'Status', render: (p) => <StatusPill status={p.status} /> }
        ]}
        empty={<EmptyState title="No pledges" message="Pledges let you see who is on track and who needs a gentle reminder." />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="pledges" />}
      />
    </div>
  );
}

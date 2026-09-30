import { useState } from 'react';
import { Button, DataTable, EmptyState, Field, FilterBar, formatDate, LoadMore, PageHeader, Select, StatusPill, useKeysetList } from '../../ui';
import type { Batch } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

export default function BatchesPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const list = useKeysetList<Batch>('/giving/batches', { status });
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Counting batches" subtitle="Cash counted by one person and verified by another before it posts" actions={can('giving:write') && <Button to="/giving/batches/new" variant="primary" size="sm">Open a batch</Button>} />
      <SectionTabs section="giving" active="/giving/batches" />
      <FilterBar>
        <Field label="Status">{(c) => <Select {...c} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option><option value="OPEN">Open</option><option value="COUNTED">Counted, awaiting verification</option><option value="POSTED">Posted</option></Select>}</Field>
      </FilterBar>
      <DataTable<Batch>
        rowKey={(b) => b.id}
        rows={list.items}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(b) => `/giving/batches/${b.id}`}
        columns={[
          { key: 'no', header: 'No.', render: (b) => `#${b.batchNo}` },
          { key: 'name', header: 'Batch', render: (b) => b.name },
          { key: 'date', header: 'Service', render: (b) => formatDate(b.serviceDate) },
          { key: 'items', header: 'Gifts', numeric: true, render: (b) => b.itemCount },
          { key: 'total', header: 'Entered', numeric: true, render: (b) => <Money value={b.itemsTotal} /> },
          { key: 'counted', header: 'Counted', numeric: true, render: (b) => (b.countedTotal ? <Money value={b.countedTotal} /> : '-') },
          { key: 'variance', header: 'Variance', numeric: true, render: (b) => (b.variance ? <Money value={b.variance} /> : '-') },
          { key: 'status', header: 'Status', render: (b) => <StatusPill status={b.status} /> }
        ]}
        empty={<EmptyState title="No batches" message="Open a batch for each service, enter the gifts, count the cash, then have a second person verify it." />}
        footer={<LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="batches" />}
      />
    </div>
  );
}

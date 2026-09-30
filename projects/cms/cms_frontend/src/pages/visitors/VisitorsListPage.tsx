import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, FilterBar, LoadMore, PageHeader, SearchInput, Select, StatusPill, formatDate, useKeysetList, type Column } from '../../ui';
import { STAGES, type Stage, type Visitor, type VisitorStatus } from '../../api/visitorsApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { STAGE_LABEL } from '../../features/ops/lib/stages';
import { VisitorsTabs } from './VisitorsTabs';

const columns: Array<Column<Visitor>> = [
  { key: 'name', header: 'Visitor', render: (v) => `${v.firstName} ${v.lastName}` },
  { key: 'stage', header: 'Stage', render: (v) => STAGE_LABEL[v.stage] },
  { key: 'status', header: 'Status', render: (v) => <StatusPill status={v.status} /> },
  { key: 'phone', header: 'Phone', render: (v) => <span className="ops-mono">{v.phone ?? ''}</span> },
  { key: 'first', header: 'First visit', render: (v) => formatDate(v.firstVisitDate) },
  { key: 'source', header: 'Heard of us', render: (v) => v.source ?? '' }
];

export default function VisitorsListPage() {
  const [params, setParams] = useSearchParams();
  const stage = (params.get('stage') as Stage | null) ?? '';
  const [status, setStatus] = useState<VisitorStatus | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [q, setQ] = useState('');
  const onSearch = useCallback((v: string) => setQ(v), []);
  const list = useKeysetList<Visitor>('/visitors', { stage: stage || undefined, status: status || undefined, q: q || undefined, overdue: overdue ? 'true' : undefined });
  const { can } = useAuth();
  return (
    <OpsPage>
      <PageHeader title="Visitors" actions={can('members:write') ? <Button to="/visitors/new" variant="primary" icon={<Plus size={12} aria-hidden />}>Record a visitor</Button> : undefined} />
      <VisitorsTabs active="list" />
      <FilterBar>
        <SearchInput onSearch={onSearch} placeholder="Search by name or phone" />
        <div className="ui-field"><Select aria-label="Stage" value={stage} onChange={(e) => setParams(e.target.value ? { stage: e.target.value } : {})}><option value="">Any stage</option>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select></div>
        <div className="ui-field"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as VisitorStatus | '')}><option value="">Any status</option><option value="OPEN">Open</option><option value="CONVERTED">Became members</option><option value="CLOSED">Closed</option></Select></div>
        <label className="ops-check"><input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} /> Only with overdue follow-ups</label>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(v) => v.id} loading={list.loading} error={list.error} onRetry={list.refresh} rowHref={(v) => `/visitors/${v.id}`} empty={<EmptyState title="No visitors match" message="Clear a filter, or record someone who visited on Sunday." />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="visitors" /> : undefined} />
    </OpsPage>
  );
}

import { useState } from 'react';
import { Lock, Plus } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, FilterBar, LoadMore, PageHeader, Select, StatusPill, formatDate, useKeysetList, type Column } from '../../ui';
import type { PrayerRequest, PrayerStatus } from '../../api/careApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { useMemberNames } from '../../features/ops/components/useMemberNames';
import { CareTabs } from './CareTabs';

export default function PrayerRequestsPage() {
  const [status, setStatus] = useState<PrayerStatus | ''>('OPEN');
  const list = useKeysetList<PrayerRequest>('/care/prayer-requests', { status: status || undefined });
  const names = useMemberNames(list.items.map((p) => p.memberId));
  const { can } = useAuth();
  const columns: Array<Column<PrayerRequest>> = [
    { key: 'who', header: 'From', render: (p) => (p.memberId ? names(p.memberId) : p.requesterName ?? 'Anonymous') },
    { key: 'body', header: 'Request', render: (p) => <span className="ops-note-body">{p.body}</span> },
    { key: 'private', header: '', render: (p) => (p.isPrivate ? <Badge tone="warn"><Lock size={9} aria-hidden /> Private</Badge> : null) },
    { key: 'status', header: 'Status', render: (p) => <StatusPill status={p.status} /> },
    { key: 'when', header: 'Received', render: (p) => formatDate(p.createdAt) },
    ...(can('care:write') ? [{ key: 'x', header: '', align: 'right' as const, render: (p: PrayerRequest) => <Button size="sm" variant="ghost" to={`/care/prayer-requests/${p.id}/update`}>Update</Button> }] : [])
  ];
  return (
    <OpsPage>
      <PageHeader title="Pastoral care" actions={can('care:write') ? <Button to="/care/prayer-requests/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New request</Button> : undefined} />
      <CareTabs active="prayer" />
      <FilterBar><div className="ui-field"><Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as PrayerStatus | '')}><option value="OPEN">Open</option><option value="ANSWERED">Answered</option><option value="CLOSED">Closed</option><option value="">All</option></Select></div></FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(p) => p.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title="No prayer requests" message="Requests from members and from your own notes appear here." action={can('care:write') ? <Button to="/care/prayer-requests/new" variant="primary">New request</Button> : undefined} />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="requests" /> : undefined} />
    </OpsPage>
  );
}

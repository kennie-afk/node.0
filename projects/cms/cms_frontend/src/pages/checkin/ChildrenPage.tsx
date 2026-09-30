import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, FilterBar, LoadMore, PageHeader, SearchInput, formatDate, useKeysetList, type Column } from '../../ui';
import type { Child } from '../../api/checkinApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { ageInMonths, ageLabel } from '../../features/ops/lib/rooms';
import { CheckinTabs } from './CheckinTabs';

const columns: Array<Column<Child>> = [
  { key: 'name', header: 'Child', render: (c) => `${c.firstName} ${c.lastName}` },
  { key: 'age', header: 'Age', render: (c) => ageLabel(ageInMonths(c.dateOfBirth)) },
  { key: 'dob', header: 'Born', render: (c) => formatDate(c.dateOfBirth) },
  { key: 'allergies', header: 'Allergies', render: (c) => (c.allergies ? <Badge tone="bad">{c.allergies}</Badge> : <span className="ops-muted">None noted</span>) },
  { key: 'photo', header: 'Photos', render: (c) => (c.photoConsent ? 'Allowed' : 'Not allowed') }
];

export default function ChildrenPage() {
  const [q, setQ] = useState('');
  const onSearch = useCallback((v: string) => setQ(v), []);
  const list = useKeysetList<Child>('/checkin/children', { q: q || undefined });
  const { can } = useAuth();
  return (
    <OpsPage>
      <PageHeader title="Children's check-in" actions={can('members:write') ? <Button to="/checkin/children/new" variant="primary" icon={<Plus size={12} aria-hidden />}>Register a child</Button> : undefined} />
      <CheckinTabs active="children" />
      <FilterBar><SearchInput onSearch={onSearch} placeholder="Search by child's name" /></FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(c) => c.id} loading={list.loading} error={list.error} onRetry={list.refresh} rowHref={(c) => `/checkin/children/${c.id}`} empty={<EmptyState title={q ? 'No child matches' : 'No children registered'} message={q ? 'Try a different spelling.' : 'Register a child with at least one guardian before their first Sunday.'} action={can('members:write') ? <Button to="/checkin/children/new" variant="primary">Register a child</Button> : undefined} />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="children" /> : undefined} />
    </OpsPage>
  );
}

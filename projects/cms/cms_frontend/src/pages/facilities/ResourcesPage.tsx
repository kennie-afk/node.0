import { Plus } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery, type Column } from '../../ui';
import { listResources, type Resource } from '../../api/facilitiesApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FacilitiesTabs } from './FacilitiesTabs';

export default function ResourcesPage() {
  const resources = useQuery(listResources, []);
  const { can } = useAuth();
  const canWrite = can('members:write');
  const columns: Array<Column<Resource>> = [
    { key: 'name', header: 'Name' },
    { key: 'kind', header: 'Type', render: (r) => r.kind.charAt(0) + r.kind.slice(1).toLowerCase() },
    { key: 'capacity', header: 'Seats', numeric: true, render: (r) => r.capacity ?? '' },
    { key: 'approval', header: 'Booking', render: (r) => (r.requiresApproval ? <Badge tone="warn">Needs approval</Badge> : <Badge tone="ok">Instant</Badge>) },
    { key: 'active', header: 'Status', render: (r) => <StatusPill status={r.isActive ? 'ACTIVE' : 'CLOSED'} /> },
    ...(canWrite ? [{ key: 'edit', header: '', align: 'right' as const, render: (r: Resource) => <Button size="sm" variant="ghost" to={`/facilities/resources/${r.id}/edit`}>Edit</Button> }] : [])
  ];
  return (
    <OpsPage>
      <PageHeader title="Facilities" subtitle="Rooms, equipment and vehicles that can be booked." actions={canWrite ? <Button to="/facilities/resources/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New room or item</Button> : undefined} />
      <FacilitiesTabs active="resources" />
      <DataTable columns={columns} rows={resources.data ?? []} rowKey={(r) => r.id} loading={resources.loading} error={resources.error} onRetry={resources.refetch} empty={<EmptyState title="Nothing to book yet" message="Add the main hall, a meeting room or the church van." action={canWrite ? <Button to="/facilities/resources/new" variant="primary">New room or item</Button> : undefined} />} />
    </OpsPage>
  );
}

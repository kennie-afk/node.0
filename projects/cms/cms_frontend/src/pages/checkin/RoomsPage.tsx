import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery, type Column } from '../../ui';
import { listRooms, type Room } from '../../api/checkinApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { usePolling } from '../../features/ops/components/usePolling';
import { ageLabel, fillRatio } from '../../features/ops/lib/rooms';
import { CheckinTabs } from './CheckinTabs';

export default function RoomsPage() {
  const rooms = useQuery(listRooms, []);
  const { can } = useAuth();
  usePolling(rooms.refetch, 30_000);
  const columns: Array<Column<Room>> = [
    { key: 'name', header: 'Room' },
    { key: 'ages', header: 'Ages', render: (r) => `${ageLabel(r.minAgeMonths)} - ${ageLabel(r.maxAgeMonths)}` },
    {
      key: 'present', header: 'Right now',
      render: (r) => {
        const ratio = fillRatio(r);
        return (
          <div style={{ minWidth: 140 }}>
            <div className="ui-num">{r.present ?? 0} of {r.capacity}</div>
            <div className={`ops-meter ${ratio >= 1 ? 'is-full' : ratio >= 0.8 ? 'is-near' : ''}`} role="img" aria-label={`${r.present ?? 0} of ${r.capacity} places taken`}><span style={{ width: `${ratio * 100}%` }} /></div>
          </div>
        );
      }
    },
    { key: 'active', header: 'Status', render: (r) => <StatusPill status={r.isActive ? 'ACTIVE' : 'CLOSED'} /> },
    ...(can('members:write') ? [{ key: 'edit', header: '', align: 'right' as const, render: (r: Room) => <Button size="sm" variant="ghost" to={`/checkin/rooms/${r.id}/edit`}>Edit</Button> }] : [])
  ];
  return (
    <OpsPage>
      <PageHeader title="Children's check-in" actions={can('members:write') ? <Button to="/checkin/rooms/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New room</Button> : undefined} />
      <CheckinTabs active="rooms" />
      <DataTable columns={columns} rows={rooms.data ?? []} rowKey={(r) => r.id} loading={rooms.loading} error={rooms.error} onRetry={rooms.refetch} empty={<EmptyState title="No rooms" message="Create a room for each age group with its capacity." action={can('members:write') ? <Button to="/checkin/rooms/new" variant="primary">New room</Button> : undefined} />} />
    </OpsPage>
  );
}

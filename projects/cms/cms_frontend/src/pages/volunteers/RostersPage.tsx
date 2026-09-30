import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, FilterBar, InlineConfirm, LoadMore, PageHeader, StatusPill, formatDateTime, useKeysetList, useToast, type Column } from '../../ui';
import { removeAssignment, respond, type Assignment } from '../../api/volunteersApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { EventSelect } from '../../features/ops/components/pickers';
import { VolunteersTabs } from './VolunteersTabs';

export default function RostersPage() {
  const [params, setParams] = useSearchParams();
  const eventId = params.get('eventId') ? Number(params.get('eventId')) : undefined;
  const list = useKeysetList<Assignment>('/volunteers/rosters', { eventId });
  const { can } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  const canWrite = can('members:write');

  const act = async (id: number, work: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await work();
      toast.success(done);
      list.refresh();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusyId(null);
    }
  };

  const columns: Array<Column<Assignment>> = [
    { key: 'when', header: 'When', render: (a) => formatDateTime(a.startsAt) },
    { key: 'event', header: 'Event', render: (a) => a.eventName },
    { key: 'who', header: 'Volunteer', render: (a) => `${a.firstName} ${a.lastName}` },
    { key: 'team', header: 'Team', render: (a) => `${a.teamName}${a.roleName ? ` · ${a.roleName}` : ''}` },
    { key: 'status', header: 'Response', render: (a) => <StatusPill status={a.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) => (
        <span className="ui-actions">
          {a.status !== 'CONFIRMED' && <Button size="sm" variant="secondary" loading={busyId === a.id} onClick={() => act(a.id, () => respond(a.id, 'CONFIRMED'), 'Marked as confirmed.')}>Confirm</Button>}
          {a.status !== 'DECLINED' && <Button size="sm" variant="ghost" loading={busyId === a.id} onClick={() => act(a.id, () => respond(a.id, 'DECLINED'), 'Marked as declined.')}>Decline</Button>}
          {canWrite && <InlineConfirm label="Remove" question="Take off the roster?" onConfirm={() => act(a.id, () => removeAssignment(a.id), 'Removed from the roster.')} />}
        </span>
      )
    }
  ];

  return (
    <OpsPage>
      <PageHeader title="Volunteers" subtitle="Who is serving at which event." actions={canWrite ? <Button to={`/volunteers/rosters/new${eventId ? `?eventId=${eventId}` : ''}`} variant="primary" icon={<Plus size={12} aria-hidden />}>Roster a volunteer</Button> : undefined} />
      <VolunteersTabs active="rosters" />
      <FilterBar>
        <div className="ui-field">
          <EventSelect aria-label="Event" value={eventId ?? ''} placeholder="All events" onChange={(v) => setParams(v === '' ? {} : { eventId: String(v) })} />
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(a) => a.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title="Nobody rostered" message={eventId ? 'No one is on the roster for this event yet.' : 'Roster volunteers onto an event to see them here.'} action={canWrite ? <Button to={`/volunteers/rosters/new${eventId ? `?eventId=${eventId}` : ''}`} variant="primary">Roster a volunteer</Button> : undefined} />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="assignments" /> : undefined} />
    </OpsPage>
  );
}

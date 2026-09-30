import { useState } from 'react';
import { Button, DataTable, EmptyState, FilterBar, PageHeader, Select, StatusPill, formatDateTime, useQuery, type Column } from '../../ui';
import { reminders, type Reminder } from '../../api/volunteersApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { VolunteersTabs } from './VolunteersTabs';

const columns: Array<Column<Reminder>> = [
  { key: 'when', header: 'When', render: (r) => formatDateTime(r.startsAt) },
  { key: 'who', header: 'Volunteer', render: (r) => `${r.firstName} ${r.lastName}` },
  { key: 'event', header: 'Serving at', render: (r) => `${r.eventName} · ${r.teamName}` },
  { key: 'status', header: 'Response', render: (r) => <StatusPill status={r.status} /> },
  { key: 'phone', header: 'Phone', render: (r) => <span className="ops-mono">{r.phoneNumber ?? ''}</span> }
];

export default function RemindersPage() {
  const [hours, setHours] = useState(72);
  const list = useQuery(() => reminders(hours), [hours]);
  const { can } = useAuth();
  return (
    <OpsPage>
      <PageHeader title="Volunteers" subtitle="People serving soon, so you can chase the ones who have not confirmed." actions={can('comms:send') ? <Button to="/comms/campaigns/new" variant="secondary">Write a reminder message</Button> : undefined} />
      <VolunteersTabs active="reminders" />
      <FilterBar>
        <div className="ui-field">
          <Select aria-label="Window" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            <option value={24}>Next 24 hours</option>
            <option value={72}>Next 3 days</option>
            <option value={168}>Next 7 days</option>
            <option value={336}>Next 14 days</option>
          </Select>
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={list.data ?? []} rowKey={(r) => r.assignmentId} loading={list.loading} error={list.error} onRetry={list.refetch} empty={<EmptyState title="Nobody is serving in this window" message="Try a longer window, or roster volunteers onto an upcoming event." />} />
    </OpsPage>
  );
}

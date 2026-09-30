import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, PageHeader, StatusPill, useQuery, type Column } from '../../ui';
import { listTeams, type Team } from '../../api/volunteersApi';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { VolunteersTabs } from './VolunteersTabs';

const columns: Array<Column<Team>> = [
  { key: 'name', header: 'Team' },
  { key: 'description', header: 'About', render: (t) => <span className="ops-muted">{t.description ?? ''}</span> },
  { key: 'members', header: 'Volunteers', numeric: true, render: (t) => t.memberCount ?? 0 },
  { key: 'active', header: 'Status', render: (t) => <StatusPill status={t.isActive ? 'ACTIVE' : 'CLOSED'} /> }
];

export default function TeamsPage() {
  const teams = useQuery(listTeams, []);
  const { can } = useAuth();
  return (
    <OpsPage>
      <PageHeader title="Volunteers" subtitle="Serving teams, who is on them, and what they do." actions={can('members:write') ? <Button to="/volunteers/teams/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New team</Button> : undefined} />
      <VolunteersTabs active="teams" />
      <DataTable columns={columns} rows={teams.data ?? []} rowKey={(t) => t.id} loading={teams.loading} error={teams.error} onRetry={teams.refetch} rowHref={(t) => `/volunteers/teams/${t.id}`} empty={<EmptyState title="No teams yet" message="Create a team such as Ushers or Media, then add volunteers and roles." action={can('members:write') ? <Button to="/volunteers/teams/new" variant="primary">New team</Button> : undefined} />} />
    </OpsPage>
  );
}

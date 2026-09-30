import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, EmptyState, ErrorState, InlineConfirm, Input, Field, PageHeader, PageLoader, Select, StatusPill, useQuery, useToast, type Column } from '../../ui';
import { addRole, addTeamMember, listRoles, listTeamMembers, listTeams, removeTeamMember, updateTeam, type TeamMember } from '../../api/volunteersApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { MemberPicker } from '../../features/ops/components/pickers';

export default function TeamDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const teams = useQuery(listTeams, []);
  const roles = useQuery(() => listRoles(id), [id]);
  const members = useQuery(() => listTeamMembers(id), [id]);
  const [memberId, setMemberId] = useState<number | null>(null);
  const [roleId, setRoleId] = useState<number | ''>('');
  const [newRole, setNewRole] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = can('members:write');

  const run = async (work: () => Promise<unknown>, done: string, after: () => void) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      after();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
    }
  };

  if (teams.loading && !teams.data) return <PageLoader />;
  if (teams.error && !teams.data) return <ErrorState message={teams.error.message} onRetry={teams.refetch} requestId={teams.error.requestId} />;
  const team = teams.data?.find((t) => t.id === id);
  if (!team) return <OpsPage><EmptyState title="Team not found" message="It may have been removed." action={<Button to="/volunteers/teams">Back to teams</Button>} /></OpsPage>;

  const columns: Array<Column<TeamMember>> = [
    { key: 'name', header: 'Volunteer', render: (m) => `${m.firstName} ${m.lastName}` },
    { key: 'role', header: 'Role', render: (m) => m.roleName ?? <span className="ops-muted">No role</span> },
    ...(canWrite ? [{ key: 'x', header: '', align: 'right' as const, render: (m: TeamMember) => <InlineConfirm label="Remove" question="Remove from team?" onConfirm={() => run(() => removeTeamMember(m.id), 'Removed from the team.', () => { members.refetch(); teams.refetch(); })} /> }] : [])
  ];

  return (
    <OpsPage>
      <PageHeader
        title={team.name}
        crumbs={[{ label: 'Volunteers', to: '/volunteers/teams' }, { label: team.name }]}
        subtitle={<>{team.description ?? 'Serving team'} · <StatusPill status={team.isActive ? 'ACTIVE' : 'CLOSED'} /></>}
        actions={canWrite ? (
          <>
            <Button to={`/volunteers/rosters/new?teamId=${id}`} variant="primary">Roster someone</Button>
            <Button variant="secondary" onClick={() => run(() => updateTeam(id, { isActive: !team.isActive }), team.isActive ? 'Team closed.' : 'Team reopened.', teams.refetch)}>{team.isActive ? 'Close team' : 'Reopen team'}</Button>
          </>
        ) : undefined}
      />
      <div className="ops-split">
        <Card title="Volunteers" flush>
          <DataTable columns={columns} rows={members.data ?? []} rowKey={(m) => m.id} loading={members.loading} error={members.error} onRetry={members.refetch} empty={<EmptyState title="Nobody on this team yet" message="Add a volunteer, then they can be rostered onto events." />} />
        </Card>
        <div className="ui-stack">
          {canWrite && (
            <Card title="Add a volunteer">
              <form
                className="ui-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (memberId === null) return;
                  void run(() => addTeamMember(id, memberId, roleId === '' ? null : roleId), 'Volunteer added.', () => { setMemberId(null); setRoleId(''); members.refetch(); teams.refetch(); });
                }}
              >
                <Field label="Member">{(c) => <MemberPicker {...c} value={memberId} onChange={setMemberId} />}</Field>
                <Field label="Role">
                  {(c) => (
                    <Select {...c} value={roleId} onChange={(e) => setRoleId(e.target.value === '' ? '' : Number(e.target.value))}>
                      <option value="">No specific role</option>
                      {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  )}
                </Field>
                <div><Button type="submit" variant="primary" loading={busy} disabled={memberId === null}>Add to team</Button></div>
              </form>
            </Card>
          )}
          <Card title="Roles">
            <ul className="ops-list">
              {(roles.data ?? []).map((r) => <li key={r.id}>{r.name}</li>)}
              {roles.data?.length === 0 && <li className="ops-muted">No roles yet.</li>}
            </ul>
            {canWrite && (
              <form className="ops-inline-form" style={{ marginTop: 8 }} onSubmit={(e) => { e.preventDefault(); if (newRole.trim().length >= 2) void run(() => addRole(id, newRole.trim()), 'Role added.', () => { setNewRole(''); roles.refetch(); }); }}>
                <Field label="New role">{(c) => <Input {...c} value={newRole} onChange={(e) => setNewRole(e.target.value)} maxLength={120} />}</Field>
                <Button type="submit" disabled={newRole.trim().length < 2} loading={busy}>Add role</Button>
              </form>
            )}
          </Card>
          <Link to="/volunteers/rosters" className="ops-muted">See the rosters</Link>
        </div>
      </div>
    </OpsPage>
  );
}

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, PageHeader, Select, useQuery } from '../../ui';
import { assign, listRoles, listTeamMembers, listTeams } from '../../api/volunteersApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { EventSelect } from '../../features/ops/components/pickers';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';

/** Conflicts (double-booking, marked unavailable, not on the team) come back from the server as 409/400 and are shown in full. */
export default function RosterFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { submit, busy, error } = useFormSubmit();
  const [eventId, setEventId] = useState<number | ''>(params.get('eventId') ? Number(params.get('eventId')) : '');
  const [teamId, setTeamId] = useState<number | ''>(params.get('teamId') ? Number(params.get('teamId')) : '');
  const [memberId, setMemberId] = useState<number | ''>('');
  const [roleId, setRoleId] = useState<number | ''>('');
  const teams = useQuery(listTeams, []);
  const members = useQuery(() => listTeamMembers(Number(teamId)), [teamId], { enabled: teamId !== '' });
  const roles = useQuery(() => listRoles(Number(teamId)), [teamId], { enabled: teamId !== '' });

  return (
    <OpsPage>
      <PageHeader title="Roster a volunteer" crumbs={[{ label: 'Volunteers', to: '/volunteers/rosters' }, { label: 'Roster a volunteer' }]} />
      <form
        className="ui-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (eventId === '' || teamId === '' || memberId === '') return;
          const ok = await submit(() => assign({ eventId, teamId, memberId, roleId: roleId === '' ? null : roleId }), 'Volunteer rostered.');
          if (ok) navigate(`/volunteers/rosters?eventId=${eventId}`);
        }}
      >
        <FormBanner error={error} />
        {error && error.fields.length === 0 && /rostered|unavailable/.test(error.message) && <Notice tone="warn" title="Conflict">Pick a different volunteer or event. The schedule is checked against other rosters and each person's marked unavailability.</Notice>}
        <Field label="Event" required>{(c) => <EventSelect {...c} value={eventId} onChange={setEventId} />}</Field>
        <Field label="Team" required>
          {(c) => (
            <Select {...c} value={teamId} onChange={(e) => { setTeamId(e.target.value === '' ? '' : Number(e.target.value)); setMemberId(''); setRoleId(''); }}>
              <option value="">Choose a team</option>
              {(teams.data ?? []).filter((t) => t.isActive).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Volunteer" required hint={teamId !== '' && members.data?.length === 0 ? 'This team has no volunteers yet. Add some from the team page.' : 'Only people on the team can be rostered.'}>
          {(c) => (
            <Select {...c} value={memberId} disabled={teamId === ''} onChange={(e) => setMemberId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">Choose a volunteer</option>
              {(members.data ?? []).map((m) => <option key={m.id} value={m.memberId}>{m.firstName} {m.lastName}</option>)}
            </Select>
          )}
        </Field>
        <Field label="Role">
          {(c) => (
            <Select {...c} value={roleId} disabled={teamId === ''} onChange={(e) => setRoleId(e.target.value === '' ? '' : Number(e.target.value))}>
              <option value="">No specific role</option>
              {(roles.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          )}
        </Field>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={eventId === '' || teamId === '' || memberId === ''}>Add to roster</Button>
          <Button to="/volunteers/rosters" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}

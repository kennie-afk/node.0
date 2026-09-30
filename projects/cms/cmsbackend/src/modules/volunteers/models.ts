import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  VolunteerTeam: tableModel(s, 'VolunteerTeam', 'volunteer_teams', { name: T.str(120, true), description: T.str(500), ministryId: T.int, isActive: T.bool(true) }, { indexes: [{ fields: ['church_id', 'name'], unique: true }] }),
  VolunteerRole: tableModel(s, 'VolunteerRole', 'volunteer_roles', { teamId: T.intReq, name: T.str(120, true) }, { indexes: [{ fields: ['church_id', 'team_id', 'name'], unique: true }] }),
  VolunteerTeamMember: tableModel(s, 'VolunteerTeamMember', 'volunteer_team_members', { teamId: T.intReq, memberId: T.intReq, roleId: T.int }, { indexes: [{ fields: ['church_id', 'team_id', 'member_id'], unique: true }] }),
  VolunteerUnavailability: tableModel(s, 'VolunteerUnavailability', 'volunteer_unavailability', { memberId: T.intReq, fromDate: T.dayReq, toDate: T.dayReq, reason: T.str(200) }),
  RosterAssignment: tableModel(s, 'RosterAssignment', 'roster_assignments', { eventId: T.intReq, teamId: T.intReq, roleId: T.int, memberId: T.intReq, status: T.str(10, true, 'PENDING'), startsAt: T.tsReq, endsAt: T.tsReq, createdBy: T.int }, { indexes: [{ fields: ['church_id', 'event_id', 'member_id', 'team_id'], unique: true }] }),
  SwapRequest: tableModel(s, 'SwapRequest', 'swap_requests', { assignmentId: T.intReq, fromMemberId: T.intReq, toMemberId: T.int, status: T.str(10, true, 'PENDING'), reason: T.str(300), decidedBy: T.int, decidedAt: T.ts })
});
export default factory;

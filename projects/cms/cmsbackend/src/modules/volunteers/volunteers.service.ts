import { Transaction } from 'sequelize';
import { BadRequestError, ConflictError, ForbiddenError } from '../../utils/errors';
import { assertMember, assertRef, camel, deleteRow, getRow, idCursor, idNext, insertRow, linkedMemberId, select, selectOne, updateRow } from '../ops-kit';
import type { Role } from '../../auth/permissions';
import { holds } from '../../common/tenant-context';

const DEFAULT_EVENT_MINUTES = 120;
const actor = (_role?: Role) => holds('members:write');

// ---- teams, roles, membership ---------------------------------------------------------

export async function listTeams(t: Transaction, churchId: number) {
  const rows = await select<any>(t, `SELECT tm.*, (SELECT COUNT(*) FROM volunteer_team_members x WHERE x.church_id = tm.church_id AND x.team_id = tm.id) AS member_count FROM volunteer_teams tm WHERE tm.church_id = ? ORDER BY tm.name`, [churchId]);
  return rows.map((r) => camel(r, { bools: ['is_active'] }));
}
export async function createTeam(t: Transaction, churchId: number, input: { name: string; description?: string | null; ministryId?: number | null }) {
  await assertRef(t, 'ministries', churchId, input.ministryId, 'ministryId');
  const id = await insertRow(t, 'volunteer_teams', churchId, { name: input.name, description: input.description ?? null, ministry_id: input.ministryId ?? null, is_active: true });
  return camel(await getRow(t, 'volunteer_teams', churchId, id, 'team'), { bools: ['is_active'] });
}
export async function updateTeam(t: Transaction, churchId: number, id: number, patch: { name?: string; description?: string | null; isActive?: boolean }) {
  await getRow(t, 'volunteer_teams', churchId, id, 'team');
  await updateRow(t, 'volunteer_teams', churchId, id, { name: patch.name, description: patch.description, is_active: patch.isActive });
  return camel(await getRow(t, 'volunteer_teams', churchId, id, 'team'), { bools: ['is_active'] });
}
export async function addRole(t: Transaction, churchId: number, teamId: number, name: string) {
  await getRow(t, 'volunteer_teams', churchId, teamId, 'team');
  const id = await insertRow(t, 'volunteer_roles', churchId, { team_id: teamId, name });
  return camel(await getRow(t, 'volunteer_roles', churchId, id, 'role'));
}
export async function listRoles(t: Transaction, churchId: number, teamId: number) {
  return (await select<any>(t, `SELECT * FROM volunteer_roles WHERE church_id = ? AND team_id = ? ORDER BY name`, [churchId, teamId])).map((r) => camel(r));
}
export async function addTeamMember(t: Transaction, churchId: number, teamId: number, memberId: number, roleId?: number | null) {
  await getRow(t, 'volunteer_teams', churchId, teamId, 'team');
  await assertMember(t, churchId, memberId);
  if (roleId) {
    const role = await getRow(t, 'volunteer_roles', churchId, roleId, 'role');
    if (Number(role.team_id) !== teamId) throw new BadRequestError('that role belongs to another team');
  }
  const id = await insertRow(t, 'volunteer_team_members', churchId, { team_id: teamId, member_id: memberId, role_id: roleId ?? null });
  return camel(await getRow(t, 'volunteer_team_members', churchId, id, 'team member'));
}
export async function listTeamMembers(t: Transaction, churchId: number, teamId: number) {
  return (await select<any>(t, `SELECT x.*, m.first_name, m.last_name, r.name AS role_name FROM volunteer_team_members x JOIN members m ON m.church_id = x.church_id AND m.id = x.member_id LEFT JOIN volunteer_roles r ON r.church_id = x.church_id AND r.id = x.role_id WHERE x.church_id = ? AND x.team_id = ? ORDER BY m.last_name, m.first_name`, [churchId, teamId])).map((r) => camel(r));
}
export async function removeTeamMember(t: Transaction, churchId: number, id: number) {
  await getRow(t, 'volunteer_team_members', churchId, id, 'team member');
  await deleteRow(t, 'volunteer_team_members', churchId, id);
}

// ---- unavailability -------------------------------------------------------------------

export async function addUnavailability(t: Transaction, churchId: number, input: { memberId: number; fromDate: string; toDate: string; reason?: string | null }) {
  await assertMember(t, churchId, input.memberId);
  if (input.toDate < input.fromDate) throw new BadRequestError('toDate is before fromDate');
  const id = await insertRow(t, 'volunteer_unavailability', churchId, { member_id: input.memberId, from_date: input.fromDate, to_date: input.toDate, reason: input.reason ?? null });
  return camel(await getRow(t, 'volunteer_unavailability', churchId, id, 'entry'));
}
export async function listUnavailability(t: Transaction, churchId: number, memberId: number) {
  return (await select<any>(t, `SELECT * FROM volunteer_unavailability WHERE church_id = ? AND member_id = ? ORDER BY from_date DESC`, [churchId, memberId])).map((r) => camel(r));
}
export async function removeUnavailability(t: Transaction, churchId: number, id: number, callerMemberId: number | null, isManager: boolean) {
  const row = await getRow(t, 'volunteer_unavailability', churchId, id, 'entry');
  if (!isManager && Number(row.member_id) !== callerMemberId) throw new ForbiddenError('that is not your entry');
  await deleteRow(t, 'volunteer_unavailability', churchId, id);
}

// ---- rosters --------------------------------------------------------------------------

async function eventWindow(t: Transaction, churchId: number, eventId: number): Promise<{ start: Date; end: Date }> {
  const event = await getRow(t, 'events', churchId, eventId, 'event');
  const start = new Date(event.start_time);
  const end = event.end_time ? new Date(event.end_time) : new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000);
  return { start, end };
}

/** Returns what stops `memberId` serving in this window, or null when they are free. */
export async function findConflict(t: Transaction, churchId: number, memberId: number, start: Date, end: Date, ignoreAssignmentId?: number): Promise<string | null> {
  const clash = await selectOne<any>(
    t,
    `SELECT a.id, e.name FROM roster_assignments a JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id
      WHERE a.church_id = ? AND a.member_id = ? AND a.status <> 'DECLINED' AND a.starts_at < ? AND a.ends_at > ? ${ignoreAssignmentId ? 'AND a.id <> ?' : ''} LIMIT 1`,
    [churchId, memberId, end, start, ...(ignoreAssignmentId ? [ignoreAssignmentId] : [])]
  );
  if (clash) return `already rostered for "${clash.name}" at an overlapping time`;
  const day = start.toISOString().slice(0, 10);
  const off = await selectOne<any>(t, `SELECT reason FROM volunteer_unavailability WHERE church_id = ? AND member_id = ? AND from_date <= ? AND to_date >= ? LIMIT 1`, [churchId, memberId, day, day]);
  if (off) return `marked unavailable on ${day}${off.reason ? ` (${off.reason})` : ''}`;
  return null;
}

export async function assign(t: Transaction, churchId: number, userId: number, input: { eventId: number; teamId: number; roleId?: number | null; memberId: number }) {
  await assertMember(t, churchId, input.memberId);
  const team = await getRow(t, 'volunteer_teams', churchId, input.teamId, 'team');
  if (!(team.is_active === true || team.is_active === 1)) throw new ConflictError('that team is inactive');
  const inTeam = await selectOne(t, `SELECT id FROM volunteer_team_members WHERE church_id = ? AND team_id = ? AND member_id = ?`, [churchId, input.teamId, input.memberId]);
  if (!inTeam) throw new BadRequestError('the member is not on that team');
  if (input.roleId) {
    const role = await getRow(t, 'volunteer_roles', churchId, input.roleId, 'role');
    if (Number(role.team_id) !== input.teamId) throw new BadRequestError('that role belongs to another team');
  }
  const { start, end } = await eventWindow(t, churchId, input.eventId);
  const conflict = await findConflict(t, churchId, input.memberId, start, end);
  if (conflict) throw new ConflictError(conflict);
  const id = await insertRow(t, 'roster_assignments', churchId, { event_id: input.eventId, team_id: input.teamId, role_id: input.roleId ?? null, member_id: input.memberId, status: 'PENDING', starts_at: start, ends_at: end, created_by: userId });
  return getAssignment(t, churchId, id);
}

export async function getAssignment(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(
    t,
    `SELECT a.*, m.first_name, m.last_name, e.name AS event_name, tm.name AS team_name, r.name AS role_name
       FROM roster_assignments a JOIN members m ON m.church_id = a.church_id AND m.id = a.member_id
       JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id JOIN volunteer_teams tm ON tm.church_id = a.church_id AND tm.id = a.team_id
       LEFT JOIN volunteer_roles r ON r.church_id = a.church_id AND r.id = a.role_id WHERE a.church_id = ? AND a.id = ?`,
    [churchId, id]
  );
  if (!row) throw new BadRequestError(`assignment ${id} was not found`);
  return camel(row);
}

export async function listAssignments(t: Transaction, churchId: number, f: { eventId?: number; teamId?: number; memberId?: number; from?: Date; to?: Date; limit: number; cursor?: string }) {
  const where = ['a.church_id = ?'];
  const params: unknown[] = [churchId];
  for (const [col, v] of [['a.event_id', f.eventId], ['a.team_id', f.teamId], ['a.member_id', f.memberId]] as const) {
    if (v) { where.push(`${col} = ?`); params.push(v); }
  }
  if (f.from) { where.push('a.ends_at >= ?'); params.push(f.from); }
  if (f.to) { where.push('a.starts_at <= ?'); params.push(f.to); }
  const after = idCursor(f.cursor);
  if (after) { where.push('a.id < ?'); params.push(after); }
  const rows = await select<any>(
    t,
    `SELECT a.*, m.first_name, m.last_name, e.name AS event_name, tm.name AS team_name FROM roster_assignments a
       JOIN members m ON m.church_id = a.church_id AND m.id = a.member_id JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id
       JOIN volunteer_teams tm ON tm.church_id = a.church_id AND tm.id = a.team_id WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`,
    [...params, f.limit + 1]
  );
  return idNext(rows.map((r) => camel(r)), f.limit);
}

/** A volunteer answers for themself; a manager may answer for anyone. */
export async function respond(t: Transaction, churchId: number, userId: number, role: Role, id: number, status: 'CONFIRMED' | 'DECLINED') {
  const row = await getRow(t, 'roster_assignments', churchId, id, 'assignment');
  const mine = (await linkedMemberId(t, churchId, userId)) === Number(row.member_id);
  if (!mine && !actor(role)) throw new ForbiddenError('only the rostered volunteer or a manager can answer');
  await updateRow(t, 'roster_assignments', churchId, id, { status });
  return getAssignment(t, churchId, id);
}

export async function removeAssignment(t: Transaction, churchId: number, id: number) {
  await getRow(t, 'roster_assignments', churchId, id, 'assignment');
  await deleteRow(t, 'roster_assignments', churchId, id);
}

// ---- swaps ----------------------------------------------------------------------------

export async function requestSwap(t: Transaction, churchId: number, userId: number, role: Role, input: { assignmentId: number; toMemberId?: number | null; reason?: string | null }) {
  const a = await getRow(t, 'roster_assignments', churchId, input.assignmentId, 'assignment');
  const mine = (await linkedMemberId(t, churchId, userId)) === Number(a.member_id);
  if (!mine && !actor(role)) throw new ForbiddenError('you can only ask to swap your own assignment');
  if (a.status === 'DECLINED') throw new ConflictError('that assignment is already declined');
  await assertMember(t, churchId, input.toMemberId, 'toMemberId');
  if (input.toMemberId === Number(a.member_id)) throw new BadRequestError('choose someone else to swap with');
  const open = await selectOne(t, `SELECT id FROM swap_requests WHERE church_id = ? AND assignment_id = ? AND status = 'PENDING'`, [churchId, input.assignmentId]);
  if (open) throw new ConflictError('a swap request for this assignment is already pending');
  const id = await insertRow(t, 'swap_requests', churchId, { assignment_id: input.assignmentId, from_member_id: Number(a.member_id), to_member_id: input.toMemberId ?? null, status: 'PENDING', reason: input.reason ?? null });
  return camel(await getRow(t, 'swap_requests', churchId, id, 'swap request'));
}

export async function listSwaps(t: Transaction, churchId: number, status?: string) {
  return (await select<any>(t, `SELECT * FROM swap_requests WHERE church_id = ? ${status ? 'AND status = ?' : ''} ORDER BY id DESC LIMIT 200`, [churchId, ...(status ? [status] : [])])).map((r) => camel(r));
}

export async function decideSwap(t: Transaction, churchId: number, userId: number, id: number, approve: boolean) {
  const swap = await getRow(t, 'swap_requests', churchId, id, 'swap request');
  if (swap.status !== 'PENDING') throw new ConflictError(`swap is already ${String(swap.status).toLowerCase()}`);
  if (approve) {
    const a = await getRow(t, 'roster_assignments', churchId, Number(swap.assignment_id), 'assignment');
    if (swap.to_member_id) {
      const to = Number(swap.to_member_id);
      const inTeam = await selectOne(t, `SELECT id FROM volunteer_team_members WHERE church_id = ? AND team_id = ? AND member_id = ?`, [churchId, a.team_id, to]);
      if (!inTeam) throw new BadRequestError('the replacement is not on that team');
      const conflict = await findConflict(t, churchId, to, new Date(a.starts_at), new Date(a.ends_at), Number(a.id));
      if (conflict) throw new ConflictError(`replacement ${conflict}`);
      await updateRow(t, 'roster_assignments', churchId, Number(a.id), { member_id: to, status: 'PENDING' });
    } else {
      // No replacement named: the volunteer is released and the slot is open again.
      await updateRow(t, 'roster_assignments', churchId, Number(a.id), { status: 'DECLINED' });
    }
  }
  await updateRow(t, 'swap_requests', churchId, id, { status: approve ? 'APPROVED' : 'REJECTED', decided_by: userId, decided_at: new Date() });
  return camel(await getRow(t, 'swap_requests', churchId, id, 'swap request'));
}

export async function cancelSwap(t: Transaction, churchId: number, userId: number, role: Role, id: number) {
  const swap = await getRow(t, 'swap_requests', churchId, id, 'swap request');
  const mine = (await linkedMemberId(t, churchId, userId)) === Number(swap.from_member_id);
  if (!mine && !actor(role)) throw new ForbiddenError('only the requester can cancel');
  if (swap.status !== 'PENDING') throw new ConflictError('only a pending request can be cancelled');
  await updateRow(t, 'swap_requests', churchId, id, { status: 'CANCELLED' });
  return camel(await getRow(t, 'swap_requests', churchId, id, 'swap request'));
}

/** Upcoming assignments still waiting for an answer: who to nudge, with how to reach them. */
export async function reminders(t: Transaction, churchId: number, withinHours: number) {
  const now = new Date();
  const until = new Date(now.getTime() + withinHours * 3_600_000);
  return (await select<any>(
    t,
    `SELECT a.id AS assignment_id, a.starts_at, a.status, e.name AS event_name, tm.name AS team_name, m.id AS member_id, m.first_name, m.last_name, m.phone_number, m.email
       FROM roster_assignments a JOIN members m ON m.church_id = a.church_id AND m.id = a.member_id JOIN events e ON e.church_id = a.church_id AND e.id = a.event_id
       JOIN volunteer_teams tm ON tm.church_id = a.church_id AND tm.id = a.team_id
      WHERE a.church_id = ? AND a.status = 'PENDING' AND a.starts_at >= ? AND a.starts_at <= ? ORDER BY a.starts_at LIMIT 500`,
    [churchId, now, until]
  )).map((r) => camel(r));
}

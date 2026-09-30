import { http, type KeysetPage } from './http';

export interface Team {
  id: number;
  name: string;
  description: string | null;
  ministryId: number | null;
  isActive: boolean;
  memberCount?: number;
}
export interface TeamRole {
  id: number;
  teamId: number;
  name: string;
}
export interface TeamMember {
  id: number;
  teamId: number;
  memberId: number;
  roleId: number | null;
  firstName: string;
  lastName: string;
  roleName: string | null;
}
export type AssignmentStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED';
export interface Assignment {
  id: number;
  eventId: number;
  teamId: number;
  roleId: number | null;
  memberId: number;
  status: AssignmentStatus;
  startsAt: string;
  endsAt: string;
  firstName: string;
  lastName: string;
  eventName: string;
  teamName: string;
  roleName?: string | null;
}
export interface Unavailability {
  id: number;
  memberId: number;
  fromDate: string;
  toDate: string;
  reason: string | null;
}
export interface Swap {
  id: number;
  assignmentId: number;
  fromMemberId: number;
  toMemberId: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
}
export interface Reminder {
  assignmentId: number;
  startsAt: string;
  status: AssignmentStatus;
  eventName: string;
  teamName: string;
  memberId: number;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  email: string | null;
}

export const listTeams = () => http.get<Team[]>('/volunteers/teams');
export const createTeam = (body: { name: string; description?: string | null; ministryId?: number | null }) => http.post<Team>('/volunteers/teams', body);
export const updateTeam = (id: number, body: Partial<{ name: string; description: string | null; isActive: boolean }>) => http.put<Team>(`/volunteers/teams/${id}`, body);
export const listRoles = (teamId: number) => http.get<TeamRole[]>(`/volunteers/teams/${teamId}/roles`);
export const addRole = (teamId: number, name: string) => http.post<TeamRole>(`/volunteers/teams/${teamId}/roles`, { name });
export const listTeamMembers = (teamId: number) => http.get<TeamMember[]>(`/volunteers/teams/${teamId}/members`);
export const addTeamMember = (teamId: number, memberId: number, roleId?: number | null) => http.post<TeamMember>(`/volunteers/teams/${teamId}/members`, { memberId, roleId });
export const removeTeamMember = (id: number) => http.delete(`/volunteers/team-members/${id}`);

export const listUnavailability = (memberId?: number) => http.get<Unavailability[]>('/volunteers/unavailability', { memberId });
export const addUnavailability = (body: { memberId?: number; fromDate: string; toDate: string; reason?: string | null }) => http.post<Unavailability>('/volunteers/unavailability', body);
export const removeUnavailability = (id: number) => http.delete(`/volunteers/unavailability/${id}`);

export const listRosters = (q: { eventId?: number; teamId?: number; memberId?: number; limit?: number; cursor?: string }) => http.get<KeysetPage<Assignment>>('/volunteers/rosters', q);
export const assign = (body: { eventId: number; teamId: number; roleId?: number | null; memberId: number }) => http.post<Assignment>('/volunteers/rosters', body);
export const respond = (id: number, status: 'CONFIRMED' | 'DECLINED') => http.post<Assignment>(`/volunteers/rosters/${id}/respond`, { status });
export const removeAssignment = (id: number) => http.delete(`/volunteers/rosters/${id}`);

export const listSwaps = (status?: string) => http.get<Swap[]>('/volunteers/swaps', { status });
export const requestSwap = (body: { assignmentId: number; toMemberId?: number | null; reason?: string | null }) => http.post<Swap>('/volunteers/swaps', body);
export const approveSwap = (id: number) => http.post<Swap>(`/volunteers/swaps/${id}/approve`);
export const rejectSwap = (id: number) => http.post<Swap>(`/volunteers/swaps/${id}/reject`);
export const cancelSwap = (id: number) => http.post<Swap>(`/volunteers/swaps/${id}/cancel`);
export const reminders = (hours: number) => http.get<Reminder[]>('/volunteers/reminders', { hours });

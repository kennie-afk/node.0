import { http, type Query } from './http';
import type { PageOf } from '../features/resource/types';

export type AttendanceType = 'In-person' | 'Online' | 'Other';

export interface Attendance {
  id: number;
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate: string;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType: AttendanceType;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  attendeeMember?: { id: number; firstName: string; lastName: string } | null;
  attendedEvent?: { id: number; name: string; startTime: string } | null;
  attendedSermon?: { id: number; title: string; datePreached: string } | null;
}

/** What the list endpoint filters on; everything is done by the server. */
export interface AttendanceQuery {
  page: number;
  pageSize: number;
  q?: string;
  kind?: 'event' | 'sermon';
  eventId?: number;
  sermonId?: number;
}

export const fetchAttendancePage = (query: AttendanceQuery) => http.get<PageOf<Attendance>>('/attendance', query as unknown as Query);
export const createAttendance = (body: Record<string, unknown>) => http.post<Attendance>('/attendance', body);
export const updateAttendance = (id: number, body: Record<string, unknown>) => http.put<Attendance>(`/attendance/${id}`, body);
export const deleteAttendance = (id: number) => http.delete(`/attendance/${id}`);

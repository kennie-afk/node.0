import { http } from './http';

export interface MemberCard { memberId: number; name: string; token: string }
export interface ScanResult {
  status: 'RECORDED' | 'ALREADY';
  attendanceId: number;
  date: string;
  member: { id: number; name: string; photoUrl: string | null };
}

export const getMemberCard = (memberId: number) => http.get<MemberCard>(`/attendance-qr/members/${memberId}`);
export const listCards = (after = 0, limit = 60) => http.get<MemberCard[]>('/attendance-qr/cards', { after, limit });
export const scanMember = (body: { token: string; eventId?: number | null; sermonId?: number | null }) => http.post<ScanResult>('/attendance-qr/scan', body);

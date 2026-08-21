import axiosInstance from './axiosInstance';

export interface Attendance {
  id: number;
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate: string;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType: 'In-person' | 'Online' | 'Other';
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
  attendeeMember?: { id: number; firstName: string; lastName: string };
  attendedEvent?: { id: number; name: string; startTime: string };
  attendedSermon?: { id: number; title: string; datePreached: string };
}

export const fetchAttendance = async () => {
  const response = await axiosInstance.get('/attendance');
  return response.data;
};

export const createAttendance = async (attendanceData: Omit<Attendance, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/attendance', attendanceData);
  return response.data;
};

export const updateAttendance = async (id: number, attendanceData: Partial<Attendance>) => {
  const response = await axiosInstance.put(`/attendance/${id}`, attendanceData);
  return response.data;
};

export const deleteAttendance = async (id: number) => {
  await axiosInstance.delete(`/attendance/${id}`);
};
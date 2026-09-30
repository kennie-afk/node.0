import { http, type KeysetPage } from './http';

export type ResourceKind = 'ROOM' | 'EQUIPMENT' | 'VEHICLE';
export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Resource {
  id: number;
  name: string;
  kind: ResourceKind;
  capacity: number | null;
  requiresApproval: boolean;
  description: string | null;
  isActive: boolean;
}
export interface Booking {
  id: number;
  resourceId: number;
  title: string;
  startsAt: string;
  endsAt: string;
  bookedByUserId: number;
  status: BookingStatus;
  seriesId: string | null;
  notes: string | null;
  resourceName?: string;
}
export interface BookingResult {
  seriesId: string | null;
  count: number;
  status: BookingStatus;
  bookings: Booking[];
}
export interface Recurrence {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval?: number;
  count: number;
}

export const listResources = () => http.get<Resource[]>('/facilities/resources');
export const createResource = (body: { name: string; kind?: ResourceKind; capacity?: number | null; requiresApproval?: boolean; description?: string | null }) => http.post<Resource>('/facilities/resources', body);
export const updateResource = (id: number, body: Partial<{ name: string; capacity: number | null; requiresApproval: boolean; description: string | null; isActive: boolean }>) => http.put<Resource>(`/facilities/resources/${id}`, body);
export const availability = (id: number, from: string, to: string) =>
  http.get<{ resourceId: number; busy: Array<{ id: number; title: string; status: BookingStatus; startsAt: string; endsAt: string }> }>(`/facilities/resources/${id}/availability`, { from, to });

export const listBookings = (q: { resourceId?: number; status?: BookingStatus; from?: string; to?: string; mine?: boolean; limit?: number; cursor?: string }) =>
  http.get<KeysetPage<Booking>>('/facilities/bookings', { ...q, mine: q.mine ? 'true' : undefined });
export const getBooking = (id: number) => http.get<Booking>(`/facilities/bookings/${id}`);
export const createBooking = (body: { resourceId: number; title: string; startsAt: string; endsAt: string; notes?: string | null; recurrence?: Recurrence }) => http.post<BookingResult>('/facilities/bookings', body);
export const approveBooking = (id: number) => http.post<Booking>(`/facilities/bookings/${id}/approve`);
export const rejectBooking = (id: number) => http.post<Booking>(`/facilities/bookings/${id}/reject`);
export const cancelBooking = (id: number, scope: 'ONE' | 'SERIES') => http.post<{ cancelled: number }>(`/facilities/bookings/${id}/cancel`, { scope });

import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface Event {
  id: number;
  name: string;
  description?: string | null;
  type?: string | null;
  startTime: string;
  endTime?: string | null;
  location?: string | null;
  isRecurring?: boolean;
  recurrencePattern?: string | null;
  capacity?: number | null;
  organizer?: { id: number; username: string; email?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

/** The first page only: attendance uses it to fill a picker. The Events screen pages on its own. */
export const fetchEvents = async () => {
  const response = await axiosInstance.get('/events');
  return unwrapList<Event>(response.data);
};

export interface Occurrence {
  eventId: number;
  name: string;
  startsAt: string;
  date: string;
  capacity: number | null;
  recurring: boolean;
}
export interface Rsvp {
  id: number;
  occurrenceDate: string;
  memberId: number | null;
  name: string | null;
  partySize: number;
  status: 'GOING' | 'WAITLIST' | 'CANCELLED';
  waitlistPosition: number | null;
}
export interface Roster {
  eventId: number;
  occurrenceDate: string;
  capacity: number | null;
  seatsTaken: number;
  seatsLeft: number | null;
  waitlisted: number;
  data: Rsvp[];
}

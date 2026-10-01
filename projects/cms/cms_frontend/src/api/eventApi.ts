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
  organizer?: { id: number; username: string; email?: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

/** The first page only: attendance uses it to fill a picker. The Events screen pages on its own. */
export const fetchEvents = async () => {
  const response = await axiosInstance.get('/events');
  return unwrapList<Event>(response.data);
};

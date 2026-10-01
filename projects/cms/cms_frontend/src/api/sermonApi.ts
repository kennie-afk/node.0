import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface Sermon {
  id: number;
  title: string;
  datePreached: string;
  speakerMemberId?: number | null;
  speaker?: { id?: number; firstName: string; lastName: string } | null;
  eventId?: number | null;
  event?: { id: number; name: string; startTime?: string } | null;
  passageReference?: string | null;
  summary?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** The first page only: attendance uses it to fill a picker. The Sermons screen pages on its own. */
export const fetchSermons = async () => {
  const response = await axiosInstance.get('/sermons');
  return unwrapList<Sermon>(response.data);
};

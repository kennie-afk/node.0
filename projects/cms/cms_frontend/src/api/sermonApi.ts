import axiosInstance from './axiosInstance';

export interface Sermon {
  id: number;
  title: string;
  content?: string;
  datePreached: string;
  speakerMemberId?: number | null;
  guestSpeakerName?: string | null;
  speaker?: {
    firstName: string;
    lastName: string;
  };
  eventId?: number | null;
  passageReference?: string | null;
  summary?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const fetchSermons = async () => {
  const response = await axiosInstance.get('/sermons');
  return response.data;
};

export const createSermon = async (sermonData: Omit<Sermon, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/sermons', sermonData);
  return response.data;
};

export const updateSermon = async (id: number, sermonData: Partial<Sermon>) => {
  const response = await axiosInstance.put(`/sermons/${id}`, sermonData);
  return response.data;
};

export const deleteSermon = async (id: number) => {
  await axiosInstance.delete(`/sermons/${id}`);
};
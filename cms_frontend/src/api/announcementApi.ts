import axiosInstance from './axiosInstance';

export interface Announcement {
  id: number;
  title: string;
  content: string;
  authorUserId: number;
  publicationDate: string;
  expiryDate?: string;
  isPublished: boolean;
  targetAudience?: string;
  createdAt?: string;
  updatedAt?: string;
  author?: {
    username: string;       
    email?: string;
  };
}

export const fetchAnnouncements = async () => {
  const response = await axiosInstance.get('/announcements');
  return response.data;
};

export const createAnnouncement = async (data: {
  title: string;
  content: string;
  publicationDate?: string;
  expiryDate?: string;
  isPublished?: boolean;
  targetAudience?: string;
}) => {
  const response = await axiosInstance.post('/announcements', data);
  return response.data;
};

export const updateAnnouncement = async (id: number, data: Partial<Announcement>) => {
  const response = await axiosInstance.put(`/announcements/${id}`, data);
  return response.data;
};

export const deleteAnnouncement = async (id: number) => {
  await axiosInstance.delete(`/announcements/${id}`);
};
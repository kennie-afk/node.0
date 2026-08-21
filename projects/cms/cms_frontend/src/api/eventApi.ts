import axiosInstance from './axiosInstance';

export interface Event {
  id: number;
  name: string;
  description?: string;
  startTime: string;
  endTime?: string;
  location?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const fetchEvents = async () => {
  const response = await axiosInstance.get('/events');
  return response.data;
};

export const createEvent = async (eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>) => {
  const response = await axiosInstance.post('/events', eventData);
  return response.data;
};

export const updateEvent = async (id: number, eventData: Partial<Event>) => {
  const response = await axiosInstance.put(`/events/${id}`, eventData);
  return response.data;
};

export const deleteEvent = async (id: number) => {
  await axiosInstance.delete(`/events/${id}`);
};
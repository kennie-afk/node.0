import { http } from './http';

export interface ChurchProfile {
  name: string;
  slug: string;
  timezone: string;
}

export const getChurchProfile = () => http.get<ChurchProfile>('/churches/me');

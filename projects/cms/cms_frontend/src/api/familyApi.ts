import { unwrapList } from './pagination';
import axiosInstance from './axiosInstance';

export interface Family {
  id: number;
  familyName: string;
  headOfFamilyMemberId?: number | null;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// Still used by the older member form; the Families screen itself pages and searches on the server.
export const fetchFamilies = async () => {
  const response = await axiosInstance.get('/families');
  return unwrapList<Family>(response.data);
};

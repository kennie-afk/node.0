export interface Announcement {
  id: number;
  title: string;
  content: string;
  authorUserId: number;
  publicationDate: string;
  expiryDate?: string | null;
  isPublished: boolean;
  targetAudience?: string | null;
  createdAt?: string;
  updatedAt?: string;
  author?: {
    username: string;
    email?: string;
  };
}

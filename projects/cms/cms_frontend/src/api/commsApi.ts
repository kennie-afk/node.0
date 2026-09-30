import { http, type KeysetPage } from './http';

export type Channel = 'SMS' | 'EMAIL';
export type CampaignStatus = 'DRAFT' | 'QUEUED' | 'SENDING' | 'SENT' | 'CANCELLED' | string;
export type OutboxStatus = 'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface MessageTemplate {
  id: number;
  name: string;
  channel: Channel;
  subject: string | null;
  body: string;
  isActive: boolean;
  updatedAt: string;
}

export type SegmentDefinition =
  | { type: 'ALL'; statuses?: string[] }
  | { type: 'MINISTRY'; ministryId: number; statuses?: string[] }
  | { type: 'SMALL_GROUP'; smallGroupId: number; statuses?: string[] }
  | { type: 'FILTER'; statuses?: string[]; gender?: 'Male' | 'Female' | 'Other'; city?: string; county?: string };

export interface Segment {
  id: number;
  name: string;
  definition: SegmentDefinition;
  createdAt: string;
}

export interface SegmentPreview {
  total: number;
  reachable: number;
  optedOut: number;
  sample: Array<{ id: number; name: string }>;
}

export interface Campaign {
  id: number;
  name: string;
  channel: Channel;
  purpose: 'COMMUNICATIONS' | 'ANNOUNCEMENTS';
  templateId: number | null;
  subject: string | null;
  body: string;
  segmentId: number;
  status: CampaignStatus;
  scheduledAt: string | null;
  recipientCount: number;
  createdAt: string;
  delivery?: Partial<Record<OutboxStatus, number>>;
}

export interface OutboxMessage {
  id: number;
  campaignId: number | null;
  memberId: number | null;
  channel: Channel;
  toAddress: string;
  subject: string | null;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
}

export const listTemplates = () => http.get<MessageTemplate[]>('/comms/templates');
export const createTemplate = (body: { name: string; channel: Channel; subject?: string | null; body: string }) => http.post<MessageTemplate>('/comms/templates', body);
export const updateTemplate = (id: number, body: Partial<{ name: string; subject: string | null; body: string; isActive: boolean }>) => http.put<MessageTemplate>(`/comms/templates/${id}`, body);
export const deleteTemplate = (id: number) => http.delete(`/comms/templates/${id}`);

export const listSegments = () => http.get<Segment[]>('/comms/segments');
export const createSegment = (body: { name: string; definition: SegmentDefinition }) => http.post<Segment>('/comms/segments', body);
export const updateSegment = (id: number, body: { name?: string; definition?: SegmentDefinition }) => http.put<Segment>(`/comms/segments/${id}`, body);
export const deleteSegment = (id: number) => http.delete(`/comms/segments/${id}`);
export const previewSegment = (id: number, channel: Channel) => http.get<SegmentPreview>(`/comms/segments/${id}/preview`, { channel });

export const listCampaigns = (q: { limit?: number; cursor?: string } = {}) => http.get<KeysetPage<Campaign>>('/comms/campaigns', q);
export const getCampaign = (id: number) => http.get<Campaign>(`/comms/campaigns/${id}`);
export const createCampaign = (body: { name: string; channel: Channel; purpose?: 'COMMUNICATIONS' | 'ANNOUNCEMENTS'; templateId?: number | null; subject?: string | null; body?: string; segmentId: number }) =>
  http.post<Campaign>('/comms/campaigns', body);
export const sendCampaign = (id: number) => http.post<Campaign>(`/comms/campaigns/${id}/send`);
export const cancelCampaign = (id: number) => http.post<Campaign>(`/comms/campaigns/${id}/cancel`);
export const processOutbox = () => http.post<{ sent: number; failed: number; retried: number }>('/comms/outbox/process');

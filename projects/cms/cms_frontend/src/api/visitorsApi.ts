import { http, type KeysetPage } from './http';

export const STAGES = ['NEW', 'CONTACTED', 'VISITED_AGAIN', 'CLASS', 'JOINED', 'LOST'] as const;
export type Stage = (typeof STAGES)[number];
export type VisitorStatus = 'OPEN' | 'CONVERTED' | 'CLOSED';

export interface Visitor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  firstVisitDate: string;
  source: string | null;
  notes: string | null;
  stage: Stage;
  status: VisitorStatus;
  assignedMemberId: number | null;
  convertedMemberId: number | null;
  createdAt: string;
}
export interface StageChange {
  id: number;
  fromStage: Stage | null;
  toStage: Stage;
  note: string | null;
  changedAt: string;
}
export interface Interaction {
  id: number;
  type: 'CALL' | 'SMS' | 'VISIT' | 'EMAIL';
  summary: string;
  occurredAt: string;
}
export interface VisitorTask {
  id: number;
  visitorId: number;
  title: string;
  dueDate: string;
  assigneeMemberId: number | null;
  status: 'OPEN' | 'DONE';
  completedAt: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  overdue?: boolean;
}
export interface VisitorDetail extends Visitor {
  history: StageChange[];
  interactions: Interaction[];
  tasks: VisitorTask[];
}
export interface Pipeline {
  stages: Record<Stage, number>;
  total: number;
  conversionRate: number;
}

export const pipeline = () => http.get<Pipeline>('/visitors/pipeline');
export const listVisitors = (q: { stage?: Stage; status?: VisitorStatus; assignedMemberId?: number; q?: string; overdue?: boolean; limit?: number; cursor?: string }) =>
  http.get<KeysetPage<Visitor>>('/visitors', { ...q, overdue: q.overdue ? 'true' : undefined });
export const getVisitor = (id: number) => http.get<VisitorDetail>(`/visitors/${id}`);
export const createVisitor = (body: { firstName: string; lastName: string; phone?: string | null; email?: string | null; firstVisitDate?: string; source?: string | null; notes?: string | null; assignedMemberId?: number | null; autoTask?: boolean }) =>
  http.post<VisitorDetail>('/visitors', body);
export const updateVisitor = (id: number, body: Partial<{ firstName: string; lastName: string; phone: string | null; email: string | null; source: string | null; notes: string | null; assignedMemberId: number | null }>) =>
  http.put<VisitorDetail>(`/visitors/${id}`, body);
export const moveStage = (id: number, stage: Stage, note?: string | null) => http.post<VisitorDetail>(`/visitors/${id}/stage`, { stage, note });
export const addInteraction = (id: number, body: { type: Interaction['type']; summary: string }) => http.post<VisitorDetail>(`/visitors/${id}/interactions`, body);
export const addTask = (id: number, body: { title: string; dueDate: string; assigneeMemberId?: number | null }) => http.post<VisitorDetail>(`/visitors/${id}/tasks`, body);
export const dueTasks = (q: { assigneeMemberId?: number; within?: number }) => http.get<VisitorTask[]>('/visitors/tasks', q);
export const completeTask = (id: number) => http.post<VisitorTask>(`/visitors/tasks/${id}/complete`);
export const convertVisitor = (id: number, linkExistingMemberId?: number | null) =>
  http.post<{ memberId: number; visitor: VisitorDetail }>(`/visitors/${id}/convert`, linkExistingMemberId ? { linkExistingMemberId } : {});

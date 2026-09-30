import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  Visitor: tableModel(s, 'Visitor', 'visitors', { firstName: T.str(100, true), lastName: T.str(100, true), phone: T.str(30), email: T.str(100), firstVisitDate: T.dayReq, source: T.str(60), notes: T.str(1000), stage: T.str(14, true, 'NEW'), status: T.str(10, true, 'OPEN'), assignedMemberId: T.int, convertedMemberId: T.int, createdBy: T.int }),
  VisitorStageHistory: tableModel(s, 'VisitorStageHistory', 'visitor_stage_history', { visitorId: T.intReq, fromStage: T.str(14), toStage: T.str(14, true), note: T.str(300), changedBy: T.int, changedAt: T.tsReq }, { timestamps: false }),
  VisitorTask: tableModel(s, 'VisitorTask', 'visitor_tasks', { visitorId: T.intReq, title: T.str(200, true), dueDate: T.dayReq, assigneeMemberId: T.int, status: T.str(6, true, 'OPEN'), completedAt: T.ts, createdBy: T.int }),
  VisitorInteraction: tableModel(s, 'VisitorInteraction', 'visitor_interactions', { visitorId: T.intReq, type: T.str(6, true), summary: T.str(500, true), byUserId: T.int, occurredAt: T.tsReq }, { timestamps: false })
});
export default factory;

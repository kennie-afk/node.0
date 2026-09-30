import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  MessageTemplate: tableModel(s, 'MessageTemplate', 'message_templates', { name: T.str(120, true), channel: T.str(10, true), subject: T.str(200), body: T.textReq, isActive: T.bool(true) }, { indexes: [{ fields: ['church_id', 'name', 'channel'], unique: true }] }),
  AudienceSegment: tableModel(s, 'AudienceSegment', 'audience_segments', { name: T.str(120, true), definition: T.textReq, createdBy: T.int }, { indexes: [{ fields: ['church_id', 'name'], unique: true }] }),
  Campaign: tableModel(s, 'Campaign', 'campaigns', { name: T.str(150, true), channel: T.str(10, true), purpose: T.str(20, true, 'COMMUNICATIONS'), templateId: T.int, subject: T.str(200), body: T.textReq, segmentId: T.intReq, status: T.str(12, true, 'DRAFT'), scheduledAt: T.ts, recipientCount: { ...T.intReq, defaultValue: 0 }, createdBy: T.int }),
  OutboxMessage: tableModel(s, 'OutboxMessage', 'outbox_messages', { campaignId: T.int, memberId: T.int, channel: T.str(10, true), purpose: T.str(20, true, 'COMMUNICATIONS'), toAddress: T.str(200, true), subject: T.str(200), body: T.textReq, status: T.str(10, true, 'QUEUED'), attempts: { ...T.intReq, defaultValue: 0 }, lastError: T.str(300), providerRef: T.str(100), dedupeKey: T.str(120), notBefore: T.tsReq, sentAt: T.ts }, { indexes: [{ fields: ['church_id', 'dedupe_key'], unique: true }] })
});
export default factory;

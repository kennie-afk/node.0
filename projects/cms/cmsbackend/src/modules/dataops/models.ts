import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  ConsentRecord: tableModel(s, 'ConsentRecord', 'consent_records', { memberId: T.intReq, purpose: T.str(40, true), channel: T.str(10, true, 'ANY'), granted: T.bool(false), source: T.str(20, true, 'STAFF'), recordedByUserId: T.int, notes: T.str(300), recordedAt: T.tsReq }, { timestamps: false }),
  ImportJob: tableModel(s, 'ImportJob', 'import_jobs', { kind: T.str(20, true, 'MEMBERS'), fileHash: T.str(64, true), status: T.str(10, true), updateExisting: T.bool(false), totalRows: { ...T.intReq, defaultValue: 0 }, createdCount: { ...T.intReq, defaultValue: 0 }, updatedCount: { ...T.intReq, defaultValue: 0 }, skippedCount: { ...T.intReq, defaultValue: 0 }, errorCount: { ...T.intReq, defaultValue: 0 }, errors: T.textReq, createdBy: T.int }),
  ErasureRequest: tableModel(s, 'ErasureRequest', 'erasure_requests', { memberId: T.intReq, requestedBy: T.int, reason: T.str(500, true), status: T.str(10, true, 'PENDING'), outcome: T.str(12), legalHoldReason: T.str(300), decidedBy: T.int, decidedAt: T.ts })
});
export default factory;

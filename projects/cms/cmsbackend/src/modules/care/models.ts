import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  CareNote: tableModel(s, 'CareNote', 'care_notes', { memberId: T.intReq, authorUserId: T.intReq, kind: T.str(12, true, 'PASTORAL'), body: T.textReq, isConfidential: T.bool(false), occurredOn: T.dayReq, followUpOn: T.day, followUpDone: T.bool(false) }),
  PrayerRequest: tableModel(s, 'PrayerRequest', 'prayer_requests', { memberId: T.int, requesterName: T.str(150), body: T.str(2000, true), isPrivate: T.bool(false), status: T.str(8, true, 'OPEN'), answeredNote: T.str(500), submittedByUserId: T.int }),
  Visitation: tableModel(s, 'Visitation', 'visitations', { memberId: T.intReq, visitorUserId: T.intReq, visitDate: T.dayReq, kind: T.str(8, true, 'HOME'), summary: T.str(1000, true), followUpOn: T.day, followUpDone: T.bool(false) })
});
export default factory;

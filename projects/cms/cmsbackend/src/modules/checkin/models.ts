import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  CheckinRoom: tableModel(s, 'CheckinRoom', 'checkin_rooms', { name: T.str(100, true), minAgeMonths: { ...T.intReq, defaultValue: 0 }, maxAgeMonths: T.intReq, capacity: T.intReq, isActive: T.bool(true) }, { indexes: [{ fields: ['church_id', 'name'], unique: true }] }),
  CheckinChild: tableModel(s, 'CheckinChild', 'checkin_children', { memberId: T.int, firstName: T.str(100, true), lastName: T.str(100, true), dateOfBirth: T.dayReq, allergies: T.str(300), medicalNotes: T.str(500), photoConsent: T.bool(false), isActive: T.bool(true) }),
  CheckinGuardian: tableModel(s, 'CheckinGuardian', 'checkin_guardians', { childId: T.intReq, memberId: T.int, name: T.str(150, true), phone: T.str(30), relationship: T.str(40, true, 'Parent'), isAuthorizedPickup: T.bool(true) }),
  CheckinSession: tableModel(s, 'CheckinSession', 'checkin_sessions', { eventId: T.int, roomId: T.intReq, childId: T.intReq, checkedInBy: T.int, checkedInByGuardianId: T.int, pickupCodeHash: T.str(64, true), securityTag: T.str(12, true), status: T.str(4, true, 'IN'), checkedInAt: T.tsReq, checkedOutAt: T.ts, checkedOutBy: T.int, pickedUpByGuardianId: T.int, overrideReason: T.str(300) }),
  CheckinEvent: tableModel(s, 'CheckinEvent', 'checkin_events', { sessionId: T.int, childId: T.intReq, type: T.str(10, true), actorUserId: T.int, detail: T.str(400), createdAt: T.tsReq }, { timestamps: false })
});
export default factory;

import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

/** Mirrors migration 20261006120000 so the SQLite test database can be built; the migration is the source of truth. */
const factory: ModelFactory = (s) => ({
  EventRsvp: tableModel(s, 'EventRsvp', 'event_rsvps', { eventId: T.intReq, occurrenceDate: T.dayReq, memberId: T.int, guestName: T.str(150), partySize: { type: T.intReq.type, allowNull: false, defaultValue: 1 }, status: T.str(10, true, 'GOING'), note: T.str(300), createdBy: T.int }),
  SermonMedia: tableModel(s, 'SermonMedia', 'sermon_media', { sermonId: T.intReq, kind: T.str(5, true), fileName: T.str(200, true), contentType: T.str(100, true), sizeBytes: T.intReq, storageKey: T.str(300, true), sha256: T.str(64, true), uploadedBy: T.int })
});
export default factory;

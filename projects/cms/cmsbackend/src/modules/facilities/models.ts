import type { ModelFactory } from '../types';
import { T, tableModel } from '../ops-kit';

const factory: ModelFactory = (s) => ({
  FacilityResource: tableModel(s, 'FacilityResource', 'facility_resources', { name: T.str(120, true), kind: T.str(10, true, 'ROOM'), capacity: T.int, requiresApproval: T.bool(false), description: T.str(500), isActive: T.bool(true) }, { indexes: [{ fields: ['church_id', 'name'], unique: true }] }),
  FacilityBooking: tableModel(s, 'FacilityBooking', 'facility_bookings', { resourceId: T.intReq, title: T.str(200, true), startsAt: T.tsReq, endsAt: T.tsReq, bookedByUserId: T.int, status: T.str(10, true, 'PENDING'), seriesId: T.str(40), decidedBy: T.int, decidedAt: T.ts, notes: T.str(500) })
});
export default factory;

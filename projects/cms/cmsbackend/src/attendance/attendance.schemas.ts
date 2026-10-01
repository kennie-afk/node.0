import { z } from 'zod';

// The form sends a plain date; older callers send a full ISO datetime. The column holds a date.
const attendanceDate = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(v) && !Number.isNaN(Date.parse(v)), 'Attendance date must be a valid date');

export const createAttendanceSchema = z.object({
  body: z.object({
    memberId: z.number().int().nullish(),
    guestName: z.string().max(255).nullish(),
    attendanceDate,
    eventId: z.number().int().nullish(),
    sermonId: z.number().int().nullish(),
    attendanceType: z.enum(['In-person', 'Online', 'Other']),
    notes: z.string().nullish(),
  }).refine(data => data.memberId || data.guestName, {
    message: "Either memberId or guestName is required",
  }),
});

export const updateAttendanceSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.'),
  }),
  body: z.object({
    memberId: z.number().int().nullish(),
    guestName: z.string().max(255).nullish(),
    attendanceDate: attendanceDate.optional(),
    eventId: z.number().int().nullish(),
    sermonId: z.number().int().nullish(),
    attendanceType: z.enum(['In-person', 'Online', 'Other']).optional(),
    notes: z.string().nullish(),
  }).strict().refine(data => !(data.memberId === null && data.guestName === null), {
    message: "Either memberId or guestName is required",
  }),
});
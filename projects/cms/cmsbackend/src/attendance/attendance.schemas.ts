import { z } from 'zod';

export const createAttendanceSchema = z.object({
  body: z.object({
    memberId: z.number().int().optional(),
    guestName: z.string().max(255).optional(),
    attendanceDate: z.string().datetime({ message: "Attendance date must be a valid ISO datetime" }),
    eventId: z.number().int().optional(),
    sermonId: z.number().int().optional(),
    attendanceType: z.enum(['In-person', 'Online', 'Other']),
    notes: z.string().optional(),
  }).refine(data => data.memberId || data.guestName, {
    message: "Either memberId or guestName is required",
  }),
});

export const updateAttendanceSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.'),
  }),
  body: z.object({
    memberId: z.number().int().optional(),
    guestName: z.string().max(255).optional(),
    attendanceDate: z.string().datetime().optional(),
    eventId: z.number().int().optional(),
    sermonId: z.number().int().optional(),
    attendanceType: z.enum(['In-person', 'Online', 'Other']).optional(),
    notes: z.string().optional(),
  }).strict(),
});
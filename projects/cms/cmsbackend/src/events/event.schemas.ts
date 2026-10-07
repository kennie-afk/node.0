import { z } from 'zod';
import { parseRule } from './recurrence';

const when = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, `${label} must be in YYYY-MM-DDTHH:MM format`);
// A repeat rule must be one the server can expand; free text such as "Every Sunday" would be stored but never repeat.
const rule = z.string().max(255).refine((v) => 'rule' in parseRule(v), { message: 'Use a repeat rule like FREQ=WEEKLY;BYDAY=SU;UNTIL=20261231 (FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY, COUNT or UNTIL)' });
const capacity = z.number().int().min(1).max(100000).nullish();
const EVENT_TYPES = ['Service', 'Meeting', 'Outreach', 'Conference', 'Other'] as const;

// Optional fields are nullish, not just optional: the screen sends null to clear a value, and
// a refinement must treat null like "not given" so clearing the end time cannot crash it.
export const createEventSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(255),
    description: z.string().nullish(),
    type: z.enum(EVENT_TYPES).nullish(),
    startTime: when('Start time'),
    endTime: when('End time').nullish(),
    location: z.string().max(255).nullish(),
    isRecurring: z.boolean().optional(),
    recurrencePattern: rule.nullish(),
    capacity,
  }).refine((v) => !v.endTime || v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] })
    .refine((v) => v.isRecurring !== true || Boolean(v.recurrencePattern), { message: 'A repeating event needs a repeat rule', path: ['recurrencePattern'] }),
});

export const updateEventSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    name: z.string().min(3).max(255).optional(),
    description: z.string().nullish(),
    type: z.enum(EVENT_TYPES).nullish(),
    startTime: when('Start time').optional(),
    endTime: when('End time').nullish(),
    location: z.string().max(255).nullish(),
    isRecurring: z.boolean().optional(),
    recurrencePattern: rule.nullish(),
    capacity,
  }).strict().refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] }),
});

const id = z.string().regex(/^\d+$/, 'ID must be a number string.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'must be a real date');

export const occurrencesSchema = z.object({ query: z.object({ from: day, to: day }) });
export const rsvpListSchema = z.object({ params: z.object({ id }), query: z.object({ date: day }) });
export const rsvpCreateSchema = z.object({
  params: z.object({ id }),
  body: z.object({
    occurrenceDate: day,
    memberId: z.number().int().positive().nullish(),
    guestName: z.string().trim().min(2).max(150).nullish(),
    partySize: z.number().int().min(1).max(20).optional(),
    note: z.string().max(300).nullish()
  }).strict().refine((v) => v.memberId || v.guestName, { message: 'give a memberId or a guestName', path: ['memberId'] })
});
export const rsvpCancelSchema = z.object({ params: z.object({ id, rsvpId: id }) });

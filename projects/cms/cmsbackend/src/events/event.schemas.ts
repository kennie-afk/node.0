import { z } from 'zod';

const when = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, `${label} must be in YYYY-MM-DDTHH:MM format`);
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
    recurrencePattern: z.string().max(255).nullish(),
  }).refine((v) => !v.endTime || v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] }),
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
    recurrencePattern: z.string().max(255).nullish(),
  }).strict().refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] }),
});

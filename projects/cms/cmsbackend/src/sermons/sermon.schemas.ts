import { z } from 'zod';

// The date column is date-only; a full ISO timestamp is still accepted for older clients.
const preached = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.string().datetime()
], { message: 'Invalid date format. Expected YYYY-MM-DD.' });

// Optional fields are nullish: the screen sends null to clear a value.
export const createSermonSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Sermon title must be at least 5 characters long.').max(255),
    speakerMemberId: z.number().int().nullish(),
    eventId: z.number().int().nullish(),
    datePreached: preached,
    passageReference: z.string().max(100).nullish(),
    summary: z.string().nullish(),
    audioUrl: z.string().url('Audio URL must be a valid URL.').max(255).nullish(),
    videoUrl: z.string().url('Video URL must be a valid URL.').max(255).nullish(),
    notes: z.string().nullish(),
  }),
});

export const updateSermonSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    title: z.string().min(5, 'Sermon title must be at least 5 characters long.').max(255).optional(),
    speakerMemberId: z.number().int().nullish(),
    eventId: z.number().int().nullish(),
    datePreached: preached.optional(),
    passageReference: z.string().max(100).nullish(),
    summary: z.string().nullish(),
    audioUrl: z.string().url('Audio URL must be a valid URL.').max(255).nullish(),
    videoUrl: z.string().url('Video URL must be a valid URL.').max(255).nullish(),
    notes: z.string().nullish(),
  }).strict(),
});

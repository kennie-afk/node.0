import { z } from 'zod';

export const createSermonSchema = z.object({
  body: z.object({
    title: z.string().min(5, 'Sermon title must be at least 5 characters long.'),
    speakerMemberId: z.number().int().optional(),
    eventId: z.number().int().optional(),
    datePreached: z.string().datetime('Invalid date format. Expected a valid ISO 8601 date string.'),
    passageReference: z.string().optional(),
    summary: z.string().optional(),
    audioUrl: z.string().url('Audio URL must be a valid URL.').optional(),
    videoUrl: z.string().url('Video URL must be a valid URL.').optional(),
    notes: z.string().optional(),
  }),
});

export const updateSermonSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    title: z.string().min(5, 'Sermon title must be at least 5 characters long.').optional(),
    speakerMemberId: z.number().int().nullable().optional(),
    eventId: z.number().int().nullable().optional(),
    datePreached: z.string().datetime('Invalid date format. Expected a valid ISO 8601 date string.').optional(),
    passageReference: z.string().optional(),
    summary: z.string().optional(),
    audioUrl: z.string().url('Audio URL must be a valid URL.').optional(),
    videoUrl: z.string().url('Video URL must be a valid URL.').optional(),
    notes: z.string().optional(),
  }).strict(),
});


import { z } from 'zod';

export const createEventSchema = z.object({
  body: z.object({
    name: z.string().min(3).max(255),
    description: z.string().optional(),
    startTime: z.string().regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "Start time must be in YYYY-MM-DDTHH:MM format"
    ),
    endTime: z.string().regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "End time must be in YYYY-MM-DDTHH:MM format"
    ).optional(),
    location: z.string().optional(),
  }),
});

export const updateEventSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    name: z.string().min(3).max(255).optional(),
    description: z.string().optional(),
    startTime: z.string().regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "Start time must be in YYYY-MM-DDTHH:MM format"
    ).optional(),
    endTime: z.string().regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
      "End time must be in YYYY-MM-DDTHH:MM format"
    ).optional(),
    location: z.string().optional(),
  }).strict(),
});
import { z } from 'zod';

const AUDIENCES = ['All', 'Members', 'Leaders', 'Specific Group'] as const;

// Optional fields are nullish: the screen sends null to clear a value. The publication date
// stays optional only, because the column cannot be empty.
export const createAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(255),
    content: z.string().min(10),
    publicationDate: z.string().datetime({ message: "Publication date must be a valid ISO datetime" }).optional(),
    expiryDate: z.string().datetime({ message: "Expiry date must be a valid ISO datetime" }).nullish(),
    isPublished: z.boolean().optional(),
    targetAudience: z.enum(AUDIENCES).nullish(),
  }),
});

export const updateAnnouncementSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    title: z.string().min(3).max(255).optional(),
    content: z.string().min(10).optional(),
    publicationDate: z.string().datetime().optional(),
    expiryDate: z.string().datetime().nullish(),
    isPublished: z.boolean().optional(),
    targetAudience: z.enum(AUDIENCES).nullish(),
  }).strict(),
});

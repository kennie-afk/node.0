import { z } from 'zod';

export const createAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(255),
    content: z.string().min(10),
    publicationDate: z.string().datetime({ message: "Publication date must be a valid ISO datetime" }).optional(),
    expiryDate: z.string().datetime({ message: "Expiry date must be a valid ISO datetime" }).optional(),
    isPublished: z.boolean().optional(),
    targetAudience: z.enum(['All', 'Members', 'Visitors']).optional(),
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
    expiryDate: z.string().datetime().optional(),
    isPublished: z.boolean().optional(),
    targetAudience: z.enum(['All', 'Members', 'Visitors']).optional(),
  }).strict(),
});
import { z } from 'zod';

export const createMinistrySchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Ministry name must be at least 3 characters long.'),
    description: z.string().optional(),
    leaderId: z.number().int().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateMinistrySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    name: z.string().min(3, 'Ministry name must be at least 3 characters long.').optional(),
    description: z.string().optional(),
    leaderId: z.number().int().nullable().optional(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const addMemberSchema = z.object({
    params: z.object({
        ministryId: z.string().regex(/^\d+$/, 'Ministry ID must be a number string.'),
    }),
    body: z.object({
        memberId: z.number().int(),
        role: z.string().optional(),
    }).strict(),
});

export const removeMemberSchema = z.object({
    params: z.object({
        ministryId: z.string().regex(/^\d+$/, 'Ministry ID must be a number string.'),
    }),
    body: z.object({
        memberId: z.number().int(),
    }).strict(),
});

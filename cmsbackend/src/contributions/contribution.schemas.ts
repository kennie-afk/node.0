import { z } from 'zod';

export const createContributionSchema = z.object({
    body: z.object({
        memberId: z.number().int(),
        amount: z.number().positive(),
        date: z.string().datetime(),
        contributionType: z.string().optional(),
    }),
});

export const updateContributionSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID must be a number string.')
    }),
    body: z.object({
        memberId: z.number().int().optional(),
        amount: z.number().positive().optional(),
        date: z.string().datetime().optional(),
        contributionType: z.string().optional(),
    }).strict(),
});

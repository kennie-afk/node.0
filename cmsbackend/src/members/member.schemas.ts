import { z } from 'zod';

export const createMemberSchema = z.object({
    body: z.object({
        firstName: z.string().min(2),
        lastName: z.string().min(2),
        email: z.string().email(),
        phoneNumber: z.string().optional(),
        address: z.string().optional(),
        dateOfBirth: z.string().optional(),
        familyId: z.number().int(),
    }),
});

export const updateMemberSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID must be a number string.')
    }),
    body: z.object({
        firstName: z.string().min(2).optional(),
        lastName: z.string().min(2).optional(),
        email: z.string().email().optional(),
        phoneNumber: z.string().optional(),
        address: z.string().optional(),
        dateOfBirth: z.string().optional(),
        familyId: z.number().int().optional(),
    }).strict(),
});

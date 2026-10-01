import { z } from 'zod';

export const createMemberSchema = z.object({
    body: z.object({
        firstName: z.string().min(2),
        lastName: z.string().min(2),
        email: z.string().email().nullish(),
        phoneNumber: z.string().nullish(),
        address: z.string().nullish(),
        dateOfBirth: z.string().nullish(),
        gender: z.enum(['Male', 'Female', 'Other']).nullish(),
        familyId: z.number().int().nullish(),
    }),
});

export const updateMemberSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID must be a number string.')
    }),
    body: z.object({
        firstName: z.string().min(2).optional(),
        lastName: z.string().min(2).optional(),
        email: z.string().email().nullish(),
        phoneNumber: z.string().nullish(),
        address: z.string().nullish(),
        dateOfBirth: z.string().nullish(),
        gender: z.enum(['Male', 'Female', 'Other']).nullish(),
        familyId: z.number().int().nullish(),
    }).strict(),
});

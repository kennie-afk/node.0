import { z } from 'zod';

export const createFamilySchema = z.object({
  body: z.object({
    familyName: z.string().min(3).max(100),
    address: z.string().max(255).nullish(),
    city: z.string().max(100).nullish(),
    county: z.string().max(100).nullish(),
    postalCode: z.string().max(20).nullish(),
    phoneNumber: z.string().max(20).nullish(),
    email: z.string().email().nullish(),
    notes: z.string().nullish(),
    headOfFamilyMemberId: z.number().int().nullish(),   
  }),
});

export const updateFamilySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    familyName: z.string().min(3).max(100).optional(),
    address: z.string().max(255).nullish(),
    city: z.string().max(100).nullish(),
    county: z.string().max(100).nullish(),
    postalCode: z.string().max(20).nullish(),
    phoneNumber: z.string().max(20).nullish(),
    email: z.string().email().nullish(),
    notes: z.string().nullish(),
    headOfFamilyMemberId: z.number().int().nullish(),   
  }).strict(),
});
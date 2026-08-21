import { z } from 'zod';

export const createFamilySchema = z.object({
  body: z.object({
    familyName: z.string().min(3).max(100),
    address: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    phoneNumber: z.string().max(20).optional(),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    headOfFamilyMemberId: z.number().int().nullable().optional(),   
  }),
});

export const updateFamilySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
  body: z.object({
    familyName: z.string().min(3).max(100).optional(),
    address: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
    phoneNumber: z.string().max(20).optional(),
    email: z.string().email().optional(),
    notes: z.string().optional(),
    headOfFamilyMemberId: z.number().int().nullable().optional(),   
  }).strict(),
});
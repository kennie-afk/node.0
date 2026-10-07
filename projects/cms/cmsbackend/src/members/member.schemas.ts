import { z } from 'zod';

export const MEMBER_STATUSES = ['Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date (YYYY-MM-DD)').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'must be a real date');
const dayLoose = z.string().refine((v) => /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)), 'must be a valid date');

// Every column the model holds that a person types in. Optional text may be cleared with null.
const fields = {
    firstName: z.string().min(2).max(100),
    lastName: z.string().min(2).max(100),
    middleName: z.string().max(100).nullish(),
    email: z.string().email().max(100).nullish(),
    phoneNumber: z.string().max(20).nullish(),
    address: z.string().max(255).nullish(),
    city: z.string().max(100).nullish(),
    county: z.string().max(100).nullish(),
    postalCode: z.string().max(20).nullish(),
    dateOfBirth: dayLoose.nullish(),
    gender: z.enum(['Male', 'Female', 'Other']).nullish(),
    status: z.enum(MEMBER_STATUSES),
    baptismDate: day.nullish(),
    membershipDate: day,
    familyId: z.number().int().nullish(),
    notes: z.string().max(5000).nullish(),
};

export const createMemberSchema = z.object({
    body: z.object({ ...fields, status: fields.status.optional(), membershipDate: fields.membershipDate.optional() }),
});

export const updateMemberSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID must be a number string.')
    }),
    body: z.object({ ...fields, firstName: fields.firstName.optional(), lastName: fields.lastName.optional(), status: fields.status.optional(), membershipDate: fields.membershipDate.optional() }).strict(),
});

const id = z.coerce.number().int().positive();

/** Filters for the members list. `page` selects the older offset shape; otherwise the answer is a cursor page. */
export const listMembersSchema = z.object({
    query: z.object({
        q: z.string().trim().max(80).optional(),
        status: z.enum(MEMBER_STATUSES).optional(),
        familyId: id.optional(),
        ministryId: id.optional(),
        smallGroupId: id.optional(),
        joinedFrom: day.optional(),
        joinedTo: day.optional(),
    }).passthrough(),
});

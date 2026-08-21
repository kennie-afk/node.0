import { z } from 'zod';

const meetingDays = z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/; // HH:mm format

export const createSmallGroupSchema = z.object({
  body: z.object({
    name: z.string().min(3, 'Small group name must be at least 3 characters long.'),
    description: z.string().optional().nullable(),
    ministryId: z.number().int('Ministry ID must be an integer.'),
    leaderId: z.number().int('Leader ID must be an integer.').optional().nullable(),
    meetingDay: meetingDays.optional().nullable(),
    meetingTime: z.string().regex(timeRegex, 'Meeting time must be in HH:mm format.').optional().nullable(),
    meetingLocation: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }),
});

export const updateSmallGroupSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.'),
  }),
  body: z.object({
    name: z.string().min(3, 'Small group name must be at least 3 characters long.').optional(),
    description: z.string().optional().nullable(),
    ministryId: z.number().int('Ministry ID must be an integer.').optional(),
    leaderId: z.number().int('Leader ID must be an integer.').optional().nullable(),
    meetingDay: meetingDays.optional().nullable(),
    meetingTime: z.string().regex(timeRegex, 'Meeting time must be in HH:mm format.').optional().nullable(),
    meetingLocation: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  }).strict(),
});

export const smallGroupParamSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a number string.')
  }),
});

export const smallGroupMemberParamSchema = z.object({
  params: z.object({
    smallGroupId: z.string().regex(/^\d+$/, 'Small Group ID must be a number string.'),
    memberId: z.string().regex(/^\d+$/, 'Member ID must be a number string.'),
  }),
});

export const smallGroupMemberBodySchema = z.object({
  body: z.object({
    role: z.string().optional(),
  }),
});

import { z } from 'zod';

export const createUserSchema = z.object({
    body: z.object({
        username: z.string().min(3, 'Username must be at least 3 characters long.').max(50, 'Username cannot exceed 50 characters.'),
        email: z.string().email('Invalid email address.'),
        password: z.string().min(8, 'Password must be at least 8 characters long.'),
        isAdmin: z.boolean().optional(),
    }),
});

export const updateUserSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, 'ID must be a number string.')
    }),
    body: z.object({
        username: z.string().min(3).max(50).optional(),
        email: z.string().email().optional(),
        password: z.string().min(8).optional(),
        isAdmin: z.boolean().optional(),
    }).strict(),
});


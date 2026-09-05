import { z } from 'zod';

export const onboardChurchSchema = z.object({
  body: z.object({
    church: z.object({
      name: z.string().min(2).max(150),
      slug: z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9-]+$/, 'a slug may only contain lowercase letters, digits and hyphens'),
      timezone: z.string().min(3).max(60).optional()
    }),
    owner: z.object({
      username: z.string().min(2).max(50),
      email: z.string().email(),
      password: z.string().min(10, 'the first administrator needs a real password')
    })
  })
});

export type OnboardChurchInput = z.infer<typeof onboardChurchSchema>['body'];

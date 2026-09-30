import { z } from 'zod';
import { BadRequestError } from '../domain/errors';
import { normalisePlate } from '../domain/plate';

export const plateBatchSchema = z.object({
  deviceId: z.string().uuid(),
  captures: z
    .array(
      z.object({
        ts: z.string().datetime(),
        plate: z.string().max(16).nullable(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        direction: z.enum(['entry', 'exit']),
        imageKey: z.string().max(200).optional()
      })
    )
    .min(1)
    .max(500)
});

export type PlateBatch = z.infer<typeof plateBatchSchema>;

export function parsePlateBatch(raw: unknown): PlateBatch {
  const parsed = plateBatchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      `Plate batch rejected: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`
    );
  }
  return parsed.data;
}

export function plateRow(capture: PlateBatch['captures'][number]) {
  return {
    ts: capture.ts,
    raw: capture.plate,
    normalised: capture.plate ? normalisePlate(capture.plate) : null,
    confidence: capture.confidence ?? null,
    direction: capture.direction,
    imageKey: capture.imageKey ?? null
  };
}

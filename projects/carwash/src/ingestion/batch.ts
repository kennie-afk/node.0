import { z } from 'zod';
import { BadRequestError } from '../domain/errors';

export const readingSchema = z.object({
  sequence: z.number().int().nonnegative(),
  ts: z.string().datetime(),
  metric: z.enum(['water_litres', 'pump_seconds', 'machine_cycles', 'vehicle_count']),
  value: z.number().finite().nonnegative()
});

export const batchSchema = z.object({
  deviceId: z.string().uuid(),
  firmware: z.string().max(40).optional(),
  readings: z.array(readingSchema).min(1).max(2000)
});

export type Reading = z.infer<typeof readingSchema>;
export type Batch = z.infer<typeof batchSchema>;

export interface GapReport {
  expectedFrom: number;
  received: number[];
  missing: number[];
  duplicates: number[];
  highest: number;
}

export function inspectSequences(lastSeen: number, readings: Reading[]): GapReport {
  const received = readings.map((reading) => reading.sequence).sort((a, b) => a - b);
  const unique = [...new Set(received)];
  const duplicates = received.filter((value, index) => received.indexOf(value) !== index);

  const highest = unique.length > 0 ? unique[unique.length - 1]! : lastSeen;
  const missing: number[] = [];

  const fresh = unique.filter((value) => value > lastSeen);
  if (fresh.length > 0) {
    for (let expected = lastSeen + 1; expected < fresh[0]!; expected += 1) {
      missing.push(expected);
      if (missing.length > 500) {
        break;
      }
    }
    for (let index = 1; index < fresh.length; index += 1) {
      for (let gap = fresh[index - 1]! + 1; gap < fresh[index]!; gap += 1) {
        missing.push(gap);
        if (missing.length > 500) {
          break;
        }
      }
    }
  }

  return { expectedFrom: lastSeen + 1, received: unique, missing, duplicates, highest };
}

export function parseBatch(raw: unknown): Batch {
  const parsed = batchSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      `Telemetry batch rejected: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`
    );
  }
  return parsed.data;
}

export function foldToMinute(readings: Reading[]): Map<string, { total: number; samples: number }> {
  const buckets = new Map<string, { total: number; samples: number }>();

  for (const reading of readings) {
    const at = new Date(reading.ts);
    at.setUTCSeconds(0, 0);
    const key = `${at.toISOString()}|${reading.metric}`;
    const existing = buckets.get(key) ?? { total: 0, samples: 0 };
    existing.total += reading.value;
    existing.samples += 1;
    buckets.set(key, existing);
  }

  return buckets;
}

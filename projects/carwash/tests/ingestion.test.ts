import { describe, expect, it } from 'vitest';
import { foldToMinute, inspectSequences, parseBatch, Reading } from '../src/ingestion/batch';

function reading(sequence: number, overrides: Partial<Reading> = {}): Reading {
  return {
    sequence,
    ts: '2026-10-14T08:00:30.000Z',
    metric: 'water_litres',
    value: 1.5,
    ...overrides
  };
}

describe('a device that skips sequence numbers is itself a fraud signal', () => {
  it('reports the missing range when a device drops events', () => {
    const report = inspectSequences(10, [reading(11), reading(15)]);
    expect(report.missing).toEqual([12, 13, 14]);
  });

  it('reports nothing missing for a contiguous run', () => {
    const report = inspectSequences(10, [reading(11), reading(12), reading(13)]);
    expect(report.missing).toEqual([]);
    expect(report.highest).toBe(13);
  });

  it('flags duplicates from an over-eager retry', () => {
    const report = inspectSequences(10, [reading(11), reading(11), reading(12)]);
    expect(report.duplicates).toEqual([11]);
  });

  it('ignores replays of sequences already accepted', () => {
    const report = inspectSequences(20, [reading(5), reading(6)]);
    expect(report.missing).toEqual([]);
  });
});

describe('batches are validated before they reach the database', () => {
  it('accepts a well formed batch', () => {
    const batch = parseBatch({
      deviceId: '3f1a0c2e-9b7d-4a1e-8f2c-1d5e6a7b8c9d',
      readings: [reading(1)]
    });
    expect(batch.readings).toHaveLength(1);
  });

  it('rejects a negative meter reading rather than storing it', () => {
    expect(() =>
      parseBatch({
        deviceId: '3f1a0c2e-9b7d-4a1e-8f2c-1d5e6a7b8c9d',
        readings: [reading(1, { value: -5 })]
      })
    ).toThrow(/rejected/);
  });

  it('rejects an unknown metric', () => {
    expect(() =>
      parseBatch({
        deviceId: '3f1a0c2e-9b7d-4a1e-8f2c-1d5e6a7b8c9d',
        readings: [reading(1, { metric: 'profit' as never })]
      })
    ).toThrow();
  });

  it('caps the batch size so one device cannot flood ingestion', () => {
    expect(() =>
      parseBatch({
        deviceId: '3f1a0c2e-9b7d-4a1e-8f2c-1d5e6a7b8c9d',
        readings: Array.from({ length: 2001 }, (_, index) => reading(index))
      })
    ).toThrow();
  });
});

describe('edge aggregation is what makes the volume survivable', () => {
  it('folds a minute of readings into one bucket', () => {
    const readings = Array.from({ length: 60 }, (_, index) =>
      reading(index, { ts: `2026-10-14T08:00:${String(index).padStart(2, '0')}.000Z` })
    );

    const buckets = foldToMinute(readings);

    expect(buckets.size).toBe(1);
    const bucket = buckets.get('2026-10-14T08:00:00.000Z|water_litres');
    expect(bucket?.samples).toBe(60);
    expect(bucket?.total).toBeCloseTo(90);
  });

  it('separates metrics within the same minute', () => {
    const buckets = foldToMinute([
      reading(1),
      reading(2, { metric: 'pump_seconds', value: 30 })
    ]);
    expect(buckets.size).toBe(2);
  });
});

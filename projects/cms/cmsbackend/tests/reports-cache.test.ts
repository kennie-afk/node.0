import { afterEach, describe, expect, it } from 'vitest';
import { MemoryCacheStore, bumpTenantCache, cached, setCacheStore } from '../src/common/cache';

afterEach(() => setCacheStore(null));

describe('report cache', () => {
  it('computes once per key until the church version moves', async () => {
    setCacheStore(new MemoryCacheStore());
    let runs = 0;
    const compute = async () => ({ n: ++runs });
    expect(await cached(7, 'r', { a: 1 }, compute)).toEqual({ n: 1 });
    expect(await cached(7, 'r', { a: 1 }, compute)).toEqual({ n: 1 });
    expect(await cached(7, 'r', { a: 2 }, compute)).toEqual({ n: 2 }); // different parameters, different key
    await bumpTenantCache(7);
    expect(await cached(7, 'r', { a: 1 }, compute)).toEqual({ n: 3 });
  });

  it('keeps churches apart and lets entries expire', async () => {
    let now = 1_000;
    setCacheStore(new MemoryCacheStore(() => now));
    let runs = 0;
    const compute = async () => ++runs;
    expect(await cached(1, 'x', {}, compute, { ttlSeconds: 10 })).toBe(1);
    expect(await cached(2, 'x', {}, compute, { ttlSeconds: 10 })).toBe(2);
    expect(await cached(1, 'x', {}, compute, { ttlSeconds: 10 })).toBe(1);
    now += 11_000;
    expect(await cached(1, 'x', {}, compute, { ttlSeconds: 10 })).toBe(3);
  });

  it('is a plain pass-through with no store, and survives a broken store', async () => {
    setCacheStore(null);
    let runs = 0;
    await cached(1, 'x', {}, async () => ++runs);
    await cached(1, 'x', {}, async () => ++runs);
    expect(runs).toBe(2);
    setCacheStore({
      get: async () => {
        throw new Error('down');
      },
      set: async () => {
        throw new Error('down');
      },
      incr: async () => {
        throw new Error('down');
      }
    });
    expect(await cached(1, 'x', {}, async () => 'fresh')).toBe('fresh');
    await expect(bumpTenantCache(1)).resolves.toBeUndefined();
  });
});

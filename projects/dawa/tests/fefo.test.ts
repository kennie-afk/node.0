import { describe, expect, it } from 'vitest';
import { allocateFefo, BatchLike, daysToExpiry, InsufficientStock, sellable } from '../src/inventory/fefo';

const at = (iso: string) => new Date(`${iso}T08:00:00Z`);
const batch = (id: string, expiryDate: string, qtyOnHand: number, received = '2026-01-01', unitCostCents = 100): BatchLike => ({
  id, expiryDate, qtyOnHand, receivedAt: at(received), unitCostCents
});
const TODAY = '2026-10-03';

describe('first-expiry-first-out', () => {
  it('takes from the soonest-expiring batch first', () => {
    const out = allocateFefo([batch('late', '2028-01-31', 50), batch('soon', '2027-01-31', 50)], 20, TODAY);
    expect(out).toEqual([{ batchId: 'soon', qty: 20, unitCostCents: 100 }]);
  });
  it('spans batches when one is not enough, in expiry order', () => {
    const out = allocateFefo([batch('a', '2027-06-30', 5), batch('b', '2027-01-31', 3), batch('c', '2028-01-31', 10)], 9, TODAY);
    expect(out.map((o) => [o.batchId, o.qty])).toEqual([['b', 3], ['a', 5], ['c', 1]]);
  });
  it('breaks an expiry tie by the older receipt, so every replica picks the same batch', () => {
    const out = allocateFefo([batch('new', '2027-06-30', 5, '2026-09-01'), batch('old', '2027-06-30', 5, '2026-03-01')], 2, TODAY);
    expect(out[0]!.batchId).toBe('old');
  });
  it('never allocates expired stock, even when that leaves too little', () => {
    const batches = [batch('expired', '2026-10-02', 100), batch('ok', '2027-01-31', 4)];
    expect(sellable(batches, TODAY).map((b) => b.id)).toEqual(['ok']);
    expect(() => allocateFefo(batches, 5, TODAY)).toThrow(InsufficientStock);
  });
  it('treats a batch expiring today as still sellable and one expiring yesterday as not', () => {
    expect(allocateFefo([batch('today', TODAY, 3)], 3, TODAY)[0]!.batchId).toBe('today');
    expect(() => allocateFefo([batch('yesterday', '2026-10-02', 3)], 1, TODAY)).toThrow(InsufficientStock);
  });
  it('reports how much was actually available when it refuses', () => {
    try {
      allocateFefo([batch('a', '2027-01-31', 2), batch('b', '2027-02-28', 1)], 10, TODAY);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientStock);
      expect((error as InsufficientStock).available).toBe(3);
      expect((error as InsufficientStock).requested).toBe(10);
    }
  });
  it('rejects zero, negative and fractional quantities', () => {
    for (const bad of [0, -1, 1.5]) expect(() => allocateFefo([batch('a', '2027-01-31', 9)], bad, TODAY)).toThrow(RangeError);
  });
  it('never allocates more than any batch holds and always allocates exactly what was asked', () => {
    const batches = [batch('a', '2027-01-31', 7), batch('b', '2027-03-31', 4), batch('c', '2027-05-31', 9)];
    for (let need = 1; need <= 20; need += 1) {
      const out = allocateFefo(batches, need, TODAY);
      expect(out.reduce((sum, o) => sum + o.qty, 0)).toBe(need);
      for (const o of out) expect(o.qty).toBeLessThanOrEqual(batches.find((b) => b.id === o.batchId)!.qtyOnHand);
    }
  });
});

describe('days to expiry', () => {
  it('counts calendar days, negative once expired', () => {
    expect(daysToExpiry('2026-10-13', TODAY)).toBe(10);
    expect(daysToExpiry(TODAY, TODAY)).toBe(0);
    expect(daysToExpiry('2026-10-01', TODAY)).toBe(-2);
    expect(daysToExpiry('2027-03-31', '2027-02-28')).toBe(31);
  });
});

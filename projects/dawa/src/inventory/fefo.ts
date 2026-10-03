/**
 * First-expiry-first-out allocation as a pure function, so the rule is testable without a database. The caller
 * locks the batch rows before calling it; this decides only which batches a quantity comes from.
 *
 * Expired stock is never allocated. Among the rest the soonest expiry goes first, and among equal expiries the
 * oldest receipt, so the order is total and the same on every replica.
 */
export interface BatchLike {
  id: string;
  expiryDate: string; // yyyy-mm-dd
  qtyOnHand: number;
  receivedAt: Date;
  unitCostCents: number;
}

export interface Allocation {
  batchId: string;
  qty: number;
  unitCostCents: number;
}

export class InsufficientStock extends Error {
  constructor(
    readonly requested: number,
    readonly available: number
  ) {
    super(`only ${available} in date, ${requested} asked for`);
  }
}

export function sellable(batches: BatchLike[], today: string): BatchLike[] {
  return batches
    .filter((batch) => batch.qtyOnHand > 0 && batch.expiryDate >= today)
    .sort((a, b) => (a.expiryDate === b.expiryDate ? a.receivedAt.getTime() - b.receivedAt.getTime() : a.expiryDate < b.expiryDate ? -1 : 1));
}

export function allocateFefo(batches: BatchLike[], needed: number, today: string): Allocation[] {
  if (!Number.isInteger(needed) || needed <= 0) throw new RangeError('quantity must be a positive whole number');
  const usable = sellable(batches, today);
  const available = usable.reduce((sum, batch) => sum + batch.qtyOnHand, 0);
  if (available < needed) throw new InsufficientStock(needed, available);

  const out: Allocation[] = [];
  let remaining = needed;
  for (const batch of usable) {
    if (remaining === 0) break;
    const take = Math.min(batch.qtyOnHand, remaining);
    out.push({ batchId: batch.id, qty: take, unitCostCents: batch.unitCostCents });
    remaining -= take;
  }
  return out;
}

/** Days from today to an expiry date (negative once expired). Calendar days, no time zones involved. */
export function daysToExpiry(expiryDate: string, today: string): number {
  const toDay = (value: string) => Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) / 86_400_000;
  return Math.round(toDay(expiryDate) - toDay(today));
}

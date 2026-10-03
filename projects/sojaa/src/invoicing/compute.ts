/**
 * Client invoicing arithmetic. Pure. Whole cents; every figure on an invoice ties out to the sum of the verified shifts it bills.
 */
export interface Rate {
  id: string;
  siteId: string;
  postId: string | null;
  basis: 'per_shift' | 'per_hour';
  amountCents: number;
  effectiveFrom: string;
  /** creation order, to break ties between two rates with the same date */
  seq: number;
}

/** A post's own rate beats the site's; among equals, the latest effective date not after the shift's day, then the newest entry. */
export function pickRate(rates: readonly Rate[], siteId: string, postId: string | null, day: string): Rate | null {
  const usable = rates.filter((r) => r.siteId === siteId && r.effectiveFrom <= day && (r.postId === null || r.postId === postId));
  usable.sort((a, b) => Number(b.postId !== null) - Number(a.postId !== null) || (a.effectiveFrom < b.effectiveFrom ? 1 : a.effectiveFrom > b.effectiveFrom ? -1 : 0) || b.seq - a.seq);
  return usable[0] ?? null;
}

export function shiftAmount(rate: Rate, verifiedMinutes: number): number {
  return rate.basis === 'per_shift' ? rate.amountCents : Math.round((rate.amountCents * verifiedMinutes) / 60);
}

export interface BillableShift {
  shiftId: string;
  siteId: string;
  siteName: string;
  postId: string;
  postName: string;
  day: string;
  verifiedMinutes: number;
}

export interface InvoiceLine {
  siteId: string;
  postId: string;
  description: string;
  basis: 'per_shift' | 'per_hour';
  quantity: number;
  unitCents: number;
  amountCents: number;
  shifts: Array<{ shiftId: string; verifiedMinutes: number; billedCents: number }>;
}

export interface Unbillable {
  shiftId: string;
  reason: 'no_rate' | 'not_verified';
}

/** Groups verified shifts into lines by post, rate basis and unit rate. Shifts with no verified time or no rate are reported, never billed. */
export function buildInvoice(shifts: readonly BillableShift[], rates: readonly Rate[]): { lines: InvoiceLine[]; total: number; unbillable: Unbillable[] } {
  const unbillable: Unbillable[] = [];
  const groups = new Map<string, InvoiceLine>();
  for (const s of shifts) {
    if (s.verifiedMinutes <= 0) {
      unbillable.push({ shiftId: s.shiftId, reason: 'not_verified' });
      continue;
    }
    const rate = pickRate(rates, s.siteId, s.postId, s.day);
    if (!rate) {
      unbillable.push({ shiftId: s.shiftId, reason: 'no_rate' });
      continue;
    }
    const key = `${s.postId}|${rate.basis}|${rate.amountCents}`;
    let line = groups.get(key);
    if (!line) {
      line = { siteId: s.siteId, postId: s.postId, description: `${s.siteName}, ${s.postName}`, basis: rate.basis, quantity: 0, unitCents: rate.amountCents, amountCents: 0, shifts: [] };
      groups.set(key, line);
    }
    const billed = shiftAmount(rate, s.verifiedMinutes);
    line.shifts.push({ shiftId: s.shiftId, verifiedMinutes: s.verifiedMinutes, billedCents: billed });
    line.amountCents += billed;
    line.quantity += rate.basis === 'per_shift' ? 1 : s.verifiedMinutes / 60;
  }
  const lines = [...groups.values()].map((l) => ({ ...l, quantity: Math.round(l.quantity * 100) / 100 }));
  return { lines, total: lines.reduce((s, l) => s + l.amountCents, 0), unbillable };
}

/** Oldest invoice first. What does not fit stays on account. */
export function allocatePayment(amountCents: number, open: ReadonlyArray<{ id: string; balanceCents: number }>): { allocations: Array<{ invoiceId: string; amountCents: number }>; unallocatedCents: number } {
  let left = amountCents;
  const allocations: Array<{ invoiceId: string; amountCents: number }> = [];
  for (const inv of open) {
    if (left <= 0) break;
    const take = Math.min(left, inv.balanceCents);
    if (take > 0) {
      allocations.push({ invoiceId: inv.id, amountCents: take });
      left -= take;
    }
  }
  return { allocations, unallocatedCents: left };
}

export const AGEING = ['not_due', '1-30', '31-60', '61-90', '90+'] as const;
export type AgeingBucket = (typeof AGEING)[number];

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function ageingBucket(dueDate: string, asOf: string): AgeingBucket {
  const late = daysBetween(dueDate, asOf);
  if (late <= 0) return 'not_due';
  if (late <= 30) return '1-30';
  if (late <= 60) return '31-60';
  if (late <= 90) return '61-90';
  return '90+';
}

/** Splits a guard's monthly employer cost across clients in proportion to verified minutes, summing exactly (largest remainder). */
export function allocateCost(costCents: number, minutesByClient: Readonly<Record<string, number>>): Record<string, number> {
  const entries = Object.entries(minutesByClient).filter(([, m]) => m > 0);
  const total = entries.reduce((s, [, m]) => s + m, 0);
  const out: Record<string, number> = {};
  if (total === 0) return out;
  const shares = entries.map(([id, m]) => ({ id, exact: (costCents * m) / total }));
  let assigned = 0;
  for (const s of shares) {
    out[s.id] = Math.floor(s.exact);
    assigned += out[s.id]!;
  }
  const order = [...shares].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.id.localeCompare(b.id));
  for (let i = 0; assigned < costCents; i += 1, assigned += 1) out[order[i % order.length]!.id]! += 1;
  return out;
}

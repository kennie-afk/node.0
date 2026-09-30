import { fromMinor, toMinor } from '../../ui';

/** Splits a yearly amount over 12 months so the months add back to it exactly (remainder to the first months). */
export function splitAnnual(annual: string): string[] {
  const total = annual ? toMinor(annual) : 0;
  const base = Math.floor(total / 12);
  let remainder = total - base * 12;
  return Array.from({ length: 12 }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return fromMinor(base + extra);
  });
}

export const annualOf = (months: string[]): string => fromMinor(months.reduce((sum, m) => sum + (m ? toMinor(m) : 0), 0));

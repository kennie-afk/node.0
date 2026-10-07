/** Sojaa serves Kenyan firms: one wall-clock zone (EAT, UTC+3, no daylight saving). Every "day" a person sees is a day in this zone. */
export const TZ = 'Africa/Nairobi';

export const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

export function monthBounds(month: string): { first: string; last: string; nextFirst: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, '0')}`, nextFirst: addDays(`${month}-${String(last).padStart(2, '0')}`, 1) };
}

export function localDayOf(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/**
 * Splits `minutes` that begin at `start` into the Nairobi calendar days they fall on. Nairobi has no daylight saving (UTC+3 all year), so
 * local midnight is a fixed instant. A night shift from 22:00 to 06:00 is 120 minutes on one day and 360 on the next, which is what a
 * holiday or rest-day premium has to see: the premium belongs to the day worked, not to the day the shift began.
 */
export function splitByLocalDay(start: Date, minutes: number): Array<{ day: string; minutes: number }> {
  const out: Array<{ day: string; minutes: number }> = [];
  let cursor = start.getTime();
  let left = minutes;
  while (left > 0) {
    const day = localDayOf(new Date(cursor));
    const nextMidnight = Date.parse(`${addDays(day, 1)}T00:00:00+03:00`);
    const take = Math.min(left, Math.max(1, Math.round((nextMidnight - cursor) / 60_000)));
    out.push({ day, minutes: take });
    left -= take;
    cursor += take * 60_000;
  }
  return out;
}

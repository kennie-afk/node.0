/**
 * Calendar maths on plain ISO strings. Dates are YYYY-MM-DD and are added to in UTC so a
 * daylight-saving change in the viewer's timezone can never shift a day.
 */
export function parseISODate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseISODate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toISODate(date);
}

/** Monday of the week containing `value`. */
export function startOfWeek(value: string): string {
  const day = parseISODate(value).getUTCDay();
  return addDays(value, day === 0 ? -6 : 1 - day);
}

export function weekDays(value: string): string[] {
  const monday = startOfWeek(value);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Date + time typed in the browser's local zone -> the ISO instant the API wants. */
export function localToISO(date: string, time: string): string {
  return new Date(`${date}T${time || '00:00'}`).toISOString();
}

export function isoToLocalDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isoToLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function minutesIntoDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function dayLabel(value: string): string {
  return parseISODate(value).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

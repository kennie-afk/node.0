import type { Room } from '../../../api/checkinApi';

export function ageInMonths(dateOfBirth: string, today = new Date()): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let months = (today.getUTCFullYear() - dob.getUTCFullYear()) * 12 + (today.getUTCMonth() - dob.getUTCMonth());
  if (today.getUTCDate() < dob.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function ageLabel(months: number): string {
  if (months < 24) return `${months} mo`;
  const years = Math.floor(months / 12);
  return `${years} yr`;
}

export function isFull(room: Room): boolean {
  return (room.present ?? 0) >= room.capacity;
}

export function fillRatio(room: Room): number {
  return room.capacity === 0 ? 0 : Math.min(1, (room.present ?? 0) / room.capacity);
}

/**
 * The room a child belongs in: active, age band covers them, not full; the tightest band wins so
 * a two-year-old goes to "Toddlers" rather than a 0-60 month catch-all.
 */
export function suggestRoom(rooms: Room[], ageMonths: number): Room | null {
  const fits = rooms
    .filter((r) => r.isActive && ageMonths >= r.minAgeMonths && ageMonths <= r.maxAgeMonths && !isFull(r))
    .sort((a, b) => a.maxAgeMonths - a.minAgeMonths - (b.maxAgeMonths - b.minAgeMonths) || a.id - b.id);
  return fits[0] ?? null;
}

export function roomProblem(room: Room, ageMonths: number): string | null {
  if (!room.isActive) return 'This room is closed.';
  if (isFull(room)) return `${room.name} is full (${room.present}/${room.capacity}).`;
  if (ageMonths < room.minAgeMonths || ageMonths > room.maxAgeMonths) return `${room.name} is for ages ${ageLabel(room.minAgeMonths)} to ${ageLabel(room.maxAgeMonths)}.`;
  return null;
}

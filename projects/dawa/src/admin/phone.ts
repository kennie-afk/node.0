import { randomInt } from 'node:crypto';

/** Kenyan mobile numbers arrive as 07xx, 01xx, +254… or 254…; the system stores 254XXXXXXXXX. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (/^254[17]\d{8}$/.test(digits)) {
    return digits;
  }
  if (/^0[17]\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`;
  }
  if (/^[17]\d{8}$/.test(digits)) {
    return `254${digits}`;
  }
  throw new Error(`"${raw}" is not a Kenyan mobile number (expected 07xx, 01xx, +254 or 254 form)`);
}

/** Six random digits from the OS CSPRNG. Shown once at provisioning and never stored in clear. */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Kenyan mobile numbers arrive as 07xx, 01xx, +254..., 254... or 7xx...; matching needs one form. */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  let national: string;
  if (digits.startsWith('254') && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith('0') && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  else return null;
  return /^[17]\d{8}$/.test(national) ? `254${national}` : null;
}

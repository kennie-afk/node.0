/** Account numbers are typed by hand on a phone: case, spaces and dashes must not matter. */
export function normaliseBillingRef(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Account numbers: `AS` + 8 random digits + 1 Luhn check digit. The check digit catches every single
 * mistyped digit and nearly every swap of two neighbours, so a slip on a phone keypad no longer lands
 * on another firm's account; it is held for an operator instead. Older numbers (`AS` + 6 digits, no
 * check digit) are still accepted as they are.
 */
const CURRENT_FORMAT = /^AS\d{9}$/;

export function luhnCheckDigit(body: string): string {
  let sum = 0;
  // the check digit will sit to the right of the body, so the body's last digit is doubled
  for (let i = body.length - 1, double = true; i >= 0; i -= 1, double = !double) {
    let d = body.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

export function makeBillingRef(eightDigits: string): string {
  return `AS${eightDigits}${luhnCheckDigit(eightDigits)}`;
}

/** True when the number is in the current format but its check digit does not match: a typing error. */
export function failsBillingCheckDigit(normalised: string): boolean {
  if (!CURRENT_FORMAT.test(normalised)) return false;
  const body = normalised.slice(2, 10);
  return luhnCheckDigit(body) !== normalised[10];
}

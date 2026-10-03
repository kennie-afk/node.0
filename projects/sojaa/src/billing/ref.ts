/** Account numbers are typed by hand on a phone: case, spaces and dashes must not matter. */
export function normaliseBillingRef(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

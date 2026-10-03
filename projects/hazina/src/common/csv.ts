/** One cell of a CSV. A leading = + - @ would be run as a formula by a spreadsheet, so it is neutralised with a quote. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return `${[header.join(','), ...rows.map((row) => row.map(csvCell).join(','))].join('\n')}\n`;
}

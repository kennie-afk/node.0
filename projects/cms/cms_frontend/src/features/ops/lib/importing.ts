import type { ImportResult, ImportRowError } from '../../../api/dataopsApi';

/** Errors grouped by row, so a spreadsheet owner can fix one line at a time. */
export function errorsByRow(errors: ImportRowError[]): Array<{ row: number; problems: string[] }> {
  const map = new Map<number, string[]>();
  for (const e of errors) map.set(e.row, [...(map.get(e.row) ?? []), `${e.field}: ${e.message}`]);
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([row, problems]) => ({ row, problems }));
}

/** Whether "Apply" should be offered after a dry run. */
export function canApply(result: ImportResult, allowPartial: boolean): boolean {
  if (result.status !== 'DRY_RUN') return false;
  const writes = result.createdCount + result.updatedCount;
  if (writes === 0) return false;
  return result.errorCount === 0 || allowPartial;
}

export function summarise(result: ImportResult): string {
  const parts = [`${result.createdCount} new`, `${result.updatedCount} updated`, `${result.skippedCount} skipped`];
  if (result.errorCount > 0) parts.push(`${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`);
  return `${result.totalRows} rows: ${parts.join(', ')}`;
}

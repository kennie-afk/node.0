import { formatKsh } from '../domain/money';
import { ReconciliationResult } from '../reconciliation/types';

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC'
});

export function renderDailyReport(result: ReconciliationResult): string {
  const heading = `${result.siteName.toUpperCase()} — ${DAY_FORMAT.format(result.day)}`;
  const flagged = result.gap > 0 ? '  ⚠' : '';

  const lines = [
    heading,
    '',
    `Cars detected:     ${result.vehiclesDetected}`,
    `Jobs recorded:     ${result.jobsRecorded}`,
    `Expected revenue:  ${formatKsh(result.expectedRevenue)}`,
    `Received:          ${formatKsh(result.receivedRevenue)}`,
    `Gap:               ${formatKsh(result.gap)}${flagged}`
  ];

  if (result.discrepancies.length > 0) {
    lines.push('');
    lines.push(
      `${result.discrepancies.length} flag${result.discrepancies.length === 1 ? '' : 's'} — tap to review`
    );
  }

  return lines.join('\n');
}

export function reportSubject(result: ReconciliationResult): string {
  return result.gap > 0
    ? `${result.siteName}: ${formatKsh(result.gap)} unaccounted for today`
    : `${result.siteName}: takings reconciled`;
}

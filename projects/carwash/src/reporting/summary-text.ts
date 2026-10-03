import { formatKsh, Cents } from '../domain/money';

export const FLAG_LABELS: Record<string, string> = {
  ghost_wash: 'Cars washed with no job recorded',
  underquoting: 'Jobs quoted below list price',
  off_book_upsell: 'Extras sold off the record',
  supply_pilferage: 'Shampoo or wax used beyond what the washes explain',
  after_hours_operation: 'Water running outside opening hours',
  commission_padding: 'Commission that does not match the work',
  payment_without_job: 'Payments with no job to match',
  job_without_payment: 'Jobs finished with no payment',
  abandoned_job_pattern: 'Many abandoned jobs by one worker',
  cash_ratio_spike: 'Unusually high cash share',
  device_silent: 'A device stopped reporting',
  device_tamper: 'A device looks tampered with'
};

export interface SummaryFlag {
  type: string;
  label: string;
  count: number;
  estimatedCents: number;
}

export interface SummarySite {
  name: string;
  daysChecked: number;
  expectedCents: number;
  receivedCents: number;
  gapCents: number;
  flags: number;
}

export interface Summary {
  scope: 'real' | 'sample' | 'none';
  windowDays: number;
  from: string;
  to: string;
  daysChecked: number;
  carsDetected: number;
  jobsRecorded: number;
  expectedCents: number;
  receivedCents: number;
  gapCents: number;
  flagsRaised: number;
  openFlags: number;
  flaggedCents: number;
  sites: SummarySite[];
  topFlags: SummaryFlag[];
  text: string;
}

export function renderSummaryText(summary: Omit<Summary, 'text'>, organisation: string): string {
  if (summary.scope === 'none') {
    return `${organisation}\nNothing has been reconciled yet. Check a finished day, or load the sample data to see what Forecourt looks for.`;
  }
  const lines: string[] = [];
  if (summary.scope === 'sample') lines.push('SAMPLE DATA - not your records');
  lines.push(`${organisation}: what Forecourt found, ${summary.from} to ${summary.to}`);
  lines.push('');
  lines.push(`Days checked:      ${summary.daysChecked}`);
  lines.push(`Cars detected:     ${summary.carsDetected}`);
  lines.push(`Jobs recorded:     ${summary.jobsRecorded}`);
  lines.push(`Expected revenue:  ${formatKsh(summary.expectedCents as Cents)}`);
  lines.push(`Received:          ${formatKsh(summary.receivedCents as Cents)}`);
  lines.push(`Gap:               ${formatKsh(summary.gapCents as Cents)}`);
  if (summary.topFlags.length > 0) {
    lines.push('');
    lines.push(`${summary.flagsRaised} thing${summary.flagsRaised === 1 ? '' : 's'} to look at:`);
    for (const flag of summary.topFlags) {
      const stake = flag.estimatedCents > 0 ? ` (${formatKsh(flag.estimatedCents as Cents)} at stake)` : '';
      lines.push(`- ${flag.label}: ${flag.count}${stake}`);
    }
  } else {
    lines.push('');
    lines.push('No flags raised in these days.');
  }
  lines.push('');
  lines.push('Flags are leads to check, not proof that anyone took anything.');
  return lines.join('\n');
}


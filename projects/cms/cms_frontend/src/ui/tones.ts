export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'accent';

/** Status words used across the modules and the tone each deserves. */
const STATUS_TONES: Record<string, Tone> = {
  POSTED: 'ok', PAID: 'ok', APPROVED: 'ok', ACTIVE: 'ok', VERIFIED: 'ok', OPEN: 'info', CLOSED: 'neutral', LOCKED: 'neutral',
  DRAFT: 'neutral', SUBMITTED: 'info', PENDING: 'warn', PARTIALLY_PAID: 'warn', COUNTED: 'info', CALCULATED: 'info',
  VOID: 'bad', VOIDED: 'bad', REJECTED: 'bad', FAILED: 'bad', ERROR: 'bad', OVERDUE: 'bad', CANCELLED: 'neutral',
  UNALLOCATED: 'warn', MATCHED: 'ok', UNMATCHED: 'warn', IGNORED: 'neutral', REVERSED: 'bad', QUEUED: 'info', SENT: 'ok'
};

export function toneFor(status: string): Tone {
  return STATUS_TONES[status.toUpperCase().replace(/ /g, '_')] ?? 'neutral';
}


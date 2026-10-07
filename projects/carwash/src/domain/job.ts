export type JobState =
  | 'created'
  | 'in_progress'
  | 'awaiting_payment'
  | 'paid'
  | 'closed'
  | 'abandoned'
  | 'disputed'
  // a paid job that was refunded: the payment is reversed, the job no longer counts as work done
  | 'voided';

export type JobEventType =
  | 'job.created'
  | 'job.started'
  | 'job.services_changed'
  | 'job.work_finished'
  | 'job.payment_matched'
  | 'job.closed'
  | 'job.abandoned'
  | 'job.disputed'
  | 'job.voided'
  | 'job.reopened'
  | 'job.corrected';

const TRANSITIONS: Record<JobState, JobState[]> = {
  created: ['in_progress', 'abandoned'],
  in_progress: ['awaiting_payment', 'abandoned', 'disputed'],
  awaiting_payment: ['paid', 'abandoned', 'disputed'],
  paid: ['closed', 'disputed', 'voided'],
  closed: ['disputed', 'voided'],
  abandoned: [],
  disputed: [],
  voided: []
};

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set(['closed', 'abandoned', 'disputed', 'voided']);

export class IllegalTransitionError extends Error {
  constructor(from: JobState, to: JobState) {
    super(`a job cannot move from ${from} to ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.has(state);
}

export const EVENT_RESULTING_STATE: Partial<Record<JobEventType, JobState>> = {
  'job.created': 'created',
  'job.started': 'in_progress',
  'job.work_finished': 'awaiting_payment',
  'job.payment_matched': 'paid',
  'job.closed': 'closed',
  'job.abandoned': 'abandoned',
  'job.disputed': 'disputed',
  'job.voided': 'voided'
};

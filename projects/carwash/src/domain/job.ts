export type JobState =
  | 'created'
  | 'in_progress'
  | 'awaiting_payment'
  | 'paid'
  | 'closed'
  | 'abandoned'
  | 'disputed';

export type JobEventType =
  | 'job.created'
  | 'job.started'
  | 'job.services_changed'
  | 'job.work_finished'
  | 'job.payment_matched'
  | 'job.closed'
  | 'job.abandoned'
  | 'job.disputed'
  | 'job.reopened'
  | 'job.corrected';

const TRANSITIONS: Record<JobState, JobState[]> = {
  created: ['in_progress', 'abandoned'],
  in_progress: ['awaiting_payment', 'abandoned', 'disputed'],
  awaiting_payment: ['paid', 'abandoned', 'disputed'],
  paid: ['closed', 'disputed'],
  closed: ['disputed'],
  abandoned: [],
  disputed: []
};

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set(['closed', 'abandoned', 'disputed']);

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
  'job.disputed': 'disputed'
};

import { normalisePlate, platesMatch } from '../domain/plate';

export interface MatchCandidate {
  jobId: string;
  quotedTotalCents: number;
  plateNormalised: string | null;
  createdAt: Date;
  state: string;
}

export interface MatchOutcome {
  jobId: string | null;
  confidence: 'exact_reference' | 'amount_and_time' | 'unmatched';
  reason: string;
}

const AWAITING = new Set(['awaiting_payment', 'in_progress']);
const WINDOW_MS = 90 * 60 * 1000;

export function matchPaymentToJob(
  payment: { amountCents: number; reference: string; receivedAt: Date },
  candidates: MatchCandidate[]
): MatchOutcome {
  const open = candidates.filter((candidate) => AWAITING.has(candidate.state));

  if (payment.reference.length > 0) {
    const wanted = normalisePlate(payment.reference);
    const byPlate = open.filter(
      (candidate) => candidate.plateNormalised && platesMatch(candidate.plateNormalised, wanted)
    );
    if (byPlate.length === 1) {
      return {
        jobId: byPlate[0]!.jobId,
        confidence: 'exact_reference',
        reason: 'the payment reference matched exactly one open job plate'
      };
    }
  }

  const inWindow = open.filter(
    (candidate) =>
      candidate.quotedTotalCents === payment.amountCents &&
      Math.abs(payment.receivedAt.getTime() - candidate.createdAt.getTime()) <= WINDOW_MS
  );

  if (inWindow.length === 1) {
    return {
      jobId: inWindow[0]!.jobId,
      confidence: 'amount_and_time',
      reason: 'exactly one open job had this amount within the time window'
    };
  }

  return {
    jobId: null,
    confidence: 'unmatched',
    reason:
      inWindow.length > 1
        ? 'several open jobs share this amount, so it needs a human'
        : 'no open job matches this payment'
  };
}

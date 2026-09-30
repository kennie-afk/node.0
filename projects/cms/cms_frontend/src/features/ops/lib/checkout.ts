import { ApiError } from '../../../api/http';

export type CheckoutOutcome =
  | { kind: 'wrong-code'; message: string; locked: boolean }
  | { kind: 'not-authorised'; message: string }
  | { kind: 'other'; message: string };

/** Turns the server's refusal into what the volunteer at the door should see and do. */
export function explainCheckoutFailure(error: unknown): CheckoutOutcome {
  const message = error instanceof ApiError ? error.message : 'The check-out could not be completed.';
  if (/locked|too many/i.test(message)) return { kind: 'wrong-code', message, locked: true };
  if (/code does not match/i.test(message)) return { kind: 'wrong-code', message, locked: false };
  if (/not an authori[sz]ed|not authori[sz]ed|authori[sz]ed pickup/i.test(message)) return { kind: 'not-authorised', message };
  return { kind: 'other', message };
}

export const PICKUP_CODE = /^\d{6}$/;

import { describe, expect, it } from 'vitest';
import { normaliseConfirmation, parseTransTime } from '../src/mpesa/daraja';
import { matchPaymentToJob, MatchCandidate } from '../src/mpesa/matching';
import { normalisePlate, plateDistance, platesMatch } from '../src/domain/plate';
import { fromShillings } from '../src/domain/money';

const CALLBACK = {
  TransactionType: 'Pay Bill',
  TransID: 'RKT1A2B3C4',
  TransTime: '20261014143005',
  TransAmount: 550,
  BusinessShortCode: '400200',
  BillRefNumber: 'KDA 123A',
  MSISDN: '254712345678',
  FirstName: 'AMINA'
};

describe('Daraja C2B confirmations', () => {
  it('converts the amount to whole cents, never a float', () => {
    const payment = normaliseConfirmation({ ...CALLBACK, TransAmount: 550.5 });
    expect(payment.amountCents).toBe(55050);
    expect(Number.isInteger(payment.amountCents)).toBe(true);
  });

  it('reads Nairobi local time as UTC correctly', () => {
    expect(parseTransTime('20261014143005').toISOString()).toBe('2026-10-14T11:30:05.000Z');
  });

  it('rejects a callback missing a transaction id', () => {
    expect(() => normaliseConfirmation({ ...CALLBACK, TransID: '' })).toThrow(/rejected/);
  });

  it('rejects a malformed timestamp rather than guessing', () => {
    expect(() => normaliseConfirmation({ ...CALLBACK, TransTime: 'yesterday' })).toThrow();
  });
});

describe('plate normalisation survives OCR confusion', () => {
  it('keeps letters intact so KDA does not become K0A', () => {
    expect(normalisePlate('KDA 123A')).toBe('KDA123A');
  });

  it('treats O and 0 as near-identical without destroying either', () => {
    expect(platesMatch('KDAO12B', 'KDA012B')).toBe(true);
    expect(plateDistance('KDAO12B', 'KDA012B')).toBeLessThan(1);
  });

  it('does not match two genuinely different plates', () => {
    expect(platesMatch('KDA123A', 'KBB987Z')).toBe(false);
  });

  it('strips spaces and punctuation', () => {
    expect(normalisePlate('KDA 123A')).toBe('KDA123A');
  });

  it('measures distance for fuzzy matching', () => {
    expect(plateDistance('KDA123A', 'KDA123A')).toBe(0);
    expect(plateDistance('KDA123A', 'KDA124A')).toBe(1);
  });
});

describe('matching a payment to a job', () => {
  const base: MatchCandidate = {
    jobId: 'job-1',
    quotedTotalCents: fromShillings(550),
    plateNormalised: 'KDA123A',
    createdAt: new Date('2026-10-14T11:00:00Z'),
    state: 'awaiting_payment'
  };

  const payment = {
    amountCents: fromShillings(550),
    reference: 'KDA 123A',
    receivedAt: new Date('2026-10-14T11:30:05Z')
  };

  it('matches on the till reference when it identifies one job', () => {
    const outcome = matchPaymentToJob(payment, [base]);
    expect(outcome.jobId).toBe('job-1');
    expect(outcome.confidence).toBe('exact_reference');
  });

  it('falls back to amount and time when there is no usable reference', () => {
    const outcome = matchPaymentToJob({ ...payment, reference: '' }, [base]);
    expect(outcome.confidence).toBe('amount_and_time');
  });

  it('refuses to guess when two open jobs share the amount', () => {
    const outcome = matchPaymentToJob({ ...payment, reference: '' }, [
      base,
      { ...base, jobId: 'job-2', plateNormalised: 'KBB999Z' }
    ]);

    expect(outcome.jobId).toBeNull();
    expect(outcome.reason).toMatch(/needs a human/);
  });

  it('does not match a job that closed long before the payment', () => {
    const outcome = matchPaymentToJob({ ...payment, reference: '' }, [
      { ...base, createdAt: new Date('2026-10-13T06:00:00Z') }
    ]);

    expect(outcome.jobId).toBeNull();
  });

  it('ignores jobs that are already paid', () => {
    const outcome = matchPaymentToJob(payment, [{ ...base, state: 'closed' }]);
    expect(outcome.jobId).toBeNull();
  });
});

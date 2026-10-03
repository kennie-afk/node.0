import { z } from 'zod';
import { Cents, fromShillings } from '../domain/money';
import { BadRequestError } from '../domain/errors';

export const c2bConfirmationSchema = z.object({
  TransactionType: z.string().optional(),
  TransID: z.string().min(1),
  TransTime: z.string().regex(/^\d{14}$/),
  TransAmount: z.coerce.number().positive(),
  BusinessShortCode: z.string().min(1),
  BillRefNumber: z.string().optional().default(''),
  MSISDN: z.string().min(1),
  FirstName: z.string().optional(),
  LastName: z.string().optional()
});

export type C2bConfirmation = z.infer<typeof c2bConfirmationSchema>;

export interface NormalisedPayment {
  externalRef: string;
  amountCents: Cents;
  payerMsisdn: string;
  receivedAt: Date;
  shortCode: string;
  reference: string;
}

export function parseTransTime(value: string): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(8, 10));
  const minute = Number(value.slice(10, 12));
  const second = Number(value.slice(12, 14));

  const at = new Date(Date.UTC(year, month - 1, day, hour - 3, minute, second));
  if (Number.isNaN(at.getTime())) {
    throw new BadRequestError('TransTime is not a valid timestamp');
  }
  return at;
}

export function normaliseConfirmation(raw: unknown): NormalisedPayment {
  const parsed = c2bConfirmationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestError(
      `Daraja callback rejected: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`
    );
  }

  const body = parsed.data;

  return {
    externalRef: body.TransID,
    amountCents: fromShillings(body.TransAmount),
    payerMsisdn: body.MSISDN,
    receivedAt: parseTransTime(body.TransTime),
    shortCode: body.BusinessShortCode,
    reference: body.BillRefNumber.trim()
  };
}

export const DARAJA_ACCEPTED = { ResultCode: 0, ResultDesc: 'Accepted' } as const;
export const DARAJA_REJECTED = { ResultCode: 1, ResultDesc: 'Rejected' } as const;

/**
 * M-Pesa: the public callbacks Safaricom calls, and the people's side (the unmatched queue and, where enabled, the simulator).
 *
 * The confirmation URL registered with Safaricom carries MPESA_CALLBACK_SECRET as a path segment. That is OUR authentication of
 * the caller, not something Daraja signs; no Daraja signature scheme is assumed. The secret is compared in constant time.
 */
import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt, queryString } from './helpers';
import { DARAJA_ACCEPTED, DARAJA_REJECTED } from '../mpesa/daraja';
import { assignPayment, assignSchema, ignorePayment, ingestConfirmation, listPaymentPage, paybillOf } from '../mpesa/service';
import { compareStatement, reconciliationReport, statementSchema } from '../mpesa/reconciliation';
import { BadRequestError, NotFoundError } from '../domain/errors';

const router = Router();

function secretMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(env.MPESA_CALLBACK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post('/mpesa/c2b/:secret/validation', (req, res) => {
  if (!secretMatches(String(req.params.secret))) return res.status(404).json({ code: 'not-found', message: 'No such route.' });
  // we never refuse a payment at validation time: an unknown reference is handled by the unmatched queue, not by turning money away
  res.json(DARAJA_ACCEPTED);
});

router.post('/mpesa/c2b/:secret/confirmation', async (req, res) => {
  if (!secretMatches(String(req.params.secret))) return res.status(404).json({ code: 'not-found', message: 'No such route.' });
  try {
    await ingestConfirmation(req.body);
    res.json(DARAJA_ACCEPTED);
  } catch (error) {
    // a callback we cannot read is logged and refused; a failure on our side returns 500 so Safaricom retries
    if (error instanceof BadRequestError) {
      logger.warn('unreadable M-Pesa callback', { message: error.message });
      return res.status(200).json(DARAJA_REJECTED);
    }
    logger.error('M-Pesa callback failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Try again' });
  }
});

router.get('/mpesa/payments', authenticate, requirePermission('recon'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listPaymentPage(client, {
    status: queryString(req.query.status), search: queryString(req.query.search), after: queryString(req.query.after), limit: Math.min(200, queryInt(req.query.limit, 50)) || 50
  })));
}));
router.get('/mpesa/reconciliation', authenticate, requirePermission('recon'), wrap(async (req, res) => {
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const to = queryString(req.query.to) ?? today;
  const from = queryString(req.query.from) ?? new Date(Date.parse(to) - 29 * 86_400_000).toISOString().slice(0, 10);
  res.json(await inOrg(req, (client) => reconciliationReport(client, from, to)));
}));
router.post('/mpesa/reconciliation/statement', authenticate, requirePermission('recon'), wrap(async (req, res) => {
  const body = parse(statementSchema, req.body);
  res.json(await inOrg(req, (client) => compareStatement(client, body)));
}));
router.post('/mpesa/payments/:id/assign', authenticate, requirePermission('recon'), requireWritable, wrap(async (req, res) => {
  const body = parse(assignSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => assignPayment(client, ctx, String(req.params.id), body)));
}));
router.post('/mpesa/payments/:id/ignore', authenticate, requirePermission('recon'), requireWritable, wrap(async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().min(3).max(300) }), req.body);
  res.json(await inOrg(req, (client, ctx) => ignorePayment(client, ctx, String(req.params.id), body.note)));
}));

/** Daraja's TransTime is local (EAT, UTC+3) as yyyymmddhhmmss. */
function darajaTime(at: Date): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

const simulateSchema = z.object({ billRef: z.string().max(40).default(''), amountCents: z.number().int().positive().max(1_000_000_000), msisdn: z.string().max(15).optional() });
router.post('/mpesa/simulate', authenticate, requirePermission('recon'), requireWritable, wrap(async (req, res) => {
  if (!env.MPESA_SIMULATOR) throw new NotFoundError('No route matches POST /v1/mpesa/simulate');
  const body = parse(simulateSchema, req.body);
  const shortcode = await inOrg(req, (client) => paybillOf(client, null));
  if (!shortcode) throw new BadRequestError('Set this organisation\'s M-Pesa paybill number first (Branches), then simulate a payment to it.');
  const outcome = await ingestConfirmation({
    TransactionType: 'Pay Bill', TransID: `SIM${randomBytes(5).toString('hex').toUpperCase()}`, TransTime: darajaTime(new Date()),
    TransAmount: body.amountCents / 100, BusinessShortCode: shortcode, BillRefNumber: body.billRef, MSISDN: body.msisdn ?? '254700000000', FirstName: 'Simulated'
  });
  res.status(201).json({ simulated: true, outcome });
}));

export default router;

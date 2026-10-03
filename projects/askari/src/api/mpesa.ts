/**
 * The public callbacks Safaricom calls, for Askari's own subscription payments only.
 *
 * The confirmation URL registered with Safaricom carries MPESA_CALLBACK_SECRET as a path segment. That is OUR authentication of
 * the caller, not something Daraja signs; no Daraja signature scheme is assumed. The secret is compared in constant time.
 */
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { DARAJA_ACCEPTED, DARAJA_REJECTED } from '../mpesa/daraja';
import { ingestConfirmation } from '../mpesa/service';
import { BadRequestError } from '../domain/errors';

const router = Router();

function secretMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(env.MPESA_CALLBACK_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post('/mpesa/c2b/:secret/validation', (req, res) => {
  if (!secretMatches(String(req.params.secret))) return res.status(404).json({ code: 'not-found', message: 'No such route.' });
  res.json(DARAJA_ACCEPTED);
});

router.post('/mpesa/c2b/:secret/confirmation', async (req, res) => {
  if (!secretMatches(String(req.params.secret))) return res.status(404).json({ code: 'not-found', message: 'No such route.' });
  try {
    await ingestConfirmation(req.body);
    res.json(DARAJA_ACCEPTED);
  } catch (error) {
    if (error instanceof BadRequestError) {
      logger.warn('unreadable M-Pesa callback', { message: error.message });
      return res.status(200).json(DARAJA_REJECTED);
    }
    logger.error('M-Pesa callback failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Try again' });
  }
});

export default router;

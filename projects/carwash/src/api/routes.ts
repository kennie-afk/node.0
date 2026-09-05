import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from './middleware';
import { closeDay } from '../reconciliation/service';
import { ingestConfirmation } from '../mpesa/service';
import { DARAJA_ACCEPTED, DARAJA_REJECTED } from '../mpesa/daraja';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { BadRequestError, ForbiddenError } from '../domain/errors';

const router = Router();

const closeSchema = z.object({
  siteId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

router.get('/me', authenticate, (req, res) => {
  res.status(200).json(req.principal);
});

router.post(
  '/sites/close',
  authenticate,
  requireRole('owner', 'manager', 'support'),
  async (req, res, next) => {
    try {
      const parsed = closeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('siteId must be a uuid and day must be YYYY-MM-DD');
      }

      const outcome = await closeDay(req.principal!.orgId, parsed.data.siteId, parsed.data.day);

      res.status(200).json({
        summary: outcome.report,
        vehiclesDetected: outcome.result.vehiclesDetected,
        jobsRecorded: outcome.result.jobsRecorded,
        expectedRevenueCents: outcome.result.expectedRevenue,
        receivedRevenueCents: outcome.result.receivedRevenue,
        gapCents: outcome.result.gap,
        discrepancies: outcome.result.discrepancies,
        discrepanciesWritten: outcome.discrepanciesWritten
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/webhooks/mpesa/confirmation', async (req, res) => {
  const secret = req.header('x-callback-secret');
  const remote = req.ip ?? '';

  if (env.MPESA_ALLOWED_IPS.length > 0 && !env.MPESA_ALLOWED_IPS.includes(remote)) {
    logger.warn('daraja callback from an unexpected address', { remote });
    return res.status(200).json(DARAJA_REJECTED);
  }

  if (secret !== env.MPESA_CALLBACK_SECRET) {
    logger.warn('daraja callback with a bad secret', { requestId: req.id });
    return res.status(200).json(DARAJA_REJECTED);
  }

  try {
    const outcome = await ingestConfirmation(req.body);
    logger.info('daraja callback accepted', {
      requestId: req.id,
      duplicate: outcome?.duplicate ?? null,
      matched: outcome?.matchedJobId ?? null
    });
    return res.status(200).json(DARAJA_ACCEPTED);
  } catch (error) {
    logger.error('daraja callback failed', {
      requestId: req.id,
      error: error instanceof Error ? error.message : String(error)
    });
    return res.status(200).json(DARAJA_REJECTED);
  }
});

router.post('/webhooks/mpesa/validation', (_req, res) => {
  res.status(200).json(DARAJA_ACCEPTED);
});

export default router;

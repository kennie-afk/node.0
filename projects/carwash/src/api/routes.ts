import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { withoutTenant } from '../persistence/pool';
import { authenticate, requireRole } from './middleware';
import { closeDay } from '../reconciliation/service';
import { ingestConfirmation } from '../mpesa/service';
import { DARAJA_ACCEPTED, DARAJA_REJECTED } from '../mpesa/daraja';
import { env } from '../config/env';
import { logger } from '../common/logger';
import { BadRequestError, UnauthorizedError } from '../domain/errors';

const router = Router();

const closeSchema = z.object({
  siteId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const loginSchema = z.object({
  phone: z.string().min(6).max(20),
  pin: z.string().min(4).max(64)
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('a phone number and a pin are required');
    }

    const row = await withoutTenant(async (client) => {
      const { rows } = await client.query(
        `SELECT id, org_id, site_id, role, display_name, pin_hash FROM resolve_login($1)`,
        [parsed.data.phone]
      );
      return rows[0];
    });

    const stored = row?.pin_hash ?? '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const matches = await bcrypt.compare(parsed.data.pin, stored);

    if (!row || !matches) {
      throw new UnauthorizedError('Those credentials are not valid.');
    }

    const token = jwt.sign(
      { sub: row.id, orgId: row.org_id, siteId: row.site_id, role: row.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_TTL_MINUTES * 60 }
    );

    res.status(200).json({
      token,
      displayName: row.display_name,
      role: row.role,
      expiresInSeconds: env.JWT_TTL_MINUTES * 60
    });
  } catch (error) {
    next(error);
  }
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

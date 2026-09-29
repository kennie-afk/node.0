import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
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

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  limit: env.LOGIN_RATE_LIMIT_PER_WINDOW,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : '';
    return `${ipKeyGenerator(req.ip ?? 'unknown')}|${phone}`;
  },
  message: { code: 'too-many-attempts', message: 'Too many sign in attempts. Try again shortly.' }
});

function secretMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) {
    return false;
  }
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

const closeSchema = z.object({
  siteId: z.string().uuid(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const loginSchema = z.object({
  phone: z.string().min(6).max(20),
  pin: z.string().min(4).max(64)
});

const signupSchema = z.object({
  businessName: z.string().min(2).max(200),
  contactName: z.string().min(2).max(200),
  phone: z.string().min(6).max(20),
  siteCount: z.number().int().min(1).max(500).optional(),
  notes: z.string().max(2000).optional()
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: { code: 'too-many-attempts', message: 'Too many requests. Try again later.' }
});

router.post('/auth/login', loginLimiter, async (req, res, next) => {
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

  if (!secretMatches(secret, env.MPESA_CALLBACK_SECRET)) {
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

router.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('businessName, contactName and phone are required');
    }

    const { businessName, contactName, phone, siteCount, notes } = parsed.data;

    const id = await withoutTenant(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO signup_requests (business_name, contact_name, phone, site_count, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [businessName, contactName, phone, siteCount ?? 1, notes ?? null]
      );
      const row = rows[0];
      if (!row) {
        throw new Error('signup insert returned no row');
      }
      return row.id;
    });

    logger.info('signup request received', { signupRequestId: id });

    res.status(201).json({ id, status: 'new' });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { BadRequestError } from '../domain/errors';
import { resendCode, startSignup, verifySignup } from '../signup/service';

const router = Router();

const startSchema = z.object({
  businessName: z.string().trim().min(2).max(200),
  contactName: z.string().trim().min(2).max(200),
  phone: z.string().min(6).max(20),
  kind: z.enum(['sacco', 'lender']).default('sacco'),
  expectedMembers: z.number().int().min(0).max(1_000_000).optional(),
  registrationNo: z.string().trim().max(60).optional(),
  sample: z.boolean().optional(),
  notes: z.string().max(2000).optional()
});
const verifySchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  pin: z.string().regex(/^\d{6}$/)
});
const resendSchema = z.object({ id: z.string().uuid() });

/**
 * Signup is reached through the console, so every caller arrives from the console's address and an IP limit would cap
 * signups for the whole product. The limits are per phone number (start) and per signup request (verify, resend), which is
 * what actually stops guessing codes or flooding one person's phone; the service enforces its own per-phone ceilings too.
 */
const keyed = (windowMs: number, limit: number, key: (body: Record<string, unknown>) => string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => key((req.body ?? {}) as Record<string, unknown>) || ipKeyGenerator(req.ip ?? 'unknown'),
    message: { code: 'too-many-attempts', message: 'Too many requests. Try again later.' }
  });

const phoneKey = (body: Record<string, unknown>) => {
  const raw = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '').slice(-9) : '';
  return raw ? `phone:${raw}` : '';
};
const idKey = (body: Record<string, unknown>) => (typeof body.id === 'string' ? `signup:${body.id}` : '');

const startLimiter = keyed(60 * 60 * 1000, 5, phoneKey);
const verifyLimiter = keyed(15 * 60 * 1000, 20, idKey);
const resendLimiter = keyed(60 * 60 * 1000, 10, idKey);

router.post('/signup', startLimiter, async (req, res, next) => {
  try {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('businessName, contactName, a phone number and whether this is a SACCO or a lender are required');
    }
    const started = await startSignup(parsed.data);
    res.status(201).json({ ...started, status: 'pending-verification' });
  } catch (error) {
    next(error);
  }
});

router.post('/signup/verify', verifyLimiter, async (req, res, next) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('id, a six-digit code and a six-digit PIN are required');
    }
    const result = await verifySignup(parsed.data.id, parsed.data.code, parsed.data.pin);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/signup/resend', resendLimiter, async (req, res, next) => {
  try {
    const parsed = resendSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('id is required');
    }
    res.status(200).json(await resendCode(parsed.data.id));
  } catch (error) {
    next(error);
  }
});

export default router;

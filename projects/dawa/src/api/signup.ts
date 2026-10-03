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
  branchCount: z.number().int().min(1).max(500).optional(),
  notes: z.string().max(2000).optional()
});
const verifySchema = z.object({
  id: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
  pin: z.string().regex(/^\d{6}$/)
});
const resendSchema = z.object({ id: z.string().uuid() });

const byIp = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? 'unknown'),
    message: { code: 'too-many-attempts', message: 'Too many requests. Try again later.' }
  });

const startLimiter = byIp(60 * 60 * 1000, 5);
const verifyLimiter = byIp(15 * 60 * 1000, 20);
const resendLimiter = byIp(60 * 60 * 1000, 10);

router.post('/signup', startLimiter, async (req, res, next) => {
  try {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('businessName, contactName and a phone number are required');
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

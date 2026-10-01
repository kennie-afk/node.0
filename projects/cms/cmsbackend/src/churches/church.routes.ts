import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { onboardChurch } from './church.controller';
import { validate } from '../middleware/validation.middleware';
import { onboardChurchSchema } from './church.schemas';
import { isTest } from '../config/env';
import { authenticateToken } from '../middleware/auth.middleware';
import { route, requestTx } from '../common/http';
import { currentTenant } from '../common/tenant-context';
import db from '@models';

const router = Router();

const onboardingLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest
});

/** The signed-in church's own details, for letterheads such as receipts. */
router.get('/me', authenticateToken, route(async () => {
  const church = await db.Church.findByPk(currentTenant().churchId, { attributes: ['name', 'slug', 'timezone'], transaction: await requestTx() });
  return church ? { name: church.name, slug: church.slug, timezone: church.timezone } : null;
}));

router.post('/', onboardingLimit, validate(onboardChurchSchema), onboardChurch);

export default router;

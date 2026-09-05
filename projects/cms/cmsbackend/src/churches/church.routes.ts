import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { onboardChurch } from './church.controller';
import { validate } from '../middleware/validation.middleware';
import { onboardChurchSchema } from './church.schemas';
import { isTest } from '../config/env';

const router = Router();

const onboardingLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest
});

router.post('/', onboardingLimit, validate(onboardChurchSchema), onboardChurch);

export default router;

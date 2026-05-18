import { Router } from 'express';
import { login, getProfile } from './auth.controller';
import { validate } from '../middleware/validation.middleware';
import { loginUserSchema } from './auth.schemas';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

router.get('/test', (req, res) => res.json({ message: 'Auth route works!' }));

router.post('/login', validate(loginUserSchema), login);
router.get('/profile', authenticateToken, getProfile);

export default router;
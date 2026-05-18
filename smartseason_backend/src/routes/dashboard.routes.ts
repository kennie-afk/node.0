import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getDashboard } from '../controllers/DashboardController';

const router = Router();

router.use(authenticate);
router.get('/', getDashboard);

export { router as dashboardRouter };
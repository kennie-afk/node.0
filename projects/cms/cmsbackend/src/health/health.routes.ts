import { Router } from 'express';
import db from '@models';

const router = Router();

router.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

router.get('/readyz', async (_req, res) => {
  try {
    await db.sequelize.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not-ready', reason: 'database unreachable' });
  }
});

export default router;

import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { requestTx, route } from '../../common/http';
import { currentTenant } from '../../common/tenant-context';
import { select } from '../finance/sql';
import type { RouteMount } from '../types';
import { overview } from './overview.service';

const router = Router();
router.use(authenticateToken);

/** "Today" as the congregation sees it, not as the server's UTC clock does. */
async function churchToday(churchId: number): Promise<string> {
  const row = (await select<any>(await requestTx(), 'SELECT timezone FROM churches WHERE id = ?', [churchId]))[0];
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: row?.timezone ?? 'Africa/Nairobi' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// No permission gate of its own: every signed-in person gets a dashboard, and the service leaves
// out each section the caller's permissions do not cover (a plain member gets an empty one).
router.get('/', route(async () => {
  const { churchId, permissions } = currentTenant();
  return overview(await requestTx(), churchId, await churchToday(churchId), permissions);
}));

export default [{ path: '/overview', router }] satisfies RouteMount[];

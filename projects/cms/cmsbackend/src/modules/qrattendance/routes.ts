import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, isoDate } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './qr.service';

const router = Router();
router.use(authenticateToken);
const pos = z.number().int().positive();

router.get('/members/:id', requirePermission('members:read'), route(async (req) => svc.cardFor(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/cards', requirePermission('members:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(200).default(60) }) }), req);
  return svc.cards(await requestTx(), me().churchId, query.after, query.limit);
}));
router.post('/scan', requirePermission('members:write'), route(async (req) => {
  const { body } = input(z.object({ body: z.object({ token: z.string().min(8).max(80), eventId: pos.nullish(), sermonId: pos.nullish(), date: isoDate.optional() }) }), req);
  return svc.scan(await requestTx(), me().churchId, body);
}));

const mounts: RouteMount[] = [{ path: '/attendance-qr', router }];
export default mounts;

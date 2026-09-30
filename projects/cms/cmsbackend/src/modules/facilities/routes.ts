import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, limitQuery } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './facilities.service';

const router = Router();
router.use(authenticateToken);
const tx = () => requestTx();
const when = z.coerce.date();

router.get('/resources', requirePermission('members:read'), route(async () => svc.listResources(await tx(), me().churchId)));
router.post('/resources', requirePermission('members:write'), route(async (req) => svc.createResource(await tx(), me().churchId, input(z.object({ body: z.object({ name: z.string().min(2).max(120), kind: z.enum(['ROOM', 'EQUIPMENT', 'VEHICLE']).optional(), capacity: z.number().int().positive().nullish(), requiresApproval: z.boolean().optional(), description: z.string().max(500).nullish() }) }), req).body), 201));
router.put('/resources/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(120).optional(), capacity: z.number().int().positive().nullish(), requiresApproval: z.boolean().optional(), description: z.string().max(500).nullish(), isActive: z.boolean().optional() }).strict() }), req);
  return svc.updateResource(await tx(), me().churchId, params.id, body);
}));
router.get('/resources/:id/availability', requirePermission('members:read'), route(async (req) => {
  const { params, query } = input(z.object({ params: idParam, query: z.object({ from: when, to: when }) }), req);
  return svc.availability(await tx(), me().churchId, params.id, query.from, query.to);
}));

router.get('/bookings', requirePermission('members:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ resourceId: z.coerce.number().int().positive().optional(), status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(), from: when.optional(), to: when.optional(), mine: z.enum(['true']).optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req);
  return svc.listBookings(await tx(), me().churchId, { ...query, mine: query.mine ? me().userId : undefined });
}));
router.post('/bookings', requirePermission('members:write'), route(async (req) => {
  const { body } = input(z.object({ body: z.object({ resourceId: z.number().int().positive(), title: z.string().min(2).max(200), startsAt: when, endsAt: when, notes: z.string().max(500).nullish(), recurrence: z.object({ freq: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']), interval: z.number().int().min(1).max(12).optional(), count: z.number().int().min(2).max(52) }).optional() }) }), req);
  const { churchId, userId, role } = me();
  return svc.createBooking(await tx(), churchId, userId, role, body);
}, 201));
router.get('/bookings/:id', requirePermission('members:read'), route(async (req) => svc.getBooking(await tx(), me().churchId, input(idOnly, req).params.id)));
router.post('/bookings/:id/approve', requirePermission('users:manage'), route(async (req) => svc.decide(await tx(), me().churchId, me().userId, input(idOnly, req).params.id, true)));
router.post('/bookings/:id/reject', requirePermission('users:manage'), route(async (req) => svc.decide(await tx(), me().churchId, me().userId, input(idOnly, req).params.id, false)));
router.post('/bookings/:id/cancel', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ scope: z.enum(['ONE', 'SERIES']).default('ONE') }).default({ scope: 'ONE' }) }), req);
  const { churchId, userId, role } = me();
  return svc.cancel(await tx(), churchId, userId, role, params.id, body.scope);
}));

const mounts: RouteMount[] = [{ path: '/facilities', router }];
export default mounts;

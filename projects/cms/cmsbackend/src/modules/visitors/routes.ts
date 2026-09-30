import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, isoDate, limitQuery } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './visitors.service';

const router = Router();
router.use(authenticateToken);
const tx = () => requestTx();
const pos = z.number().int().positive();

router.get('/pipeline', requirePermission('members:read'), route(async () => svc.pipeline(await tx(), me().churchId)));
router.get('/tasks', requirePermission('members:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ assigneeMemberId: z.coerce.number().int().positive().optional(), within: z.coerce.number().int().min(0).max(90).default(0) }) }), req);
  return svc.dueTasks(await tx(), me().churchId, query);
}));
router.post('/tasks/:id/complete', requirePermission('members:write'), route(async (req) => svc.completeTask(await tx(), me().churchId, input(idOnly, req).params.id)));

router.get('/', requirePermission('members:read'), route(async (req) => svc.listVisitors(await tx(), me().churchId, input(z.object({ query: z.object({ stage: z.enum(svc.STAGES).optional(), status: z.enum(['OPEN', 'CONVERTED', 'CLOSED']).optional(), assignedMemberId: z.coerce.number().int().positive().optional(), q: z.string().max(60).optional(), overdue: z.enum(['true']).transform(() => true).optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req).query)));
router.post('/', requirePermission('members:write'), route(async (req) => svc.createVisitor(await tx(), me().churchId, me().userId, input(z.object({ body: z.object({ firstName: z.string().min(1).max(100), lastName: z.string().min(1).max(100), phone: z.string().max(30).nullish(), email: z.string().email().max(100).nullish(), firstVisitDate: isoDate.optional(), source: z.string().max(60).nullish(), notes: z.string().max(1000).nullish(), assignedMemberId: pos.nullish(), autoTask: z.boolean().optional() }) }), req).body), 201));
router.get('/:id', requirePermission('members:read'), route(async (req) => svc.getVisitor(await tx(), me().churchId, input(idOnly, req).params.id)));
router.put('/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ firstName: z.string().min(1).max(100).optional(), lastName: z.string().min(1).max(100).optional(), phone: z.string().max(30).nullish(), email: z.string().email().nullish(), source: z.string().max(60).nullish(), notes: z.string().max(1000).nullish(), assignedMemberId: pos.nullish() }).strict() }), req);
  return svc.updateVisitor(await tx(), me().churchId, params.id, body);
}));
router.post('/:id/stage', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ stage: z.enum(svc.STAGES), note: z.string().max(300).nullish() }) }), req);
  return svc.moveStage(await tx(), me().churchId, me().userId, params.id, body.stage, body.note);
}));
router.post('/:id/interactions', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ type: z.enum(['CALL', 'SMS', 'VISIT', 'EMAIL']), summary: z.string().min(2).max(500) }) }), req);
  return svc.addInteraction(await tx(), me().churchId, me().userId, params.id, body);
}, 201));
router.post('/:id/tasks', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ title: z.string().min(2).max(200), dueDate: isoDate, assigneeMemberId: pos.nullish() }) }), req);
  return svc.addTask(await tx(), me().churchId, me().userId, params.id, body);
}, 201));
router.post('/:id/convert', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ linkExistingMemberId: pos.nullish() }).default({}) }), req);
  return svc.convert(await tx(), me().churchId, me().userId, params.id, body);
}, 201));

const mounts: RouteMount[] = [{ path: '/visitors', router }];
export default mounts;

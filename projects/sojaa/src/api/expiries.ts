import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { need } from '../common/context';
import { wrap } from '../common/context';
import { inOrg, paging, parse, queryInt } from './helpers';
import { addEquipment, addTraining, dispatchOutbox, equipmentSchema, expiries, listOutbox, queueExpiryAlerts, returnEquipment, trainingSchema } from '../ops/expiries';

const router = Router();
const guarded = [authenticate, requireWritable] as const;

router.get('/expiries', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const days = Math.min(365, queryInt(req.query.days, 30));
  res.json(await inOrg(req, (c, ctx) => expiries(c, ctx, { days, ...paging(req, 100, 25) })));
}));
router.post('/guards/:id/training', ...guarded, wrap(async (req, res) => {
  const body = parse(trainingSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => addTraining(c, ctx, String(req.params.id), body)));
}));
router.post('/guards/:id/equipment', ...guarded, wrap(async (req, res) => {
  const body = parse(equipmentSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => addEquipment(c, ctx, String(req.params.id), body)));
}));
router.post('/equipment/:id/return', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ returnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  res.json(await inOrg(req, (c, ctx) => returnEquipment(c, ctx, String(req.params.id), body.returnedOn)));
}));
router.post('/notifications/expiry-alerts', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ days: z.number().int().min(0).max(365).default(30), send: z.boolean().default(true) }), req.body ?? {});
  res.status(201).json(await inOrg(req, async (c, ctx) => {
    const queued = await queueExpiryAlerts(c, ctx, body.days);
    return { ...queued, dispatch: body.send ? await dispatchOutbox(c, ctx.orgId) : null };
  }));
}));
router.get('/notifications', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (c, ctx) => { need(ctx, 'guards_write'); return listOutbox(c, paging(req)); }));
}));

export default router;

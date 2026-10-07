import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, paging, parse, queryString } from './helpers';
import { cancelLeave, decideLeave, decisionSchema, getLeave, leaveBalance, leaveSchema, listLeave, requestLeave } from '../ops/leave';

const router = Router();
const guarded = [authenticate, requireWritable] as const;
const id = (req: { params: Record<string, string | string[]> }) => String(req.params.id);

router.get('/leave', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listLeave(c, ctx, { status: queryString(req.query.status), guardId: queryString(req.query.guardId), from: queryString(req.query.from), to: queryString(req.query.to), ...paging(req) })));
}));
router.post('/leave', ...guarded, wrap(async (req, res) => {
  const body = parse(leaveSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => requestLeave(c, ctx, body)));
}));
router.get('/leave/balance/:guardId', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  res.json(await inOrg(req, (c, ctx) => leaveBalance(c, ctx, String(req.params.guardId), year)));
}));
router.get('/leave/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getLeave(c, ctx, id(req))));
}));
router.post('/leave/:id/decision', ...guarded, wrap(async (req, res) => {
  const body = parse(decisionSchema, req.body);
  res.json(await inOrg(req, (c, ctx) => decideLeave(c, ctx, id(req), body)));
}));
router.post('/leave/:id/cancel', ...guarded, wrap(async (req, res) => {
  parse(z.object({}).passthrough(), req.body ?? {});
  res.json(await inOrg(req, (c, ctx) => cancelLeave(c, ctx, id(req))));
}));

export default router;

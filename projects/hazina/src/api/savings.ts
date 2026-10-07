import { Router } from 'express';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt, queryString } from './helpers';
import { decideWithdrawal, decisionSchema, depositSchema, listSavings, postDeposit, requestWithdrawal, withdrawSchema } from '../savings/service';

const router = Router();

router.post('/savings/deposit', authenticate, requirePermission('savings_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(depositSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => postDeposit(client, ctx, body)));
}));

router.post('/savings/withdraw', authenticate, requirePermission('savings_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(withdrawSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => requestWithdrawal(client, ctx, body)));
}));

router.get('/savings', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listSavings(client, { memberId: queryString(req.query.memberId), status: queryString(req.query.status), search: queryString(req.query.search), after: queryString(req.query.after), limit: Math.min(200, queryInt(req.query.limit, 50)) || 50 })));
}));

router.post('/savings/:id/decision', authenticate, requirePermission('withdraw_approve'), requireWritable, wrap(async (req, res) => {
  const body = parse(decisionSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => decideWithdrawal(client, ctx, String(req.params.id), body)));
}));

export default router;

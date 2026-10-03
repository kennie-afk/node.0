import { Router } from 'express';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt, queryString } from './helpers';
import { createMember, listMembers, memberPatchSchema, memberProfile, memberSchema, updateMember } from '../members/service';
import { importMembers, importSchema } from '../onboarding/service';
import { PRODUCT_ACCOUNT, SavingsProduct, savingsStatement } from '../savings/service';
import { BadRequestError } from '../domain/errors';

const router = Router();

router.get('/members', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const status = queryString(req.query.status);
  res.json(await inOrg(req, (client) => listMembers(client, {
    search: queryString(req.query.search), status: status === 'active' || status === 'dormant' || status === 'exited' ? status : undefined,
    limit: Math.min(100, queryInt(req.query.limit, 25)) || 25, after: queryString(req.query.after)
  })));
}));

router.post('/members', authenticate, requirePermission('members_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(memberSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createMember(client, ctx, body)));
}));

router.post('/members/import', authenticate, requirePermission('members_write'), requirePermission('journal_post'), requireWritable, wrap(async (req, res) => {
  const body = parse(importSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => importMembers(client, ctx, body)));
}));

router.get('/members/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => memberProfile(client, String(req.params.id))));
}));

router.patch('/members/:id', authenticate, requirePermission('members_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(memberPatchSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => updateMember(client, ctx, String(req.params.id), body)));
}));

router.get('/members/:id/savings-statement', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const product = queryString(req.query.product) ?? 'savings';
  if (!(product in PRODUCT_ACCOUNT)) throw new BadRequestError('product is savings, shares or deposits');
  res.json(await inOrg(req, (client) => savingsStatement(client, String(req.params.id), product as SavingsProduct)));
}));

export default router;

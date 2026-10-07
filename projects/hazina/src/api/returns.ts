import { Router } from 'express';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt, queryString } from './helpers';
import { addTemplate, generateReturn, generateSchema, getReturn, listReturns, listTemplates, templateSchema } from '../returns/service';

const router = Router();

router.get('/returns/templates', authenticate, requirePermission('returns'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listTemplates(client)));
}));
router.post('/returns/templates', authenticate, requirePermission('returns'), requirePermission('settings'), requireWritable, wrap(async (req, res) => {
  const body = parse(templateSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => addTemplate(client, ctx, body)));
}));
router.post('/returns', authenticate, requirePermission('returns'), requireWritable, wrap(async (req, res) => {
  const body = parse(generateSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => generateReturn(client, ctx, body)));
}));
router.get('/returns', authenticate, requirePermission('returns'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listReturns(client, { limit: Math.min(100, queryInt(req.query.limit, 25)) || 25, after: queryString(req.query.after) })));
}));
router.get('/returns/:id', authenticate, requirePermission('returns'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => getReturn(client, String(req.params.id))));
}));

export default router;

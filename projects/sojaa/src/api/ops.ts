/** Guards, clients, sites, posts, checkpoints and rates. */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, paging, parse, queryBool, queryString } from './helpers';
import { createGuard, exitGuard, getGuard, guardPatchSchema, guardSchema, listGuards, paySchema, reinstateGuard, resetGuardPin, setPay, updateGuard } from '../ops/guards';
import {
  addRate, clientSchema, createCheckpoint, createClient, createPost, createSite, getClient, getPortalToken, getSite, listCheckpoints, listClients, listPosts, listRates, listSites, postSchema, rateSchema,
  rotateCheckpoint, setCheckpointActive, setPortal, siteSchema, updateClient, updatePost, updateSite, listAllPosts
} from '../ops/sites';

const router = Router();
const guarded = [authenticate, requireWritable] as const;
const id = (req: { params: Record<string, string | string[]> }) => String(req.params.id);

// ---- guards ----
router.get('/guards', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const p = paging(req);
  res.json(await inOrg(req, (c, ctx) => listGuards(c, ctx, { q: queryString(req.query.q), status: queryString(req.query.status), branchId: queryString(req.query.branchId), ...p })));
}));
router.post('/guards', ...guarded, wrap(async (req, res) => {
  const body = parse(guardSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createGuard(c, ctx, body)));
}));
router.get('/guards/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getGuard(c, ctx, id(req))));
}));
router.patch('/guards/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(guardPatchSchema, req.body);
  res.json(await inOrg(req, (c, ctx) => updateGuard(c, ctx, id(req), body)));
}));
router.put('/guards/:id/pay', ...guarded, wrap(async (req, res) => {
  const body = parse(paySchema, req.body);
  res.json(await inOrg(req, (c, ctx) => setPay(c, ctx, id(req), body)));
}));
router.post('/guards/:id/pin', ...guarded, wrap(async (req, res) => {
  res.json({ ...(await inOrg(req, (c, ctx) => resetGuardPin(c, ctx, id(req)))), shownOnce: true });
}));
router.post('/guards/:id/exit', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ exitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
  res.json(await inOrg(req, (c, ctx) => exitGuard(c, ctx, id(req), body.exitedOn)));
}));
router.post('/guards/:id/reinstate', ...guarded, wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => reinstateGuard(c, ctx, id(req))));
}));

// ---- clients ----
router.get('/clients', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listClients(c, { q: queryString(req.query.q), ...paging(req) })));
}));
router.post('/clients', ...guarded, wrap(async (req, res) => {
  const body = parse(clientSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createClient(c, ctx, body)));
}));
router.get('/clients/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getClient(c, ctx, id(req))));
}));
router.patch('/clients/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(clientSchema.partial().extend({ status: z.enum(['active', 'ended']).optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => updateClient(c, ctx, id(req), body)));
}));
router.get('/clients/:id/portal', authenticate, requirePermission('clients_write'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getPortalToken(c, ctx, id(req))));
}));
router.put('/clients/:id/portal', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ enabled: z.boolean() }), req.body);
  res.json(await inOrg(req, (c, ctx) => setPortal(c, ctx, id(req), body.enabled)));
}));

router.get('/posts', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listAllPosts(c, ctx, { q: queryString(req.query.q), siteId: queryString(req.query.siteId), ...paging(req, 200, 100) })));
}));

// ---- sites ----
router.get('/sites', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listSites(c, ctx, { q: queryString(req.query.q), clientId: queryString(req.query.clientId), active: queryBool(req.query.active), ...paging(req) })));
}));
router.post('/sites', ...guarded, wrap(async (req, res) => {
  const body = parse(siteSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createSite(c, ctx, body)));
}));
router.get('/sites/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (c, ctx) => ({ ...(await getSite(c, ctx, id(req))), posts: await listPosts(c, id(req)) })));
}));
router.patch('/sites/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(siteSchema.omit({ clientId: true, branchId: true, postName: true }).partial().extend({ active: z.boolean().optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => updateSite(c, ctx, id(req), body)));
}));
router.post('/sites/:id/posts', ...guarded, wrap(async (req, res) => {
  const body = parse(postSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createPost(c, ctx, id(req), body)));
}));
router.patch('/posts/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(120).optional(), guardsRequired: z.number().int().min(1).max(50).optional(), active: z.boolean().optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => updatePost(c, ctx, id(req), body)));
}));
router.get('/sites/:id/checkpoints', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listCheckpoints(c, ctx, id(req))));
}));
router.post('/sites/:id/checkpoints', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(80) }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createCheckpoint(c, ctx, id(req), body.name)));
}));
router.post('/checkpoints/:id/rotate', ...guarded, wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => rotateCheckpoint(c, ctx, id(req))));
}));
router.patch('/checkpoints/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  res.json(await inOrg(req, (c, ctx) => setCheckpointActive(c, ctx, id(req), body.active)));
}));
router.get('/sites/:id/rates', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listRates(c, ctx, id(req))));
}));
router.post('/sites/:id/rates', ...guarded, wrap(async (req, res) => {
  const body = parse(rateSchema, req.body);
  res.status(201).json({ id: await inOrg(req, (c, ctx) => addRate(c, ctx, id(req), body)) });
}));

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, limitQuery } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './comms.service';

const router = Router();
router.use(authenticateToken);

const channel = z.enum(['SMS', 'EMAIL']);
const definition = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ALL'), statuses: z.array(z.string()).optional() }),
  z.object({ type: z.literal('MINISTRY'), ministryId: z.number().int().positive(), statuses: z.array(z.string()).optional() }),
  z.object({ type: z.literal('SMALL_GROUP'), smallGroupId: z.number().int().positive(), statuses: z.array(z.string()).optional() }),
  z.object({ type: z.literal('FILTER'), statuses: z.array(z.string()).optional(), gender: z.enum(['Male', 'Female', 'Other']).optional(), city: z.string().max(100).optional(), county: z.string().max(100).optional() })
]);

const tx = () => requestTx();

router.get('/templates', requirePermission('comms:send'), route(async () => svc.listTemplates(await tx(), me().churchId)));
router.post('/templates', requirePermission('comms:send'), route(async (req) => svc.createTemplate(await tx(), me().churchId, input(z.object({ body: z.object({ name: z.string().min(2).max(120), channel, subject: z.string().max(200).nullish(), body: z.string().min(1).max(1600) }) }), req).body), 201));
router.put('/templates/:id', requirePermission('comms:send'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(120).optional(), subject: z.string().max(200).nullish(), body: z.string().min(1).max(1600).optional(), isActive: z.boolean().optional() }).strict() }), req);
  return svc.updateTemplate(await tx(), me().churchId, params.id, body);
}));
router.delete('/templates/:id', requirePermission('comms:send'), route(async (req) => { await svc.deleteTemplate(await tx(), me().churchId, input(idOnly, req).params.id); return undefined; }, 204));

router.get('/segments', requirePermission('comms:send'), route(async () => svc.listSegments(await tx(), me().churchId)));
router.post('/segments', requirePermission('comms:send'), route(async (req) => svc.createSegment(await tx(), me().churchId, me().userId, input(z.object({ body: z.object({ name: z.string().min(2).max(120), definition }) }), req).body), 201));
router.put('/segments/:id', requirePermission('comms:send'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(120).optional(), definition: definition.optional() }).strict() }), req);
  return svc.updateSegment(await tx(), me().churchId, params.id, body);
}));
router.delete('/segments/:id', requirePermission('comms:send'), route(async (req) => { await svc.deleteSegment(await tx(), me().churchId, input(idOnly, req).params.id); return undefined; }, 204));
router.get('/segments/:id/preview', requirePermission('comms:send'), route(async (req) => {
  const { params, query } = input(z.object({ params: idParam, query: z.object({ channel: channel.default('SMS') }) }), req);
  return svc.previewSegment(await tx(), me().churchId, params.id, query.channel);
}));

router.get('/campaigns', requirePermission('comms:send'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ limit: limitQuery, cursor: z.string().max(200).optional() }) }), req);
  return svc.listCampaigns(await tx(), me().churchId, query.limit, query.cursor);
}));
router.post('/campaigns', requirePermission('comms:send'), route(async (req) => {
  const { body } = input(z.object({ body: z.object({ name: z.string().min(2).max(150), channel, purpose: z.enum(['COMMUNICATIONS', 'ANNOUNCEMENTS']).optional(), templateId: z.number().int().positive().nullish(), subject: z.string().max(200).nullish(), body: z.string().min(1).max(1600).optional(), segmentId: z.number().int().positive(), scheduledAt: z.coerce.date().nullish() }) }), req);
  return svc.createCampaign(await tx(), me().churchId, me().userId, body);
}, 201));
router.get('/campaigns/:id', requirePermission('comms:send'), route(async (req) => svc.campaignDetail(await tx(), me().churchId, input(idOnly, req).params.id)));
router.post('/campaigns/:id/send', requirePermission('comms:send'), route(async (req) => svc.sendCampaign(await tx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/campaigns/:id/cancel', requirePermission('comms:send'), route(async (req) => svc.cancelCampaign(await tx(), me().churchId, input(idOnly, req).params.id)));

router.get('/outbox', requirePermission('comms:send'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED']).optional(), campaignId: z.coerce.number().int().positive().optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req);
  return svc.listOutbox(await tx(), me().churchId, query);
}));
// Drains this church's queue now. The background worker calls processOutboxAllChurches on a timer.
router.post('/outbox/process', requirePermission('users:manage'), route(async () => svc.processOutbox(await tx(), me().churchId, 100)));

const mounts: RouteMount[] = [{ path: '/comms', router }];
export default mounts;

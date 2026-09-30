import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, isoDate, limitQuery } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './care.service';

const router = Router();
router.use(authenticateToken);
const tx = () => requestTx();
const pos = z.number().int().positive();
const viewer = () => { const m = me(); return { churchId: m.churchId, userId: m.userId, role: m.role }; };
const kinds = z.enum(['PASTORAL', 'COUNSELING', 'HOSPITAL', 'BEREAVEMENT', 'OTHER']);
const page = { limit: limitQuery, cursor: z.string().max(200).optional() };

router.get('/notes', requirePermission('care:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ memberId: z.coerce.number().int().positive(), ...page }) }), req);
  return svc.listNotes(await tx(), viewer(), query);
}));
router.post('/notes', requirePermission('care:write'), route(async (req) => svc.createNote(await tx(), viewer(), input(z.object({ body: z.object({ memberId: pos, kind: kinds.optional(), body: z.string().min(2).max(10000), isConfidential: z.boolean().optional(), occurredOn: isoDate.optional(), followUpOn: isoDate.nullish() }) }), req).body), 201));
router.get('/notes/:id', requirePermission('care:read'), route(async (req) => svc.getNote(await tx(), viewer(), input(idOnly, req).params.id)));
router.put('/notes/:id', requirePermission('care:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ body: z.string().min(2).max(10000).optional(), kind: kinds.optional(), isConfidential: z.boolean().optional(), followUpOn: isoDate.nullish(), followUpDone: z.boolean().optional() }).strict() }), req);
  return svc.updateNote(await tx(), viewer(), params.id, body);
}));
router.delete('/notes/:id', requirePermission('care:write'), route(async (req) => { await svc.deleteNote(await tx(), viewer(), input(idOnly, req).params.id); return undefined; }, 204));

router.get('/prayer-requests', requirePermission('care:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(), ...page }) }), req);
  return svc.listPrayerRequests(await tx(), me().churchId, query);
}));
router.post('/prayer-requests', requirePermission('care:write'), route(async (req) => svc.createPrayerRequest(await tx(), me().churchId, me().userId, input(z.object({ body: z.object({ memberId: pos.nullish(), requesterName: z.string().max(150).nullish(), body: z.string().min(2).max(2000), isPrivate: z.boolean().optional() }) }), req).body), 201));
router.put('/prayer-requests/:id', requirePermission('care:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ status: z.enum(['OPEN', 'ANSWERED', 'CLOSED']).optional(), answeredNote: z.string().max(500).nullish() }).strict() }), req);
  return svc.updatePrayerRequest(await tx(), me().churchId, params.id, body);
}));

router.get('/visitations', requirePermission('care:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ memberId: z.coerce.number().int().positive(), ...page }) }), req);
  return svc.listVisitations(await tx(), me().churchId, query);
}));
router.post('/visitations', requirePermission('care:write'), route(async (req) => svc.logVisitation(await tx(), viewer(), input(z.object({ body: z.object({ memberId: pos, visitDate: isoDate.optional(), kind: z.enum(['HOME', 'HOSPITAL', 'PRISON', 'OTHER']).optional(), summary: z.string().min(2).max(1000), followUpOn: isoDate.nullish() }) }), req).body), 201));
router.post('/visitations/:id/follow-up-done', requirePermission('care:write'), route(async (req) => svc.completeVisitationFollowUp(await tx(), me().churchId, input(idOnly, req).params.id)));

router.get('/followups', requirePermission('care:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ within: z.coerce.number().int().min(0).max(90).default(7) }) }), req);
  return svc.followUps(await tx(), viewer(), query.within);
}));

const mounts: RouteMount[] = [{ path: '/care', router }];
export default mounts;

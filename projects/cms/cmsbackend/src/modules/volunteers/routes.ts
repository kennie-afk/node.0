import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, isoDate, limitQuery } from '../finance/schemas';
import { linkedMemberId, me } from '../ops-kit';
import { can } from '../../auth/permissions';
import { ForbiddenError } from '../../utils/errors';
import type { RouteMount } from '../types';
import * as svc from './volunteers.service';

const router = Router();
router.use(authenticateToken);
const tx = () => requestTx();
const pos = z.number().int().positive();

router.get('/teams', requirePermission('members:read'), route(async () => svc.listTeams(await tx(), me().churchId)));
router.post('/teams', requirePermission('members:write'), route(async (req) => svc.createTeam(await tx(), me().churchId, input(z.object({ body: z.object({ name: z.string().min(2).max(120), description: z.string().max(500).nullish(), ministryId: pos.nullish() }) }), req).body), 201));
router.put('/teams/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(120).optional(), description: z.string().max(500).nullish(), isActive: z.boolean().optional() }).strict() }), req);
  return svc.updateTeam(await tx(), me().churchId, params.id, body);
}));
router.get('/teams/:id/roles', requirePermission('members:read'), route(async (req) => svc.listRoles(await tx(), me().churchId, input(idOnly, req).params.id)));
router.post('/teams/:id/roles', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(120) }) }), req);
  return svc.addRole(await tx(), me().churchId, params.id, body.name);
}, 201));
router.get('/teams/:id/members', requirePermission('members:read'), route(async (req) => svc.listTeamMembers(await tx(), me().churchId, input(idOnly, req).params.id)));
router.post('/teams/:id/members', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ memberId: pos, roleId: pos.nullish() }) }), req);
  return svc.addTeamMember(await tx(), me().churchId, params.id, body.memberId, body.roleId);
}, 201));
router.delete('/team-members/:id', requirePermission('members:write'), route(async (req) => { await svc.removeTeamMember(await tx(), me().churchId, input(idOnly, req).params.id); return undefined; }, 204));

// Unavailability: a volunteer manages their own; managers manage anyone's.
router.get('/unavailability', route(async (req) => {
  const { query } = input(z.object({ query: z.object({ memberId: z.coerce.number().int().positive().optional() }) }), req);
  const t = await tx();
  const { churchId, userId, role } = me();
  const own = await linkedMemberId(t, churchId, userId);
  const memberId = query.memberId ?? own;
  if (!memberId) return [];
  if (memberId !== own && !can(role, 'members:read')) return [];
  return svc.listUnavailability(t, churchId, memberId);
}));
router.post('/unavailability', route(async (req) => {
  const { body } = input(z.object({ body: z.object({ memberId: pos.optional(), fromDate: isoDate, toDate: isoDate, reason: z.string().max(200).nullish() }) }), req);
  const t = await tx();
  const { churchId, userId, role } = me();
  const own = await linkedMemberId(t, churchId, userId);
  const memberId = body.memberId ?? own;
  if (!memberId) throw new ForbiddenError('link your account to a member first');
  if (memberId !== own && !can(role, 'members:write')) throw new ForbiddenError('you can only mark your own unavailability');
  return svc.addUnavailability(t, churchId, { ...body, memberId });
}, 201));
router.delete('/unavailability/:id', route(async (req) => {
  const t = await tx();
  const { churchId, userId, role } = me();
  await svc.removeUnavailability(t, churchId, input(idOnly, req).params.id, await linkedMemberId(t, churchId, userId), can(role, 'members:write'));
  return undefined;
}, 204));

router.get('/rosters', requirePermission('members:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ eventId: z.coerce.number().int().positive().optional(), teamId: z.coerce.number().int().positive().optional(), memberId: z.coerce.number().int().positive().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req);
  return svc.listAssignments(await tx(), me().churchId, query);
}));
router.post('/rosters', requirePermission('members:write'), route(async (req) => svc.assign(await tx(), me().churchId, me().userId, input(z.object({ body: z.object({ eventId: pos, teamId: pos, roleId: pos.nullish(), memberId: pos }) }), req).body), 201));
router.post('/rosters/:id/respond', route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ status: z.enum(['CONFIRMED', 'DECLINED']) }) }), req);
  const { churchId, userId, role } = me();
  return svc.respond(await tx(), churchId, userId, role, params.id, body.status);
}));
router.delete('/rosters/:id', requirePermission('members:write'), route(async (req) => { await svc.removeAssignment(await tx(), me().churchId, input(idOnly, req).params.id); return undefined; }, 204));

router.get('/swaps', requirePermission('members:read'), route(async (req) => svc.listSwaps(await tx(), me().churchId, typeof req.query.status === 'string' ? req.query.status : undefined)));
router.post('/swaps', route(async (req) => {
  const { body } = input(z.object({ body: z.object({ assignmentId: pos, toMemberId: pos.nullish(), reason: z.string().max(300).nullish() }) }), req);
  const { churchId, userId, role } = me();
  return svc.requestSwap(await tx(), churchId, userId, role, body);
}, 201));
router.post('/swaps/:id/approve', requirePermission('members:write'), route(async (req) => svc.decideSwap(await tx(), me().churchId, me().userId, input(idOnly, req).params.id, true)));
router.post('/swaps/:id/reject', requirePermission('members:write'), route(async (req) => svc.decideSwap(await tx(), me().churchId, me().userId, input(idOnly, req).params.id, false)));
router.post('/swaps/:id/cancel', route(async (req) => { const { churchId, userId, role } = me(); return svc.cancelSwap(await tx(), churchId, userId, role, input(idOnly, req).params.id); }));

router.get('/reminders', requirePermission('members:read'), route(async (req) => {
  const { query } = input(z.object({ query: z.object({ hours: z.coerce.number().int().min(1).max(720).default(72) }) }), req);
  return svc.reminders(await tx(), me().churchId, query.hours);
}));

const mounts: RouteMount[] = [{ path: '/volunteers', router }];
export default mounts;

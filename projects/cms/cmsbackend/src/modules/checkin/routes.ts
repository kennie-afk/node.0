import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam, isoDate, limitQuery } from '../finance/schemas';
import { me } from '../ops-kit';
import type { RouteMount } from '../types';
import * as svc from './checkin.service';

const router = Router();
router.use(authenticateToken);
const tx = () => requestTx();
const pos = z.number().int().positive();
const guardian = z.object({ name: z.string().min(2).max(150), phone: z.string().max(30).nullish(), relationship: z.string().max(40).optional(), memberId: pos.nullish(), isAuthorizedPickup: z.boolean().optional() });

router.get('/rooms', requirePermission('members:read'), route(async () => svc.listRooms(await tx(), me().churchId)));
router.post('/rooms', requirePermission('members:write'), route(async (req) => svc.createRoom(await tx(), me().churchId, input(z.object({ body: z.object({ name: z.string().min(2).max(100), minAgeMonths: z.number().int().min(0).default(0), maxAgeMonths: z.number().int().min(0), capacity: pos }) }), req).body), 201));
router.put('/rooms/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ name: z.string().min(2).max(100).optional(), capacity: pos.optional(), isActive: z.boolean().optional(), minAgeMonths: z.number().int().min(0).optional(), maxAgeMonths: z.number().int().min(0).optional() }).strict() }), req);
  return svc.updateRoom(await tx(), me().churchId, params.id, body);
}));

router.get('/children', requirePermission('members:read'), route(async (req) => svc.listChildren(await tx(), me().churchId, input(z.object({ query: z.object({ q: z.string().max(60).optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req).query)));
router.post('/children', requirePermission('members:write'), route(async (req) => svc.createChild(await tx(), me().churchId, input(z.object({ body: z.object({ memberId: pos.nullish(), firstName: z.string().min(1).max(100), lastName: z.string().min(1).max(100), dateOfBirth: isoDate, allergies: z.string().max(300).nullish(), medicalNotes: z.string().max(500).nullish(), photoConsent: z.boolean().optional(), guardians: z.array(guardian).max(10).optional() }) }), req).body), 201));
router.get('/children/:id', requirePermission('members:read'), route(async (req) => svc.getChild(await tx(), me().churchId, input(idOnly, req).params.id)));
router.put('/children/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ firstName: z.string().min(1).max(100).optional(), lastName: z.string().min(1).max(100).optional(), allergies: z.string().max(300).nullish(), medicalNotes: z.string().max(500).nullish(), photoConsent: z.boolean().optional(), isActive: z.boolean().optional() }).strict() }), req);
  return svc.updateChild(await tx(), me().churchId, params.id, body);
}));
router.post('/children/:id/guardians', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: guardian }), req);
  return svc.addGuardian(await tx(), me().churchId, params.id, body);
}, 201));
router.put('/guardians/:id', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: guardian.partial().omit({ memberId: true }).strict() }), req);
  return svc.updateGuardian(await tx(), me().churchId, params.id, body);
}));
router.delete('/guardians/:id', requirePermission('members:write'), route(async (req) => { await svc.removeGuardian(await tx(), me().churchId, input(idOnly, req).params.id); return undefined; }, 204));

router.post('/sessions', requirePermission('members:write'), route(async (req) => {
  const { body } = input(z.object({ body: z.object({ childId: pos, roomId: pos, eventId: pos.nullish(), guardianId: pos.nullish() }) }), req);
  return svc.checkIn(await tx(), me().churchId, me().userId, body);
}, 201));
router.post('/sessions/:id/checkout', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(z.object({ params: idParam, body: z.object({ code: z.string().regex(/^\d{6}$/, 'the pickup code is six digits').optional(), guardianId: pos, overrideReason: z.string().min(5).max(300).nullish() }).refine((v) => v.code || v.overrideReason, { message: 'enter the pickup code, or an override reason', path: ['code'] }) }), req);
  const { churchId, userId, isAdmin } = me();
  return svc.checkOut(await tx(), churchId, userId, isAdmin, params.id, body);
}));
router.get('/sessions', requirePermission('members:read'), route(async (req) => svc.listSessions(await tx(), me().churchId, input(z.object({ query: z.object({ status: z.enum(['IN', 'OUT']).optional(), roomId: z.coerce.number().int().positive().optional(), childId: z.coerce.number().int().positive().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req).query)));
router.get('/events', requirePermission('members:write'), route(async (req) => svc.listSecurityEvents(await tx(), me().churchId, input(z.object({ query: z.object({ childId: z.coerce.number().int().positive().optional(), type: z.enum(['CHECK_IN', 'CHECK_OUT', 'DENIED', 'FLAGGED', 'OVERRIDE']).optional(), limit: limitQuery, cursor: z.string().max(200).optional() }) }), req).query)));

router.get('/export/attendance.csv', requirePermission('members:read'), async (req, res, next) => {
  try {
    const { query } = input(z.object({ query: z.object({ from: z.coerce.date(), to: z.coerce.date() }) }), req);
    const csv = await svc.attendanceCsv(await tx(), me().churchId, query.from, query.to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="checkin-attendance.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});

const mounts: RouteMount[] = [{ path: '/checkin', router }];
export default mounts;

/** Rosters, attendance, patrols, incidents. */
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, paging, parse, queryBool, queryString } from './helpers';
import { isDay, localDayOf } from '../common/time';
import { BadRequestError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import {
  approveOvertime, assignGuard, bulkShiftSchema, cancelShift, createShift, createShifts, createTemplate, decideSwap, getShift, listShifts, listSwaps, listTemplates, publishRoster, requestSwap, setTemplateActive, shiftSchema, templateSchema
} from '../ops/roster-service';
import { board, fixSchema, guardCheck, overrideAttendance, overrideSchema, recordForGuard, shiftHistory } from '../ops/attendance-service';
import { guardScan, patrolDay, scan, scanSchema, shiftPatrol } from '../ops/patrol-service';
import { addNote, getIncident, incidentSchema, listIncidents, reportIncident } from '../ops/incidents';
import { overview } from '../ops/overview';

const router = Router();
const guarded = [authenticate, requireWritable] as const;
const id = (req: { params: Record<string, string | string[]> }) => String(req.params.id);
const day = (v: unknown, fallback?: string) => {
  const s = typeof v === 'string' && v ? v : fallback;
  if (!s || !isDay(s)) throw new BadRequestError('use a date like 2026-10-05');
  return s;
};

router.get('/overview', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => overview(c, ctx)));
}));

// ---- templates and shifts ----
router.get('/shift-templates', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listTemplates(c)));
}));
router.post('/shift-templates', ...guarded, wrap(async (req, res) => {
  const body = parse(templateSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createTemplate(c, ctx, body)));
}));
router.patch('/shift-templates/:id', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  res.json(await inOrg(req, (c, ctx) => setTemplateActive(c, ctx, id(req), body.active)));
}));

router.get('/shifts', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const from = day(req.query.from, localDayOf(new Date()));
  const to = day(req.query.to, from);
  if (to < from) throw new BadRequestError('The end date is before the start date.');
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 31) throw new BadRequestError('Ask for at most 32 days at a time.');
  res.json(await inOrg(req, (c, ctx) => listShifts(c, ctx, { from, to, siteId: queryString(req.query.siteId), guardId: queryString(req.query.guardId), branchId: queryString(req.query.branchId), open: queryBool(req.query.open), ...paging(req, 500, 100) })));
}));
router.post('/shifts', ...guarded, wrap(async (req, res) => {
  const body = parse(shiftSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createShift(c, ctx, body)));
}));
router.post('/shifts/bulk', ...guarded, wrap(async (req, res) => {
  const body = parse(bulkShiftSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => createShifts(c, ctx, body)));
}));
router.get('/shifts/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (c, ctx) => ({ ...(await getShift(c, ctx, id(req))), events: await shiftHistory(c, ctx, id(req)) })));
}));
router.put('/shifts/:id/guard', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ guardId: z.string().uuid().nullable() }), req.body);
  res.json(await inOrg(req, (c, ctx) => assignGuard(c, ctx, id(req), body.guardId)));
}));
router.post('/shifts/:id/cancel', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  res.json(await inOrg(req, (c, ctx) => cancelShift(c, ctx, id(req), body.reason)));
}));
router.put('/shifts/:id/overtime', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ minutes: z.number().int().min(0).max(720), note: z.string().trim().max(300).optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => approveOvertime(c, ctx, id(req), body.minutes, body.note)));
}));
router.post('/roster/publish', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ from: z.string().refine(isDay), to: z.string().refine(isDay), branchId: z.string().uuid().optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => publishRoster(c, ctx, body)));
}));

// ---- swaps ----
router.get('/swaps', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listSwaps(c, ctx, { status: queryString(req.query.status), ...paging(req) })));
}));
router.post('/swaps', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ shiftId: z.string().uuid(), toGuardId: z.string().uuid(), reason: z.string().trim().max(300).optional() }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => requestSwap(c, ctx, body.shiftId, body.toGuardId, body.reason)));
}));
router.post('/swaps/:id/decision', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['approve', 'reject', 'cancel']), note: z.string().trim().max(300).optional() }), req.body);
  res.json(await inOrg(req, (c, ctx) => decideSwap(c, ctx, id(req), body.decision, body.note)));
}));

// ---- attendance ----
router.get('/attendance/board', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => board(c, ctx, { day: day(req.query.day, localDayOf(new Date())), siteId: queryString(req.query.siteId), branchId: queryString(req.query.branchId), state: queryString(req.query.state), ...paging(req, 200, 50) })));
}));
router.post('/shifts/:id/check', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ kind: z.enum(['in', 'out']), fix: fixSchema }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => recordForGuard(c, ctx, id(req), body.kind, body.fix)));
}));
router.post('/shifts/:id/override', ...guarded, wrap(async (req, res) => {
  const body = parse(overrideSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => overrideAttendance(c, ctx, id(req), body)));
}));

/**
 * A guard checking in alone. Unauthenticated by session: the guard's own phone number and PIN are the credential, and the failures are
 * throttled per phone number (never per address: every console request comes from the console's one address).
 */
const guardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    try {
      return `guard:${normalisePhone(String(req.body?.phone ?? ''))}`;
    } catch {
      return `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`;
    }
  },
  message: { code: 'too-many-attempts', message: 'Too many attempts. Try again in a few minutes, or ask your supervisor.' }
});
router.post('/guard/check', guardLimiter, wrap(async (req, res) => {
  const body = parse(z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(12), kind: z.enum(['in', 'out']), fix: fixSchema }), req.body);
  const r = await guardCheck(body);
  res.status(201).json({ kind: r.kind, at: r.at, site: r.site, geofence: r.geofence });
}));
router.post('/guard/scan', guardLimiter, wrap(async (req, res) => {
  const body = parse(z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(12), token: z.string().min(8).max(100), fix: fixSchema }), req.body);
  const r = await guardScan(body);
  res.status(201).json({ checkpoint: r.checkpoint, at: r.at, geofence: r.geofence });
}));

// ---- patrols ----
router.post('/patrol/scan', ...guarded, wrap(async (req, res) => {
  const body = parse(scanSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => scan(c, ctx, body)));
}));
router.get('/shifts/:id/patrol', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => shiftPatrol(c, ctx, id(req))));
}));
router.get('/patrol/day', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => patrolDay(c, ctx, day(req.query.day, localDayOf(new Date())))));
}));

// ---- incidents ----
router.get('/incidents', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listIncidents(c, ctx, { status: queryString(req.query.status), severity: queryString(req.query.severity), siteId: queryString(req.query.siteId), ...paging(req) })));
}));
router.post('/incidents', ...guarded, wrap(async (req, res) => {
  const body = parse(incidentSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => reportIncident(c, ctx, body)));
}));
router.get('/incidents/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getIncident(c, ctx, id(req))));
}));
router.post('/incidents/:id/notes', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ kind: z.enum(['note', 'close', 'reopen']).default('note'), body: z.string().trim().min(3).max(2000) }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => addNote(c, ctx, id(req), body.kind, body.body)));
}));

export default router;

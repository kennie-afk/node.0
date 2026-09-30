import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { input, requestTx, route } from '../../common/http';
import { idOnly, idParam } from '../finance/schemas';
import { camel, csvCell, me, select, toCsv } from '../ops-kit';
import { recordAudit } from '../finance/audit.service';
import type { RouteMount } from '../types';
import { CONSENT_PURPOSES, listConsents, recordConsent } from './consent.service';
import { getImportJob, importMembers, listImportJobs } from './import.service';
import { dataSubjectExport, executeErasure, listErasures, refuseErasure, requestErasure } from './erasure.service';

const router = Router();
router.use(authenticateToken);

const importBody = z.object({
  body: z.object({
    csv: z.string().min(10).max(900_000),
    dryRun: z.boolean().default(false),
    updateExisting: z.boolean().default(false),
    allowPartial: z.boolean().default(false)
  })
});
router.post('/imports/members', requirePermission('members:write'), route(async (req) => {
  const { body } = input(importBody, req);
  const { churchId, userId } = me();
  const t = await requestTx();
  const result = await importMembers(t, churchId, { ...body, userId });
  if (!body.dryRun && !(result as any).replayed) {
    await recordAudit(t, churchId, { action: 'import.members', entityType: 'import_job', entityId: (result as any).id, actorId: userId, data: { created: String((result as any).createdCount), updated: String((result as any).updatedCount) } });
  }
  return result;
}, 200));
router.get('/imports', requirePermission('members:write'), route(async () => listImportJobs(await requestTx(), me().churchId)));
router.get('/imports/:id', requirePermission('members:write'), route(async (req) => getImportJob(await requestTx(), me().churchId, input(idOnly, req).params.id)));

router.get('/exports/members.csv', requirePermission('members:read'), async (req, res, next) => {
  try {
    const { churchId, userId } = me();
    const t = await requestTx();
    const rows = await select<any>(t, `SELECT id, first_name, middle_name, last_name, gender, date_of_birth, email, phone_number, address, city, county, postal_code, status, baptism_date, membership_date FROM members WHERE church_id = ? ORDER BY id LIMIT 100000`, [churchId]);
    const header = ['id', 'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth', 'email', 'phone_number', 'address', 'city', 'county', 'postal_code', 'status', 'baptism_date', 'membership_date'];
    const csv = toCsv(header, rows.map((r) => { const c = camel(r); return header.map((h) => c[h.replace(/_([a-z])/g, (_m, x: string) => x.toUpperCase())]); }));
    await recordAudit(t, churchId, { action: 'export.members', entityType: 'members', actorId: userId, data: { rows: String(rows.length) } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
});
void csvCell;

const consentBody = z.object({
  params: idParam,
  body: z.object({ purpose: z.enum(CONSENT_PURPOSES), channel: z.enum(['SMS', 'EMAIL', 'ANY']).default('ANY'), granted: z.boolean(), source: z.enum(['STAFF', 'PAPER', 'WEB', 'SELF', 'IMPORT']).default('STAFF'), notes: z.string().max(300).nullish() })
});
router.get('/members/:id/consents', requirePermission('members:read'), route(async (req) => listConsents(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/members/:id/consents', requirePermission('members:write'), route(async (req) => {
  const { params, body } = input(consentBody, req);
  const { churchId, userId } = me();
  const t = await requestTx();
  await recordConsent(t, churchId, { memberId: params.id, ...body, userId });
  return listConsents(t, churchId, params.id);
}, 201));

router.get('/members/:id/data-export', requirePermission('users:manage'), route(async (req) => dataSubjectExport(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));

const erasureBody = z.object({ body: z.object({ memberId: z.number().int().positive(), reason: z.string().min(5).max(500) }) });
const refuseBody = z.object({ params: idParam, body: z.object({ reason: z.string().min(5).max(300) }) });
router.get('/erasure-requests', requirePermission('users:manage'), route(async () => listErasures(await requestTx(), me().churchId)));
router.post('/erasure-requests', requirePermission('users:manage'), route(async (req) => {
  const { body } = input(erasureBody, req);
  return requestErasure(await requestTx(), me().churchId, me().userId, body.memberId, body.reason);
}, 201));
router.post('/erasure-requests/:id/execute', requirePermission('users:manage'), route(async (req) => executeErasure(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/erasure-requests/:id/refuse', requirePermission('users:manage'), route(async (req) => {
  const { params, body } = input(refuseBody, req);
  return refuseErasure(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));

const mounts: RouteMount[] = [{ path: '/dataops', router }];
export default mounts;

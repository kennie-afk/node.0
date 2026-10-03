import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse } from './helpers';
import { BadRequestError } from '../domain/errors';
import { capacityCheck, getUpload, idCheckSchema, listChecks, listUploads, payslipSchema, recordIdCheck, recordPayslipCheck, uploadSchema, uploadStatement } from '../intake/service';

const router = Router();

router.post('/intake/statement', authenticate, requirePermission('intake'), requireWritable, wrap(async (req, res) => {
  const body = parse(uploadSchema, req.body);
  const result = await inOrg(req, (client, ctx) => uploadStatement(client, ctx, body));
  if (!result.ok) throw new BadRequestError(result.error);
  res.status(201).json(result);
}));
router.get('/intake/statement/:id', authenticate, requirePermission('intake'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => getUpload(client, String(req.params.id))));
}));
router.get('/members/:id/intake', authenticate, requirePermission('intake'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => ({ statements: await listUploads(client, String(req.params.id)), checks: await listChecks(client, String(req.params.id)) })));
}));
router.post('/intake/payslip', authenticate, requirePermission('intake'), requireWritable, wrap(async (req, res) => {
  const body = parse(payslipSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => recordPayslipCheck(client, ctx, body)));
}));
router.post('/intake/national-id', authenticate, requirePermission('intake'), requireWritable, wrap(async (req, res) => {
  const body = parse(idCheckSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => recordIdCheck(client, ctx, body)));
}));
router.post('/intake/capacity', authenticate, requirePermission('intake'), wrap(async (req, res) => {
  const body = parse(z.object({ uploadId: z.string().uuid(), instalmentCents: z.number().int().positive() }), req.body);
  res.json(await inOrg(req, (client) => capacityCheck(client, body.uploadId, body.instalmentCents)));
}));

export default router;

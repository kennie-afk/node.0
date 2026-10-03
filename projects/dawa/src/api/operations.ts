import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { businessDayNow, ctxOf, pickBranch, wrap } from '../common/context';
import { inBranch, inOrg, isoDay, parse, queryInt, queryString } from './helpers';
import { approveSchema, approveStocktake, cancelStocktake, countsSchema, currentStocktake, getStocktake, recordCounts, startStocktake } from '../stocktake/service';
import { closeDay, closeSchema, listCloses, previewClose } from '../close/service';
import { listPayables, paySupplierInvoice, supplierPaymentSchema } from '../payables/service';
import { expiryLoss, margin, movers, salesSummary, stockValuation } from '../reports/service';
import { exportCsv, listEvents, status as nttsStatus } from '../ntts/adapter';
import { checklist, hideSampleData, loadSampleData } from '../onboarding/service';
import { controlledCsv, salesCsv, stockCsv } from '../reports/exports';
import { need } from '../common/context';
import { BadRequestError } from '../domain/errors';
import { withOrg } from '../persistence/pool';

const router = Router();
router.use(authenticate);

// ---- stock-take ----
router.get('/stocktake', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => (await currentStocktake(client, branch.id)) ?? { status: 'none' }));
}));
router.post('/stocktake', requireWritable, wrap(async (req, res) => {
  const input = parse(z.object({ branchId: z.string().uuid().optional(), note: z.string().trim().max(200).optional() }), req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => startStocktake(client, ctx, branch, input.note)));
}));
router.get('/stocktake/:id', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => getStocktake(client, String(req.params.id))));
}));
router.put('/stocktake/:id/counts', requireWritable, wrap(async (req, res) => {
  const input = parse(countsSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => recordCounts(client, ctx, String(req.params.id), input)));
}));
router.post('/stocktake/:id/approve', requireWritable, wrap(async (req, res) => {
  const input = parse(approveSchema, req.body ?? {});
  res.json(await inOrg(req, (client, ctx) => approveStocktake(client, ctx, String(req.params.id), input)));
}));
router.post('/stocktake/:id/cancel', requireWritable, wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => cancelStocktake(client, ctx, String(req.params.id))));
}));

// ---- day close ----
router.get('/close/preview', requirePermission('day_close'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => {
    const day = z.optional(isoDay).parse(queryString(req.query.day)) ?? (await businessDayNow(client, branch.timezone));
    return previewClose(client, branch, day);
  }));
}));
router.post('/close', requireWritable, wrap(async (req, res) => {
  const input = parse(closeSchema, req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => closeDay(client, ctx, branch, input)));
}));
router.get('/close', requirePermission('day_close'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, _ctx, branch) => listCloses(client, branch.id, queryInt(req.query.limit, 31))));
}));

// ---- supplier payables ----
router.get('/payables', requirePermission('suppliers'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => listPayables(client, ctx.branchId, { openOnly: req.query.open === 'true' })));
}));
router.post('/payables/:id/payments', requireWritable, wrap(async (req, res) => {
  const input = parse(supplierPaymentSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => paySupplierInvoice(client, ctx, String(req.params.id), input)));
}));

// ---- reports (managers and owners) ----
async function reportBranches(req: import('express').Request): Promise<string[]> {
  const ctx = ctxOf(req);
  return withOrg(ctx.orgId, async (client) => {
    const requested = queryString(req.query.branchId);
    if (requested || ctx.branchId) return [(await pickBranch(client, ctx, requested, { allowArchived: true })).id];
    const rows = (await client.query('SELECT id FROM branches WHERE NOT archived AND NOT is_demo')).rows;
    if (rows.length === 0) throw new BadRequestError('There is no branch yet.');
    return rows.map((r) => r.id as string);
  });
}
function range(req: import('express').Request): { from: string; to: string } {
  const today = new Date().toISOString().slice(0, 10);
  const from = z.optional(isoDay).parse(queryString(req.query.from)) ?? `${today.slice(0, 8)}01`;
  const to = z.optional(isoDay).parse(queryString(req.query.to)) ?? today;
  if (from > to) throw new BadRequestError('from is after to');
  return { from, to };
}

router.get('/reports/sales', requirePermission('reports'), wrap(async (req, res) => {
  const ids = await reportBranches(req);
  const { from, to } = range(req);
  res.json(await inOrg(req, (client) => salesSummary(client, ids, from, to)));
}));
router.get('/reports/margin', requirePermission('reports'), wrap(async (req, res) => {
  const ids = await reportBranches(req);
  const { from, to } = range(req);
  res.json(await inOrg(req, (client) => margin(client, ids, from, to)));
}));
router.get('/reports/movers', requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => movers(client, branch, await businessDayNow(client, branch.timezone), Math.min(Math.max(queryInt(req.query.days, 30), 7), 365))));
}));
router.get('/reports/expiry-loss', requirePermission('reports'), wrap(async (req, res) => {
  const { from, to } = range(req);
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => ({
    ...(await expiryLoss(client, branch, await businessDayNow(client, branch.timezone), from, to)),
    valuation: await stockValuation(client, branch, await businessDayNow(client, branch.timezone))
  })));
}));

// ---- take your data out: plain CSV ----
function sendCsv(res: import('express').Response, name: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
}
router.get('/export/sales.csv', requirePermission('reports'), wrap(async (req, res) => {
  const { from, to } = range(req);
  sendCsv(res, 'dawa-sales.csv', await inBranch(req, req.query.branchId, (client, _ctx, branch) => salesCsv(client, branch, from, to)));
}));
router.get('/export/stock.csv', requirePermission('reports'), wrap(async (req, res) => {
  sendCsv(res, 'dawa-stock.csv', await inBranch(req, req.query.branchId, (client, _ctx, branch) => stockCsv(client, branch)));
}));
router.get('/export/controlled.csv', wrap(async (req, res) => {
  sendCsv(res, 'dawa-controlled-register.csv', await inBranch(req, req.query.branchId, (client, ctx, branch) => { need(ctx, 'controlled'); return controlledCsv(client, branch); }));
}));

// ---- track-and-trace readiness (NOT an integration) ----
router.get('/ntts/status', wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => nttsStatus(client, ctx.branchId)));
}));
router.get('/ntts/events', requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => listEvents(client, ctx.branchId, queryInt(req.query.limit, 100))));
}));
router.get('/ntts/export.csv', requirePermission('reports'), wrap(async (req, res) => {
  const { from, to } = range(req);
  const csv = await inOrg(req, (client, ctx) => exportCsv(client, ctx.branchId, from, to));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dawa-internal-activity-log.csv"');
  res.setHeader('X-Dawa-Format', 'internal-log-not-an-official-submission');
  res.send(csv);
}));

// ---- onboarding ----
router.get('/onboarding', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => checklist(client)));
}));
router.post('/onboarding/sample-data', requireWritable, wrap(async (req, res) => {
  res.status(201).json(await inOrg(req, (client, ctx) => loadSampleData(client, ctx)));
}));
router.post('/onboarding/sample-data/hide', requireWritable, wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => hideSampleData(client, ctx)));
}));

export default router;

/** Payroll, deduction tables, holidays, invoices, payments, debtors, margin, and the client's read-only portal. */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, paging, parse, queryBool, queryString } from './helpers';
import { withOrg, withoutTenant } from '../persistence/pool';
import { NotFoundError } from '../domain/errors';
import { addHoliday, confirmTable, listHolidays, listTables, loadIllustrative, markNotApplicable, removeHoliday, setTable } from '../payroll/rates';
import { addAdjustment, adjustmentSchema, closePeriod, closeSchema, complianceReport, getPayslip, getPeriod, listAdjustments, listPayslips, listPeriods, runPayroll } from '../payroll/service';
import { KINDS } from '../payroll/deductions';
import { creditNote, creditSchema, debtors, generateInvoice, generateSchema, getInvoice, invoiceEvent, listInvoices, listPayments, margin, paymentSchema, previewInvoice, recordPayment } from '../invoicing/service';
import { portalSummary } from '../ops/overview';
import { localDayOf } from '../common/time';
import { BadRequestError } from '../domain/errors';

const router = Router();
const guarded = [authenticate, requireWritable] as const;
const id = (req: { params: Record<string, string | string[]> }) => String(req.params.id);
const kind = (req: { params: Record<string, string | string[]> }) => {
  const k = String(req.params.kind);
  if (!(KINDS as readonly string[]).includes(k)) throw new NotFoundError('No such deduction table.');
  return k as (typeof KINDS)[number];
};
const month = (req: { params: Record<string, string | string[]> }) => String(req.params.month);

// ---- deduction tables and holidays ----
router.get('/payroll/tables', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listTables(c)));
}));
router.put('/payroll/tables/:kind', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ config: z.unknown() }), req.body);
  res.json(await inOrg(req, (c, ctx) => setTable(c, ctx, kind(req), body.config)));
}));
router.post('/payroll/tables/:kind/illustrative', ...guarded, wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => loadIllustrative(c, ctx, kind(req))));
}));
router.post('/payroll/tables/:kind/confirm', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().min(5).max(500) }), req.body);
  res.json(await inOrg(req, (c, ctx) => confirmTable(c, ctx, kind(req), body.note)));
}));
router.post('/payroll/tables/:kind/not-applicable', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ note: z.string().trim().min(5).max(500) }), req.body);
  res.json(await inOrg(req, (c, ctx) => markNotApplicable(c, ctx, kind(req), body.note)));
}));
router.get('/holidays', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const y = Number(req.query.year);
  res.json(await inOrg(req, (c) => listHolidays(c, Number.isInteger(y) ? y : undefined)));
}));
router.post('/holidays', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(80) }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => addHoliday(c, ctx, body.day, body.name)));
}));
router.delete('/holidays/:day', ...guarded, wrap(async (req, res) => {
  await inOrg(req, (c, ctx) => removeHoliday(c, ctx, String(req.params.day)));
  res.status(204).end();
}));

// ---- periods ----
router.get('/payroll/periods', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listPeriods(c)));
}));
router.get('/payroll/periods/:month', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (c) => (await getPeriod(c, month(req))) ?? { month: month(req), status: 'not_started' }));
}));
router.post('/payroll/periods/:month/run', ...guarded, wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => runPayroll(c, ctx, month(req))));
}));
router.post('/payroll/periods/:month/close', ...guarded, wrap(async (req, res) => {
  const body = parse(closeSchema, req.body ?? {});
  res.json(await inOrg(req, (c, ctx) => closePeriod(c, ctx, month(req), body)));
}));
router.get('/payroll/periods/:month/payslips', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listPayslips(c, ctx, month(req), { q: queryString(req.query.q), flagged: queryBool(req.query.flagged), ...paging(req) })));
}));
router.get('/payroll/payslips/:id', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getPayslip(c, ctx, id(req))));
}));
router.get('/payroll/compliance/:month', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => complianceReport(c, ctx, month(req))));
}));
router.get('/payroll/adjustments', authenticate, requirePermission('salary_view'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => listAdjustments(c, ctx, { month: queryString(req.query.month), guardId: queryString(req.query.guardId), ...paging(req) })));
}));
router.post('/payroll/adjustments', ...guarded, wrap(async (req, res) => {
  const body = parse(adjustmentSchema, req.body);
  res.status(201).json({ id: await inOrg(req, (c, ctx) => addAdjustment(c, ctx, body)) });
}));

// ---- invoices ----
router.get('/invoices', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listInvoices(c, { clientId: queryString(req.query.clientId), status: queryString(req.query.status), month: queryString(req.query.month), ...paging(req) })));
}));
router.post('/invoices/preview', ...guarded, wrap(async (req, res) => {
  const body = parse(generateSchema, req.body);
  res.json(await inOrg(req, (c, ctx) => previewInvoice(c, ctx, body)));
}));
router.post('/invoices', ...guarded, wrap(async (req, res) => {
  const body = parse(generateSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => generateInvoice(c, ctx, body)));
}));
router.get('/invoices/:id', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => getInvoice(c, ctx, id(req))));
}));
router.post('/invoices/:id/credit', ...guarded, wrap(async (req, res) => {
  const body = parse(creditSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => creditNote(c, ctx, id(req), body)));
}));
router.post('/invoices/:id/events', ...guarded, wrap(async (req, res) => {
  const body = parse(z.object({ kind: z.enum(['dispute', 'resolve', 'note']), body: z.string().trim().min(3).max(1000) }), req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => invoiceEvent(c, ctx, id(req), body.kind, body.body)));
}));
router.get('/payments', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => listPayments(c, { clientId: queryString(req.query.clientId), ...paging(req) })));
}));
router.post('/payments', ...guarded, wrap(async (req, res) => {
  const body = parse(paymentSchema, req.body);
  res.status(201).json(await inOrg(req, (c, ctx) => recordPayment(c, ctx, body)));
}));
router.get('/debtors', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c) => debtors(c)));
}));
router.get('/margin/:month', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (c, ctx) => margin(c, ctx, month(req))));
}));

// ---- the client's read-only portal: the link's token is the only credential ----
router.get('/portal/:token', wrap(async (req, res) => {
  const m = typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month) ? req.query.month : localDayOf(new Date()).slice(0, 7);
  const hit = await withoutTenant(async (c) => (await c.query('SELECT org_id, client_id FROM resolve_portal($1)', [String(req.params.token)])).rows[0]);
  if (!hit) throw new NotFoundError('That link is not valid.');
  if (String(req.params.token).length < 20) throw new BadRequestError('That link is not valid.');
  res.json(await withOrg(hit.org_id, (c) => portalSummary(c, hit.client_id, m)));
}));

export default router;

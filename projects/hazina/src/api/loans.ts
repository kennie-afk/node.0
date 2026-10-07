import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { ctxOf, wrap } from '../common/context';
import { inOrg, isoDay, parse, queryInt, queryString } from './helpers';
import {
  appraiseLoan, appraiseSchema, applyForLoan, applySchema, createProduct, decideLoan, decideSchema, disburseLoan, disburseSchema,
  listLoans, listProducts, loanDetail, previewSchedule, productSchema, repayLoan, repaySchema, restructureLoan, restructureSchema,
  runInterestAccrual, runPenalties, setProductActive, writeOffLoan, writeOffSchema
} from '../loans/service';
import { addMonthsToDay } from '../loans/schedule';
import { callGuarantee, guaranteeCallSchema } from '../loans/guarantees';
import { sendReminders } from '../notify/reminders';
import { env } from '../config/env';
import { arrearsList, portfolioSummary } from '../reports/portfolio';
import { BadRequestError } from '../domain/errors';

const router = Router();

router.get('/loan-products', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listProducts(client, req.query.all === 'true')));
}));
router.post('/loan-products', authenticate, requirePermission('products_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(productSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createProduct(client, ctx, body)));
}));
router.patch('/loan-products/:id', authenticate, requirePermission('products_write'), requireWritable, wrap(async (req, res) => {
  const body = parse(z.object({ active: z.boolean() }), req.body);
  res.json(await inOrg(req, (client, ctx) => setProductActive(client, ctx, String(req.params.id), body.active)));
}));

const previewBody = z.object({ productId: z.string().uuid(), principalCents: z.number().int().positive(), termMonths: z.number().int().min(1).max(360) });
router.post('/loans/preview', authenticate, requirePermission('read'), wrap(async (req, res) => {
  const body = parse(previewBody, req.body);
  res.json(await inOrg(req, async (client) => {
    const product = (await client.query('SELECT * FROM loan_products WHERE id = $1', [body.productId])).rows[0];
    if (!product) throw new BadRequestError('That loan product was not found.');
    const today = (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
    return previewSchedule({ principalCents: body.principalCents, termMonths: body.termMonths, annualRateBp: product.annual_rate_bp, method: product.method, firstDueDate: addMonthsToDay(today, 1) });
  }));
}));

router.post('/loans', authenticate, requirePermission('loan_apply'), requireWritable, wrap(async (req, res) => {
  const body = parse(applySchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => applyForLoan(client, ctx, body)));
}));
router.get('/loans', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listLoans(client, {
    status: queryString(req.query.status), memberId: queryString(req.query.memberId), search: queryString(req.query.search),
    limit: Math.min(100, queryInt(req.query.limit, 25)) || 25, after: queryString(req.query.after)
  })));
}));
router.get('/loans/:id', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => loanDetail(client, String(req.params.id))));
}));
router.post('/loans/:id/appraise', authenticate, requirePermission('loan_appraise'), requireWritable, wrap(async (req, res) => {
  const body = parse(appraiseSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => appraiseLoan(client, ctx, String(req.params.id), body)));
}));
router.post('/loans/:id/decision', authenticate, requirePermission('loan_approve'), requireWritable, wrap(async (req, res) => {
  const body = parse(decideSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => decideLoan(client, ctx, String(req.params.id), body)));
}));
router.post('/loans/:id/disburse', authenticate, requirePermission('loan_disburse'), requireWritable, wrap(async (req, res) => {
  const body = parse(disburseSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => disburseLoan(client, ctx, String(req.params.id), body)));
}));
router.post('/loans/:id/repay', authenticate, requirePermission('loan_repay'), requireWritable, wrap(async (req, res) => {
  const body = parse(repaySchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => repayLoan(client, ctx, String(req.params.id), body)));
}));
router.post('/loans/:id/write-off', authenticate, requirePermission('loan_writeoff'), requireWritable, wrap(async (req, res) => {
  const body = parse(writeOffSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => writeOffLoan(client, ctx, String(req.params.id), body)));
}));
router.post('/loans/:id/restructure', authenticate, requirePermission('loan_approve'), requireWritable, wrap(async (req, res) => {
  const body = parse(restructureSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => restructureLoan(client, ctx, String(req.params.id), body)));
}));

router.post('/penalties/run', authenticate, requirePermission('penalties_run'), requireWritable, wrap(async (req, res) => {
  const body = parse(z.object({ asOf: isoDay.optional() }), req.body ?? {});
  const ctx = ctxOf(req);
  const asOf = await inOrg(req, async (client) => {
    const today = (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
    if (body.asOf && body.asOf > today) throw new BadRequestError('Penalties cannot be charged for a day that has not come.');
    return body.asOf ?? today;
  });
  // batched transactions of its own: the request does not hold one lock over the whole book
  res.json(await runPenalties(ctx.orgId, ctx.userId, asOf));
}));

router.post('/interest-accrual/run', authenticate, requirePermission('penalties_run'), requireWritable, wrap(async (req, res) => {
  const ctx = ctxOf(req);
  const today = await inOrg(req, async (client) => (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string);
  res.json(await runInterestAccrual(ctx.orgId, ctx.userId, today));
}));

router.post('/loans/:id/guarantee-calls', authenticate, requirePermission('loan_writeoff'), requireWritable, wrap(async (req, res) => {
  const body = parse(guaranteeCallSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => callGuarantee(client, ctx, String(req.params.id), body)));
}));

const remindBody = z.object({ upcomingDays: z.number().int().min(0).max(14).optional() });
router.post('/reminders/run', authenticate, requirePermission('penalties_run'), requireWritable, wrap(async (req, res) => {
  const body = parse(remindBody, req.body ?? {});
  const ctx = ctxOf(req);
  const today = await inOrg(req, async (client) => (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string);
  res.json(await sendReminders(ctx.orgId, today, { upcomingDays: body.upcomingDays ?? env.SMS_REMINDER_UPCOMING_DAYS }));
}));

router.get('/portfolio', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    return portfolioSummary(client);
  }));
}));
router.get('/arrears', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => arrearsList(client, { minDays: queryInt(req.query.minDays, 1), limit: Math.min(200, queryInt(req.query.limit, 50)) || 50, offset: queryInt(req.query.offset, 0) })));
}));

export default router;

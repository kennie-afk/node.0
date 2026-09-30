import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { input, requestTx, route } from '../../common/http';
import { signedMoneyInput, toMinor } from '../../common/money';
import { preferReplica } from '../../common/tenant-db';
import { ensureFinanceSetup } from '../finance/setup.service';
import { idParam, isoDate } from '../finance/schemas';
import type { RouteMount } from '../types';
import * as svc from './budget.service';

const router = Router();
router.use(authenticateToken);
router.use(async (_req, _res, next) => {
  try {
    await ensureFinanceSetup(await requestTx(), currentTenant().churchId);
    next();
  } catch (error) {
    next(error);
  }
});
const me = () => ({ churchId: currentTenant().churchId, userId: currentTenant().userId });

const pos = z.number().int().positive();
const line = z
  .object({
    accountId: pos,
    fundId: pos,
    ministryId: pos.nullish(),
    months: z.array(signedMoneyInput).length(12).optional(),
    annual: signedMoneyInput.optional(),
    month: z.number().int().min(1).max(12).optional(),
    amount: signedMoneyInput.optional()
  })
  .refine((l) => l.months || l.annual !== undefined || (l.month !== undefined && l.amount !== undefined), { message: 'give months, annual, or month with amount' });

const createBody = z.object({ body: z.object({ fiscalYearId: pos, name: z.string().min(2).max(120), notes: z.string().max(500).nullish(), lines: z.array(line).max(2000).optional() }) });
const updateBody = z.object({
  params: idParam,
  body: z.object({ name: z.string().min(2).max(120).optional(), notes: z.string().max(500).nullish(), lines: z.array(line).max(2000).optional(), mode: z.enum(['replace', 'merge']).optional() }).strict()
});
const copyBody = z.object({ params: idParam, body: z.object({ fiscalYearId: pos, name: z.string().min(2).max(120), upliftPercent: z.number().min(-100).max(1000).default(0) }) });
const idOnly = z.object({ params: idParam });
const listQuery = z.object({ query: z.object({ fiscalYearId: z.coerce.number().int().positive().optional() }) });
const varianceQuery = z.object({
  params: idParam,
  query: z.object({
    groupBy: z.enum(['account', 'fund', 'ministry', 'month']).default('account'),
    throughMonth: z.coerce.number().int().min(1).max(12).optional(),
    fundId: z.coerce.number().int().positive().optional(),
    accountId: z.coerce.number().int().positive().optional()
  })
});
const checkQuery = z.object({ query: z.object({ accountId: z.coerce.number().int().positive(), fundId: z.coerce.number().int().positive(), amount: z.string(), date: isoDate }) });

router.get('/', requirePermission('finance:read'), route(async (req) => svc.listBudgets(await requestTx(), me().churchId, input(listQuery, req).query.fiscalYearId)));
router.post('/', requirePermission('finance:post'), route(async (req) => svc.createBudget(await requestTx(), me().churchId, me().userId, input(createBody, req).body), 201));
router.get('/check', requirePermission('finance:read'), route(async (req) => {
  const { query } = input(checkQuery, req);
  return svc.checkBudget(await requestTx(), me().churchId, { accountId: query.accountId, fundId: query.fundId, amountMinor: toMinor(query.amount), date: query.date });
}));
router.get('/:id', requirePermission('finance:read'), route(async (req) => svc.getBudget(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.put('/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(updateBody, req);
  return svc.updateBudget(await requestTx(), me().churchId, me().userId, params.id, body);
}));
router.delete('/:id', requirePermission('finance:post'), route(async (req) => {
  await svc.deleteBudget(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id);
  return undefined;
}, 204));
router.post('/:id/approve', requirePermission('finance:approve'), route(async (req) => svc.approveBudget(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/:id/activate', requirePermission('finance:approve'), route(async (req) => svc.activateBudget(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/:id/close', requirePermission('finance:approve'), route(async (req) => svc.closeBudget(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/:id/copy', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(copyBody, req);
  return svc.copyBudget(await requestTx(), me().churchId, me().userId, params.id, { fiscalYearId: body.fiscalYearId, name: body.name, upliftBasisPoints: Math.round(body.upliftPercent * 100) });
}, 201));
router.get('/:id/variance', requirePermission('finance:read'), preferReplica, route(async (req) => {
  const { params, query } = input(varianceQuery, req);
  return svc.variance(await requestTx(), me().churchId, params.id, query);
}));

const mounts: RouteMount[] = [{ path: '/budgets', router }];
export default mounts;

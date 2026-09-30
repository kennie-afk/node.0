import { Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { idempotent } from '../../common/idempotency';
import { input, requestTx, route } from '../../common/http';
import { ensureFinanceSetup } from '../finance/setup.service';
import { idOnly } from '../finance/schemas';
import { csvRoute } from '../reports/csv';
import type { RouteMount } from '../types';
import * as s from './schemas';
import { createEmployee, employeeDto, getEmployee, listEmployees, removeEmployee, updateEmployee, EmployeeInput } from './employees.service';
import { approveRun, calculateRun, createRun, issueAdvance, listAdvances, listRuns, payRun, postRun, remit, reopenRun, voidRun } from './runs.service';
import { paymentFileCsv, payslipDocument, registerCsv, runDetail, statutoryCsv, statutoryReturn, statutorySummary } from './payroll.reports';
import { RATE_SETS, rateSetFor } from './rates';
import { fromMinor } from '../../common/money';

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

const me = () => {
  const tenant = currentTenant();
  return { churchId: tenant.churchId, userId: tenant.userId };
};
const today = () => new Date().toISOString().slice(0, 10);

function toEmployeeInput(body: any): Partial<EmployeeInput> {
  const { basicSalary, insurancePremium, ...rest } = body;
  return {
    ...rest,
    ...(basicSalary !== undefined ? { basicSalaryMinor: basicSalary } : {}),
    ...(insurancePremium !== undefined ? { insurancePremiumMinor: insurancePremium } : {})
  };
}

// ---- rates ------------------------------------------------------------------------------------

router.get('/rates', requirePermission('payroll:read'), route(async () => {
  const now = new Date();
  const current = rateSetFor(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const show = (set: (typeof RATE_SETS)[number]) => ({
    version: set.version,
    effectiveFrom: set.effectiveFrom,
    payeBands: set.payeBands.map((b) => ({ upTo: b.upTo === null ? null : fromMinor(b.upTo), rate: `${b.bps / 100}%` })),
    personalRelief: fromMinor(set.personalReliefMinor),
    insuranceRelief: `${set.insuranceReliefBps / 100}% of premiums, max ${fromMinor(set.insuranceReliefMaxMinor)} a month`,
    nssf: { rate: `${set.nssf.rateBps / 100}%`, lowerLimit: fromMinor(set.nssf.lowerLimitMinor), upperLimit: fromMinor(set.nssf.upperLimitMinor) },
    shif: { rate: `${set.shif.rateBps / 100}%`, minimum: fromMinor(set.shif.minimumMinor) },
    housingLevy: { employee: `${set.housingLevy.employeeBps / 100}%`, employer: `${set.housingLevy.employerBps / 100}%` },
    sources: set.sources
  });
  return { current: show(current), history: RATE_SETS.map(show), note: 'Only PAYE is read from an official source; NSSF, SHIF and levy figures are provisional until confirmed. See docs/PAYROLL-RATES.md.' };
}));

// ---- employees --------------------------------------------------------------------------------

router.get('/employees', requirePermission('payroll:read'), route(async (req) => listEmployees(await requestTx(), me().churchId, input(s.employeeList, req).query)));
router.get('/employees/:id', requirePermission('payroll:read'), route(async (req) => employeeDto(await getEmployee(await requestTx(), me().churchId, input(idOnly, req).params.id))));
router.post('/employees', requirePermission('payroll:run'), route(async (req) => employeeDto(await createEmployee(await requestTx(), me().churchId, me().userId, toEmployeeInput(input(s.employeeCreate, req).body) as EmployeeInput)), 201));
router.put('/employees/:id', requirePermission('payroll:run'), route(async (req) => {
  const { params, body } = input(s.employeeUpdate, req);
  return employeeDto(await updateEmployee(await requestTx(), me().churchId, me().userId, params.id, toEmployeeInput(body)));
}));
router.delete('/employees/:id', requirePermission('payroll:run'), route(async (req) => {
  const outcome = await removeEmployee(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id);
  return { result: outcome };
}));

// ---- staff advances ---------------------------------------------------------------------------

router.get('/advances', requirePermission('payroll:read'), route(async (req) => listAdvances(await requestTx(), me().churchId, req.query.employeeId ? Number(req.query.employeeId) : undefined)));
router.post('/advances', requirePermission('payroll:run'), idempotent(), route(async (req) => {
  const { body } = input(s.advanceCreate, req);
  return issueAdvance(await requestTx(), me().churchId, me().userId, { employeeId: body.employeeId, amountMinor: body.amount, monthlyRecoveryMinor: body.monthlyRecovery, date: body.date, accountId: body.accountId, note: body.note });
}, 201));

// ---- runs -------------------------------------------------------------------------------------

router.get('/runs', requirePermission('payroll:read'), route(async (req) => listRuns(await requestTx(), me().churchId, input(s.runList, req).query.year)));
router.post('/runs', requirePermission('payroll:run'), route(async (req) => {
  const { body } = input(s.runCreate, req);
  return createRun(await requestTx(), me().churchId, me().userId, body.year, body.month);
}, 201));
router.get('/runs/:id', requirePermission('payroll:read'), route(async (req) => runDetail(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/runs/:id/calculate', requirePermission('payroll:run'), route(async (req) => calculateRun(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/runs/:id/reopen', requirePermission('payroll:run'), route(async (req) => reopenRun(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/runs/:id/approve', requirePermission('payroll:approve'), route(async (req) => approveRun(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/runs/:id/post', requirePermission('payroll:run'), route(async (req) => postRun(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/runs/:id/pay', requirePermission('payroll:run'), idempotent(), route(async (req) => {
  const { params, body } = input(s.payBody, req);
  return payRun(await requestTx(), me().churchId, me().userId, params.id, body);
}));
router.post('/runs/:id/remit', requirePermission('payroll:run'), idempotent(), route(async (req) => {
  const { params, body } = input(s.remitBody, req);
  return remit(await requestTx(), me().churchId, me().userId, params.id, body.kind, body);
}, 201));
router.post('/runs/:id/void', requirePermission('payroll:approve'), route(async (req) => {
  const { params, body } = input(s.reasonBody, req);
  return voidRun(await requestTx(), me().churchId, me().userId, params.id, body.reason, body.date ?? today());
}));

router.get('/runs/:id/register.csv', requirePermission('payroll:read'), csvRoute(async (req) => registerCsv(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/runs/:id/payment-file.csv', requirePermission('payroll:run'), csvRoute(async (req) => paymentFileCsv(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/runs/:id/statutory', requirePermission('payroll:read'), route(async (req) => statutoryReturn(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/runs/:id/statutory.csv', requirePermission('payroll:read'), csvRoute(async (req) => statutoryCsv(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/runs/:id/payslips/:employeeId', requirePermission('payroll:read'), route(async (req) => {
  const { params } = input(s.slipParams, req);
  return payslipDocument(await requestTx(), me().churchId, params.id, params.employeeId);
}));
router.get('/statutory/summary', requirePermission('payroll:read'), route(async (req) => statutorySummary(await requestTx(), me().churchId, input(s.summaryQuery, req).query.year)));

const mounts: RouteMount[] = [{ path: '/payroll', router }];
export default mounts;

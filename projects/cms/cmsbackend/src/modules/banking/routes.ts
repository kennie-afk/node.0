import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { idempotent } from '../../common/idempotency';
import { input, requestTx, route } from '../../common/http';
import { signedMoneyInput } from '../../common/money';
import { BadRequestError } from '../../utils/errors';
import { ensureFinanceSetup } from '../finance/setup.service';
import { idParam, isoDate, limitQuery } from '../finance/schemas';
import type { RouteMount } from '../types';
import * as accounts from './accounts.service';
import * as statements from './statements.service';
import * as recs from './reconcile.service';
import { parseStatementCsv } from './csv';

const router = Router();
router.use(authenticateToken);
router.use(async (_req, _res, next) => {
  try {
    const t = await requestTx();
    const { churchId } = currentTenant();
    await ensureFinanceSetup(t, churchId);
    await accounts.ensureBankAccounts(t, churchId);
    next();
  } catch (error) {
    next(error);
  }
});
const me = () => ({ churchId: currentTenant().churchId, userId: currentTenant().userId });
const pos = z.number().int().positive();
const idOnly = z.object({ params: idParam });

const accountCreate = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    kind: z.enum(accounts.KINDS),
    glAccountId: pos.optional(),
    newAccount: z.object({ code: z.string().min(1).max(12).regex(/^[A-Za-z0-9.-]+$/), name: z.string().min(2).max(150).optional() }).optional(),
    accountNumber: z.string().max(40).nullish(),
    float: signedMoneyInput.nullish()
  })
});
const accountUpdate = z.object({
  params: idParam,
  body: z.object({ name: z.string().min(2).max(120).optional(), accountNumber: z.string().max(40).nullish(), float: signedMoneyInput.nullish(), isActive: z.boolean().optional() }).strict()
});

const jsonRow = z.object({
  date: isoDate,
  description: z.string().max(300).default(''),
  reference: z.string().max(80).nullish(),
  amount: signedMoneyInput,
  balance: signedMoneyInput.nullish()
});
const importBody = z.object({
  params: idParam,
  body: z
    .object({
      label: z.string().max(120).nullish(),
      periodStart: isoDate.nullish(),
      periodEnd: isoDate.nullish(),
      openingBalance: signedMoneyInput.nullish(),
      closingBalance: signedMoneyInput.nullish(),
      rows: z.array(jsonRow).max(statements.MAX_IMPORT_ROWS).optional(),
      csv: z.string().max(3_000_000).optional()
    })
    .refine((b) => Boolean(b.rows) !== Boolean(b.csv), { message: 'send either rows or csv, not both' })
});
const linesQuery = z.object({
  params: idParam,
  query: z.object({ status: z.enum(['UNMATCHED', 'MATCHED', 'IGNORED', 'RECONCILED']).optional(), from: isoDate.optional(), to: isoDate.optional(), limit: limitQuery, cursor: z.string().max(300).optional() })
});
const matchBody = z.object({ params: idParam, body: z.object({ journalLineIds: z.array(pos).min(1).max(200) }) });
const ignoreBody = z.object({ params: idParam, body: z.object({ reason: z.string().min(3).max(300) }) });
const createEntryBody = z.object({ params: idParam, body: z.object({ accountId: pos, fundId: pos, memo: z.string().max(500).nullish(), ministryId: pos.nullish() }) });
const autoBody = z.object({ params: idParam, body: z.object({ apply: z.boolean().default(false), windowDays: z.number().int().min(0).max(31).optional() }) });
const recOpen = z.object({ params: idParam, body: z.object({ statementDate: isoDate, statementBalance: signedMoneyInput, openingBalance: signedMoneyInput.optional() }) });
const unrecQuery = z.object({ params: idParam, query: z.object({ asOf: isoDate.optional() }) });

router.get('/accounts', requirePermission('finance:read'), route(async (req) => accounts.listBankAccounts(await requestTx(), me().churchId, req.query.includeInactive === 'true')));
router.post('/accounts', requirePermission('finance:post'), route(async (req) => {
  const { body } = input(accountCreate, req);
  return accounts.createBankAccount(await requestTx(), me().churchId, me().userId, { ...body, floatMinor: body.float ?? null });
}, 201));
router.put('/accounts/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(accountUpdate, req);
  return accounts.updateBankAccount(await requestTx(), me().churchId, me().userId, params.id, { ...body, floatMinor: body.float });
}));

router.post('/accounts/:id/statements', requirePermission('finance:post'), idempotent(), route(async (req) => {
  const { params, body } = input(importBody, req);
  let rows;
  let source: 'JSON' | 'CSV' = 'JSON';
  if (body.csv) {
    const parsed = parseStatementCsv(body.csv);
    if (parsed.errors.length > 0) {
      throw new BadRequestError(`the CSV has ${parsed.errors.length} problem(s): ${parsed.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join('; ')}`);
    }
    rows = parsed.rows;
    source = 'CSV';
  } else {
    rows = body.rows!.map((r) => ({ date: r.date, description: r.description, reference: r.reference ?? null, amountMinor: r.amount, balanceMinor: r.balance ?? null }));
  }
  return statements.importStatement(await requestTx(), me().churchId, me().userId, params.id, {
    label: body.label, periodStart: body.periodStart, periodEnd: body.periodEnd, openingBalanceMinor: body.openingBalance, closingBalanceMinor: body.closingBalance, source, rows
  });
}, 201));
router.get('/accounts/:id/statements', requirePermission('finance:read'), route(async (req) => statements.listStatements(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.get('/accounts/:id/lines', requirePermission('finance:read'), route(async (req) => {
  const { params, query } = input(linesQuery, req);
  return statements.listLines(await requestTx(), me().churchId, params.id, query);
}));
router.get('/accounts/:id/unreconciled', requirePermission('finance:read'), route(async (req) => {
  const { params, query } = input(unrecQuery, req);
  return statements.unreconciledReport(await requestTx(), me().churchId, params.id, query.asOf);
}));
router.post('/accounts/:id/auto-match', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(autoBody, req);
  return statements.autoMatch(await requestTx(), me().churchId, me().userId, params.id, body);
}));

router.get('/lines/:id/candidates', requirePermission('finance:read'), route(async (req) => statements.candidatesFor(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/lines/:id/match', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(matchBody, req);
  return statements.matchLine(await requestTx(), me().churchId, me().userId, params.id, body.journalLineIds);
}));
router.delete('/lines/:id/match', requirePermission('finance:post'), route(async (req) => statements.unmatchLine(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/lines/:id/ignore', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(ignoreBody, req);
  return statements.ignoreLine(await requestTx(), me().churchId, params.id, body.reason);
}));
router.post('/lines/:id/unignore', requirePermission('finance:post'), route(async (req) => statements.unignoreLine(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/lines/:id/create-entry', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(createEntryBody, req);
  return statements.createEntryFromLine(await requestTx(), me().churchId, me().userId, params.id, body);
}, 201));

router.get('/accounts/:id/reconciliations', requirePermission('finance:read'), route(async (req) => recs.listReconciliations(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/accounts/:id/reconciliations', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(recOpen, req);
  return recs.openReconciliation(await requestTx(), me().churchId, me().userId, params.id, {
    statementDate: body.statementDate, statementBalanceMinor: body.statementBalance, openingBalanceMinor: body.openingBalance
  });
}, 201));
router.get('/reconciliations/:id', requirePermission('finance:read'), route(async (req) => recs.getReconciliation(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.post('/reconciliations/:id/finalize', requirePermission('finance:close'), route(async (req) => recs.finalizeReconciliation(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.delete('/reconciliations/:id', requirePermission('finance:post'), route(async (req) => {
  await recs.deleteReconciliation(await requestTx(), me().churchId, input(idOnly, req).params.id);
  return undefined;
}, 204));

const mounts: RouteMount[] = [{ path: '/banking', router }];
export default mounts;

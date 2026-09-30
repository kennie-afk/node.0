import { Request, Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { input, requestTx, route } from '../../common/http';
import { preferReplica } from '../../common/tenant-db';
import { cached } from '../../common/cache';
import { select } from '../finance/sql';
import { ensureFinanceSetup } from '../finance/setup.service';
import { accountRegister } from '../finance/journal.service';
import { csvRoute } from './csv';
import type { RouteMount } from '../types';
import * as s from './schemas';
import * as statements from './statements.service';
import * as giving from './giving.reports';
import * as csvs from './csvs';
import { dashboard } from './dashboard.service';

const router = Router();
router.use(authenticateToken);

// The first report request for a church in this process goes to the primary, where the books are
// created if they never were. From then on reports are read-only and go to a replica (when one is
// configured); the cache bounds how stale they can be.
const booksReady = new Set<number>();
router.use(async (req, res, next) => {
  try {
    const id = currentTenant().churchId;
    if (booksReady.has(id)) return preferReplica(req, res, next);
    await ensureFinanceSetup(await requestTx(), id);
    booksReady.add(id);
    next();
  } catch (error) {
    next(error);
  }
});

const churchId = () => currentTenant().churchId;

/** "Today" as the congregation sees it, not as the server's UTC clock does. */
async function churchToday(): Promise<string> {
  const t = await requestTx();
  const row = (await select<any>(t, `SELECT timezone FROM churches WHERE id = :id`, { id: churchId() }))[0];
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: row?.timezone ?? 'Africa/Nairobi' });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Builds a report endpoint that serves JSON, or a CSV download with `?format=csv`. The computed
 * JSON is cached per church until the next ledger write; CSV is rendered from the same result.
 */
function report<Q extends { format?: 'json' | 'csv' }>(
  name: string,
  parse: (req: Request) => Q,
  compute: (q: Q, today: string) => Promise<unknown>,
  toCsv: (result: any) => { filename: string; body: string }
) {
  const load = async (req: Request) => {
    const q = parse(req);
    const today = await churchToday();
    const { format, ...params } = q;
    const result = await cached(churchId(), name, { ...params, today }, () => compute(q, today));
    return { format, result };
  };
  return [
    (req: Request, res: any, next: any) =>
      load(req)
        .then(({ format, result }) => {
          if (format === 'csv') {
            const { filename, body } = toCsv(result);
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
            return res.status(200).send(body);
          }
          return res.status(200).json(result);
        })
        .catch(next)
  ];
}

const read = requirePermission('finance:read');
const readGiving = requirePermission('giving:read', 'finance:read');

router.get(
  '/income-statement',
  read,
  ...report('income', (req) => input(s.incomeQuery, req).query, async (q, today) => {
    const t = await requestTx();
    const range = await statements.resolveRange(t, churchId(), q, today);
    return statements.incomeStatement(t, churchId(), { ...range, fundId: q.fundId, compare: q.compare, byFund: q.byFund });
  }, csvs.incomeStatementCsv)
);

router.get(
  '/balance-sheet',
  read,
  ...report('balance', (req) => input(s.asOfQuery, req).query, async (q, today) => statements.balanceSheet(await requestTx(), churchId(), { asOf: q.asOf ?? today, fundId: q.fundId }), csvs.balanceSheetCsv)
);

router.get(
  '/cash-flow',
  read,
  ...report('cashflow', (req) => input(s.rangeQuery, req).query, async (q, today) => {
    const t = await requestTx();
    const range = await statements.resolveRange(t, churchId(), q, today);
    return statements.cashFlow(t, churchId(), { ...range, fundId: q.fundId });
  }, csvs.cashFlowCsv)
);

router.get(
  '/fund-balances',
  read,
  ...report('funds', (req) => input(s.asOfQuery, req).query, async (q, today) => statements.fundBalances(await requestTx(), churchId(), q.asOf ?? today), csvs.fundBalancesCsv)
);

router.get(
  '/general-ledger',
  read,
  ...report('gl', (req) => input(s.rangeQuery, req).query, async (q, today) => {
    const t = await requestTx();
    const range = await statements.resolveRange(t, churchId(), q, today);
    return statements.generalLedgerSummary(t, churchId(), { ...range, fundId: q.fundId });
  }, csvs.generalLedgerCsv)
);

// One account's running-balance detail, paged by cursor (CSV: the requested page).
router.get('/general-ledger/:accountId', read, async (req, res, next) => {
  try {
    const { params, query } = input(s.registerQuery, req);
    const t = await requestTx();
    const today = await churchToday();
    const { format, ...rest } = query;
    const result = await cached(churchId(), 'register', { params, rest, today }, () => accountRegister(t, churchId(), params.accountId, rest));
    if (format === 'csv') {
      const { filename, body } = csvs.registerCsv(result);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
      return res.status(200).send(body);
    }
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

router.get(
  '/expenses/by-ministry',
  read,
  ...report('ministry', (req) => input(s.rangeQuery, req).query, async (q, today) => {
    const t = await requestTx();
    const range = await statements.resolveRange(t, churchId(), q, today);
    return statements.expenseByMinistry(t, churchId(), { ...range, fundId: q.fundId });
  }, csvs.ministryCsv)
);

const givingRange = async (q: { from?: string; to?: string; yearId?: number }, today: string) => statements.resolveRange(await requestTx(), churchId(), q, today);

router.get('/giving/by-type', readGiving, ...report('g-type', (req) => input(s.rangeQuery, req).query, async (q, today) => giving.givingByType(await requestTx(), churchId(), await givingRange(q, today)), csvs.byTypeCsv));
router.get('/giving/by-month', readGiving, ...report('g-month', (req) => input(s.rangeQuery, req).query, async (q, today) => giving.givingByMonth(await requestTx(), churchId(), await givingRange(q, today)), csvs.byMonthCsv));
router.get('/giving/by-fund', readGiving, ...report('g-fund', (req) => input(s.rangeQuery, req).query, async (q, today) => giving.givingByFund(await requestTx(), churchId(), await givingRange(q, today)), csvs.byFundCsv));
router.get('/giving/top-givers', readGiving, ...report('g-top', (req) => input(s.topQuery, req).query, async (q, today) => giving.topGivers(await requestTx(), churchId(), { ...(await givingRange(q, today)), limit: q.limit }), csvs.topGiversCsv));
router.get('/giving/lapsed', readGiving, ...report('g-lapsed', (req) => input(s.lapsedQuery, req).query, async (q, today) => giving.lapsedGivers(await requestTx(), churchId(), { asOf: q.asOf ?? today, quietMonths: q.quietMonths, lookbackMonths: q.lookbackMonths, limit: q.limit }), csvs.lapsedCsv));
router.get('/giving/retention', readGiving, ...report('g-retention', (req) => input(s.retentionQuery, req).query, async (q) => giving.donorRetention(await requestTx(), churchId(), { year: q.year }), csvs.retentionCsv));
router.get('/giving/average-gift', readGiving, ...report('g-average', (req) => input(s.rangeQuery, req).query, async (q, today) => giving.averageGift(await requestTx(), churchId(), await givingRange(q, today)), (r) => ({ filename: 'average-gift.csv', body: `Measure,Value\r\nGifts,${r.gifts}\r\nIdentified donors,${r.identifiedDonors}\r\nTotal,${r.total}\r\nAverage gift,${r.averageGift}\r\nAverage per donor,${r.averagePerDonor}\r\n` })));

router.get(
  '/dashboard',
  requirePermission('finance:read', 'giving:read'),
  route(async () => {
    const today = await churchToday();
    return cached(churchId(), 'dashboard', { today }, async () => dashboard(await requestTx(), churchId(), today));
  })
);

void csvRoute;
const mounts: RouteMount[] = [{ path: '/reports', router }];
export default mounts;

import { Router } from 'express';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { idempotent } from '../../common/idempotency';
import { input, requestTx, route } from '../../common/http';
import { fromMinor, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { ConflictError } from '../../utils/errors';
import type { RouteMount } from '../types';
import { ensureFinanceSetup, loadSettings } from './setup.service';
import { createFund, listFunds, updateFund } from './funds.service';
import { createAccount, deleteAccount, listAccounts, updateAccount } from './accounts.service';
import { accountRegister, getEntry, listJournal, postTransfer } from './journal.service';
import { postEntry, reverseEntry, verifyLedger } from './ledger.service';
import { closeFiscalYear } from './closing.service';
import { closePeriod, listFiscalYears, reopenPeriod } from './periods.service';
import { trialBalance } from './balances.service';
import { recordAudit, verifyAuditChain } from './audit.service';
import { checkHeadAgainstDatabase, currentHead, loadExportedHead } from './chain-head';
import { exec, select, selectOne } from './sql';
import * as s from './schemas';
import { iso } from './chain';
import { preferReplica } from '../../common/tenant-db';

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

// ---- settings -----------------------------------------------------------------------------

function settingsDto(row: Awaited<ReturnType<typeof loadSettings>>) {
  return {
    baseCurrency: row.baseCurrency,
    fiscalYearStartMonth: row.fiscalYearStartMonth,
    approvalThreshold: fromMinor(row.approvalThresholdMinor),
    dualApprovalThreshold: fromMinor(row.dualApprovalThresholdMinor),
    requireSeparationOfDuties: row.requireSeparationOfDuties,
    allowRestrictedOverspend: row.allowRestrictedOverspend,
    receiptPrefix: row.receiptPrefix
  };
}

router.get('/settings', requirePermission('finance:read'), route(async () => settingsDto(await loadSettings(await requestTx(), me().churchId))));

router.put(
  '/settings',
  requirePermission('finance:settings'),
  route(async (req) => {
    const { body } = input(s.settingsBody, req);
    const t = await requestTx();
    const { churchId, userId } = me();
    const current = await loadSettings(t, churchId);
    if (body.fiscalYearStartMonth && body.fiscalYearStartMonth !== current.fiscalYearStartMonth) {
      const posted = await selectOne(t, `SELECT 1 AS x FROM journal_entries WHERE church_id = :churchId LIMIT 1`, { churchId });
      if (posted) throw new ConflictError('the fiscal year cannot move once anything has been posted');
      await exec(t, `DELETE FROM fiscal_periods WHERE church_id = :churchId`, { churchId });
      await exec(t, `DELETE FROM fiscal_years WHERE church_id = :churchId`, { churchId });
    }
    await exec(
      t,
      `UPDATE finance_settings SET base_currency = :currency, fiscal_year_start_month = :month, approval_threshold_minor = :approval,
         dual_approval_threshold_minor = :dual, require_separation_of_duties = :sod, allow_restricted_overspend = :overspend,
         receipt_prefix = :prefix, updated_at = :now WHERE church_id = :churchId`,
      {
        currency: body.baseCurrency ?? current.baseCurrency,
        month: body.fiscalYearStartMonth ?? current.fiscalYearStartMonth,
        approval: body.approvalThreshold ?? current.approvalThresholdMinor,
        dual: body.dualApprovalThreshold ?? current.dualApprovalThresholdMinor,
        sod: body.requireSeparationOfDuties ?? current.requireSeparationOfDuties,
        overspend: body.allowRestrictedOverspend ?? current.allowRestrictedOverspend,
        prefix: body.receiptPrefix ?? current.receiptPrefix,
        now: new Date(),
        churchId
      }
    );
    await recordAudit(t, churchId, { action: 'settings.update', entityType: 'finance_settings', entityId: churchId, actorId: userId, data: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)])) });
    return settingsDto(await loadSettings(t, churchId));
  })
);

// ---- funds & accounts ---------------------------------------------------------------------

router.get(
  '/funds',
  requirePermission('finance:read'),
  route(async (req) => {
    const rows = await listFunds(await requestTx(), me().churchId, req.query.includeInactive === 'true');
    return rows.map((f) => ({ ...f, position: fromMinor(f.position) }));
  })
);
router.post('/funds', requirePermission('finance:post'), route(async (req) => createFund(await requestTx(), me().churchId, me().userId, input(s.fundCreate, req).body), 201));
router.put('/funds/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(s.fundUpdate, req);
  return updateFund(await requestTx(), me().churchId, me().userId, params.id, body);
}));

router.get(
  '/accounts',
  requirePermission('finance:read'),
  route(async (req) =>
    listAccounts(await requestTx(), me().churchId, {
      type: typeof req.query.type === 'string' ? req.query.type : undefined,
      includeInactive: req.query.includeInactive === 'true',
      postableOnly: req.query.postable === 'true'
    })
  )
);
router.post('/accounts', requirePermission('finance:post'), route(async (req) => createAccount(await requestTx(), me().churchId, me().userId, input(s.accountCreate, req).body), 201));
router.put('/accounts/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(s.accountUpdate, req);
  return updateAccount(await requestTx(), me().churchId, me().userId, params.id, body);
}));
router.delete('/accounts/:id', requirePermission('finance:post'), route(async (req) => {
  await deleteAccount(await requestTx(), me().churchId, me().userId, input(s.idOnly, req).params.id);
  return undefined;
}, 204));

router.get(
  '/accounts/:id/register',
  requirePermission('finance:read'),
  route(async (req) => {
    const { params, query } = input(s.registerQuery, req);
    return accountRegister(await requestTx(), me().churchId, params.id, query);
  })
);

// ---- fiscal calendar ----------------------------------------------------------------------

router.get('/fiscal-years', requirePermission('finance:read'), route(async () => listFiscalYears(await requestTx(), me().churchId)));
router.post('/periods/:id/close', requirePermission('finance:close'), route(async (req) => closePeriod(await requestTx(), me().churchId, input(s.idOnly, req).params.id, me().userId)));
router.post('/periods/:id/reopen', requirePermission('finance:settings'), route(async (req) => {
  const { params, body } = input(s.reopenBody, req);
  return reopenPeriod(await requestTx(), me().churchId, params.id, me().userId, body.reason);
}));
router.post('/fiscal-years/:id/close', requirePermission('finance:close'), route(async (req) => closeFiscalYear(await requestTx(), me().churchId, input(s.idOnly, req).params.id, me().userId)));

// ---- journal ------------------------------------------------------------------------------

router.get('/journal', requirePermission('finance:read'), route(async (req) => listJournal(await requestTx(), me().churchId, input(s.journalList, req).query)));
router.get('/journal/:id', requirePermission('finance:read'), route(async (req) => getEntry(await requestTx(), me().churchId, input(s.idOnly, req).params.id)));

router.post(
  '/journal',
  requirePermission('finance:post'),
  idempotent(),
  route(async (req) => {
    const { body } = input(s.journalCreate, req);
    const t = await requestTx();
    const { churchId, userId } = me();
    const posted = await postEntry(
      {
        entryDate: body.date,
        memo: body.memo,
        sourceType: 'MANUAL',
        actorId: userId,
        lines: body.lines.map((l) => ({ ...l, debit: l.debit ?? 0, credit: l.credit ?? 0 })),
        idempotencyKey: req.header('idempotency-key') ?? null
      },
      t,
      churchId
    );
    return getEntry(t, churchId, posted.id);
  }, 201)
);

router.post('/journal/:id/reverse', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(s.reverseBody, req);
  const t = await requestTx();
  const { churchId, userId } = me();
  const reversal = await reverseEntry(t, churchId, params.id, { reason: body.reason, date: body.date ?? today(), actorId: userId });
  await recordAudit(t, churchId, { action: 'journal.reverse', entityType: 'journal_entry', entityId: params.id, actorId: userId, data: { reason: body.reason, reversalId: reversal.id } });
  return getEntry(t, churchId, reversal.id);
}, 201));

router.post('/transfers', requirePermission('finance:post'), idempotent(), route(async (req) => {
  const { body } = input(s.transferBody, req);
  const t = await requestTx();
  const { churchId, userId } = me();
  const posted = await postTransfer(t, churchId, {
    date: body.date,
    fromFundId: body.fromFundId,
    toFundId: body.toFundId,
    amountMinor: body.amount,
    memo: body.memo,
    accountId: body.accountId,
    actorId: userId,
    idempotencyKey: req.header('idempotency-key') ?? null
  });
  return getEntry(t, churchId, posted.id);
}, 201));

// ---- statements & integrity ---------------------------------------------------------------

router.get(
  '/trial-balance',
  requirePermission('finance:read'),
  preferReplica,
  route(async (req) => {
    const { query } = input(s.trialBalanceQuery, req);
    const report = await trialBalance(await requestTx(), me().churchId, query.asOf ?? today(), query.fundId);
    return {
      asOf: report.asOf,
      lines: report.lines.map((l) => ({ ...l, debit: fromMinor(l.debit), credit: fromMinor(l.credit) })),
      totalDebit: fromMinor(report.totalDebit),
      totalCredit: fromMinor(report.totalCredit),
      balanced: report.totalDebit === report.totalCredit
    };
  })
);

router.get('/integrity', requirePermission('audit:read'), route(async () => {
  const t = await requestTx();
  const { churchId } = me();
  const [ledger, audit] = await Promise.all([verifyLedger(t, churchId), verifyAuditChain(t, churchId)]);
  return { ok: ledger.ok && audit.ok, ledger, audit };
}));

/**
 * The chain heads as the database holds them now, the last head pinned off-database, and whether the
 * database still agrees with that export. A mismatch here means history changed after the export
 * even if every hash inside the database is self-consistent.
 */
router.get('/audit/head', requirePermission('audit:read'), route(async () => {
  const t = await requestTx();
  const { churchId } = me();
  const head = await currentHead(t, churchId);
  const exported = await loadExportedHead(churchId);
  const check = exported ? await checkHeadAgainstDatabase(t, churchId, exported) : null;
  return { head, lastExport: exported, exportCheck: check, exportConfigured: true };
}));

router.get('/audit', requirePermission('audit:read'), route(async (req) => {
  const { query } = input(s.auditQuery, req);
  const { churchId } = me();
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  for (const [column, value] of [['entity_type', query.entityType], ['entity_id', query.entityId], ['action', query.action]] as const) {
    if (value) {
      where.push(`${column} = ?`);
      params.push(value);
    }
  }
  const cursor = decodeCursor<{ seq: number }>(query.cursor);
  if (cursor) {
    where.push('seq < ?');
    params.push(cursor.seq);
  }
  const rows = await select<any>(await requestTx(), `SELECT * FROM audit_events WHERE ${where.join(' AND ')} ORDER BY seq DESC LIMIT ?`, [...params, query.limit + 1]);
  return toKeysetPage(
    rows.map((r) => ({
      seq: toInt(r.seq),
      actorId: r.actor_id === null ? null : toInt(r.actor_id),
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      occurredAt: iso(r.occurred_at),
      hash: String(r.hash).trim()
    })),
    query.limit,
    (row) => ({ seq: row.seq })
  );
}));

const mounts: RouteMount[] = [{ path: '/finance', router }];
export default mounts;

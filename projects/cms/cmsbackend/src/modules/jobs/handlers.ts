import { QueryTypes } from 'sequelize';
import db from '@models';
import { logger } from '../../common/logger';
import { requestTx } from '../../common/http';
import { enqueueSystemJob, purgeOld, registerJobHandler } from './queue';
import { recordAudit, verifyAuditChain } from '../finance/audit.service';
import { verifyLedger } from '../finance/ledger.service';
import { selectOne } from '../finance/sql';
import { checkHeadAgainstDatabase, currentHead, exportHead, loadExportedHead } from '../finance/chain-head';

/** Deletes finished jobs after 30 days and idempotency keys after 48 hours (their useful life). */
registerJobHandler('maintenance.purge', async () => {
  const result = await purgeOld(30, 48);
  logger.info('maintenance purge', result);
});

/** Fans the nightly integrity check out to one job per church, so one slow ledger blocks no other. */
registerJobHandler('ledger.verify-all', async (payload) => {
  const day = String(payload.day ?? new Date().toISOString().slice(0, 10));
  const churches = (await db.sequelize.query('SELECT id FROM churches WHERE is_active = :active', {
    replacements: { active: true },
    type: QueryTypes.SELECT,
    transaction: null
  })) as Array<{ id: number }>;
  for (const church of churches) {
    await enqueueSystemJob({ type: 'ledger.verify', churchId: Number(church.id), dedupeKey: `verify:${day}`, payload: { day } });
  }
  logger.info('ledger verification fanned out', { churches: churches.length, day });
});

/**
 * Recomputes every hash and running balance for one church and records the verdict in that
 * church's own audit chain, so an auditor sees "integrity verified on <date>" (or the failure).
 */
registerJobHandler('ledger.verify', async (_payload, { churchId }) => {
  const t = await requestTx();
  const hasBooks = await selectOne(t, 'SELECT church_id FROM finance_settings WHERE church_id = :churchId', { churchId });
  if (!hasBooks) return;
  const ledger = await verifyLedger(t, churchId!);
  const audit = await verifyAuditChain(t, churchId!);
  const ok = ledger.ok && audit.ok;
  if (!ok) logger.error('LEDGER INTEGRITY FAILURE', { churchId, ledger: ledger.issues.slice(0, 5), audit: audit.issues.slice(0, 5) });
  await recordAudit(t, churchId!, {
    action: ok ? 'integrity.verified' : 'integrity.FAILED',
    entityType: 'ledger',
    actorId: null,
    data: { entries: ledger.entries, auditEvents: audit.events, issues: ledger.issues.length + audit.issues.length, first: ledger.issues[0] ?? audit.issues[0] ?? '' }
  });
});

/** Fans the nightly chain-head export out to one job per church. */
registerJobHandler('chain.head-export-all', async (payload) => {
  const day = String(payload.day ?? new Date().toISOString().slice(0, 10));
  const churches = (await db.sequelize.query('SELECT id FROM churches WHERE is_active = :active', {
    replacements: { active: true },
    type: QueryTypes.SELECT,
    transaction: null
  })) as Array<{ id: number }>;
  for (const church of churches) {
    await enqueueSystemJob({ type: 'chain.head-export', churchId: Number(church.id), dedupeKey: `head:${day}`, payload: { day } });
  }
  logger.info('chain head export fanned out', { churches: churches.length, day });
});

/**
 * Pins one church's chain heads outside the database. Before writing the new head the previous
 * export is checked against the database: if history changed since, that is logged loudly and
 * written to the audit chain (the new export still goes out, so the evidence of the current state
 * is preserved, and the failure is on record).
 */
registerJobHandler('chain.head-export', async (_payload, { churchId }) => {
  const t = await requestTx();
  const hasBooks = await selectOne(t, 'SELECT church_id FROM finance_settings WHERE church_id = :churchId', { churchId });
  if (!hasBooks) return;
  const previous = await loadExportedHead(churchId!);
  if (previous) {
    const check = await checkHeadAgainstDatabase(t, churchId!, previous);
    if (!check.ok) {
      logger.error('CHAIN HEAD MISMATCH', { churchId, issues: check.issues.slice(0, 5) });
      await recordAudit(t, churchId!, { action: 'integrity.HEAD_MISMATCH', entityType: 'ledger', actorId: null, data: { exportedAt: previous.takenAt, first: check.issues[0] } });
    }
  }
  const result = await exportHead(await currentHead(t, churchId!));
  logger.info('chain head exported', { churchId, ...result });
});

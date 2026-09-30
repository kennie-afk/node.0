import { QueryTypes } from 'sequelize';
import db from '@models';
import { logger } from '../../common/logger';
import { requestTx } from '../../common/http';
import { enqueueSystemJob, purgeOld, registerJobHandler } from './queue';
import { recordAudit, verifyAuditChain } from '../finance/audit.service';
import { verifyLedger } from '../finance/ledger.service';
import { selectOne } from '../finance/sql';

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

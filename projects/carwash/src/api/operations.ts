/**
 * Operator modules: voiding/refunding a paid job, the commission report, the activity feed and CSV
 * exports. Reads go through the same listing functions the console uses.
 */
import { Router } from 'express';
import { z } from 'zod';
import { withOrg } from '../persistence/pool';
import { authenticate, requireRole, requireWritable } from './middleware';
import { staffOnly } from './read';
import { listSite } from './scope';
import { csvLine, kes, streamCsv } from './csv';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { assertTransition, JobState } from '../domain/job';
import { recordJobEvent, transitionJob } from '../persistence/repositories';
import { eventsPage, flagsPage, jobsPage, paymentsPage } from '../persistence/listings';
import { optionalDay, optionalUuid } from '../persistence/paging';
import { recloseIfClosed } from '../reconciliation/service';
import { logger } from '../common/logger';

const router = Router();

// ---- void / refund ---------------------------------------------------------------------------

const voidBody = z.object({ reason: z.string().trim().min(5, 'say why this sale is being reversed').max(500) });

/**
 * Reverses a paid job. The payment row is never edited away: it is stamped reversed and a row in the
 * append-only payment_reversals records who did it, how much, and why. The job moves to `voided`, so it
 * stops counting as work done and the payment stops counting as money received: the day balances again
 * without the sale, and the trail shows exactly who removed it. Forecourt records the refund; it does not
 * send the money back (a refund through M-Pesa is still made by the business, in its own till).
 */
router.post('/jobs/:id/void', authenticate, requireRole('supervisor', 'manager', 'owner'), requireWritable, async (req, res, next) => {
  try {
    const { reason } = parseBody(voidBody, req.body);
    const id = z.string().uuid().parse(req.params.id);
    const caller = req.principal!;
    const out = await withOrg(caller.orgId, async (client) => {
      const { rows } = await client.query('SELECT state, site_id, created_at::date::text AS day FROM jobs WHERE id = $1 FOR UPDATE', [id]);
      const job = rows[0];
      if (!job || (caller.siteId && job.site_id !== caller.siteId)) throw new NotFoundError('That job was not found.');
      try {
        assertTransition(job.state as JobState, 'voided');
      } catch {
        throw new ConflictError(`A job in ${job.state} cannot be voided; only a paid job can be refunded.`);
      }
      const payments = await client.query('SELECT id, amount_cents, received_at::date::text AS day FROM payments WHERE job_id = $1 AND reversed_at IS NULL FOR UPDATE', [id]);
      if (payments.rows.length === 0) throw new ConflictError('That job has no payment to reverse.');

      let refunded = 0;
      for (const payment of payments.rows) {
        await client.query(
          `INSERT INTO payment_reversals (org_id, payment_id, job_id, amount_cents, reason, actor_id) VALUES ($1,$2,$3,$4,$5,$6)`,
          [caller.orgId, payment.id, id, payment.amount_cents, reason, caller.userId]
        );
        await client.query('UPDATE payments SET reversed_at = now() WHERE id = $1', [payment.id]);
        refunded += Number(payment.amount_cents);
      }
      await transitionJob(client, id, 'voided');
      await recordJobEvent(client, {
        orgId: caller.orgId,
        jobId: id,
        type: 'job.voided',
        actorId: caller.userId,
        payload: { reason, refundedCents: refunded, paymentIds: payments.rows.map((payment) => payment.id) },
        clientTs: null
      });
      return { refundedCents: refunded, payments: payments.rows.length, siteId: job.site_id as string, days: [job.day as string, ...payments.rows.map((payment) => payment.day as string)] };
    });
    // the sale no longer counts, so a day already reconciled is recomputed without it (a failure here must not undo the refund)
    await recloseIfClosed(caller.orgId, out.siteId, out.days).catch((error) =>
      logger.error('could not recompute the day after a void', { error: error instanceof Error ? error.message : String(error) })
    );
    res.json({ id, state: 'voided', refundedCents: out.refundedCents, payments: out.payments });
  } catch (error) {
    next(error);
  }
});

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new BadRequestError(result.error.issues.map((issue) => issue.message).join('; '));
  return result.data;
}

// ---- commission ------------------------------------------------------------------------------

const commissionRoles = requireRole('owner', 'manager');

async function commissionRows(orgId: string, siteId: string | null, query: Record<string, unknown>) {
  const from = optionalDay(query.from, 'from');
  const to = optionalDay(query.to, 'to');
  const wanted = siteId ?? optionalUuid(query.siteId, 'siteId');
  return withOrg(orgId, async (client) => {
    const { rows } = await client.query(
      `SELECT j.worker_id, u.display_name AS worker, count(DISTINCT j.id) AS jobs,
              COALESCE(sum(js.unit_price_cents * js.qty), 0) AS gross_cents,
              COALESCE(sum(round(js.unit_price_cents * js.qty * sv.commission_rate)), 0)::bigint AS commission_cents
         FROM jobs j
         JOIN users u ON u.id = j.worker_id
         JOIN job_services js ON js.job_id = j.id
         JOIN services sv ON sv.id = js.service_id
        WHERE j.state IN ('paid', 'closed')
          AND ($1::uuid IS NULL OR j.site_id = $1)
          AND ($2::date IS NULL OR j.created_at >= $2::date)
          AND ($3::date IS NULL OR j.created_at < $3::date + 1)
        GROUP BY j.worker_id, u.display_name
        ORDER BY commission_cents DESC, u.display_name`,
      [wanted, from, to]
    );
    return rows.map((row) => ({
      workerId: row.worker_id as string,
      worker: row.worker as string,
      jobs: Number(row.jobs),
      grossCents: Number(row.gross_cents),
      commissionCents: Number(row.commission_cents)
    }));
  });
}

router.get('/reports/commissions', authenticate, commissionRoles, async (req, res, next) => {
  try {
    const rows = await commissionRows(req.principal!.orgId, listSite(req), req.query);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="commissions.csv"');
      res.send(
        csvLine(['worker', 'jobs', 'sales_kes', 'commission_kes', 'sales_cents', 'commission_cents']) +
          rows.map((row) => csvLine([row.worker, row.jobs, kes(row.grossCents), kes(row.commissionCents), row.grossCents, row.commissionCents])).join('')
      );
      return;
    }
    res.json({
      rows,
      totals: {
        jobs: rows.reduce((sum, row) => sum + row.jobs, 0),
        grossCents: rows.reduce((sum, row) => sum + row.grossCents, 0),
        commissionCents: rows.reduce((sum, row) => sum + row.commissionCents, 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

// ---- activity feed ---------------------------------------------------------------------------

router.get('/events', authenticate, staffOnly, async (req, res, next) => {
  try {
    res.json(await withOrg(req.principal!.orgId, (client) => eventsPage(client, { siteId: listSite(req) }, req.query)));
  } catch (error) {
    next(error);
  }
});

// ---- CSV exports (the full filtered set, not one page) ---------------------------------------

router.get('/export/jobs.csv', authenticate, staffOnly, (req, res, next) => {
  const { orgId } = req.principal!;
  const scope = { siteId: listSite(req) };
  const query = { ...req.query, limit: '1000' };
  void streamCsv(
    res,
    'jobs.csv',
    ['id', 'created_at', 'site', 'plate', 'worker', 'state', 'quoted_kes', 'list_kes', 'quoted_cents', 'list_cents', 'paid', 'closed_at'],
    (after) => withOrg(orgId, (client) => jobsPage(client, scope, { ...query, after: after ?? undefined })),
    (job) => [job.id, job.createdAt, job.site, job.plate, job.worker, job.state, kes(job.quotedCents), kes(job.listCents), job.quotedCents, job.listCents, job.paid, job.closedAt]
  ).catch(next);
});

router.get('/export/payments.csv', authenticate, staffOnly, (req, res, next) => {
  const { orgId } = req.principal!;
  const scope = { siteId: listSite(req) };
  const query = { ...req.query, limit: '1000' };
  void streamCsv(
    res,
    'payments.csv',
    ['id', 'received_at', 'site', 'channel', 'amount_kes', 'amount_cents', 'reference', 'job_id', 'matched', 'reversed'],
    (after) => withOrg(orgId, (client) => paymentsPage(client, scope, { ...query, after: after ?? undefined })),
    (payment) => [payment.id, payment.receivedAt, payment.site, payment.channel, kes(payment.amountCents), payment.amountCents, payment.reference, payment.jobId, payment.matched, payment.reversed]
  ).catch(next);
});

router.get('/export/flags.csv', authenticate, staffOnly, (req, res, next) => {
  const { orgId } = req.principal!;
  const scope = { siteId: listSite(req) };
  const query = { ...req.query, limit: '1000' };
  void streamCsv(
    res,
    'flags.csv',
    ['id', 'business_day', 'site', 'type', 'severity', 'state', 'estimated_kes', 'estimated_cents', 'summary', 'resolution_note'],
    (after) => withOrg(orgId, (client) => flagsPage(client, scope, { ...query, after: after ?? undefined })),
    (flag) => [flag.id, flag.businessDay, flag.site, flag.type, flag.severity, flag.state, kes(flag.estimatedCents), flag.estimatedCents, flag.summary, flag.resolutionNote]
  ).catch(next);
});

export default router;

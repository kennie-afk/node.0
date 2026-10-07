/**
 * What is about to lapse or fall due: a guard's PSRA registration (the date the firm typed), training certificates and issued equipment
 * that should come back. And the outbox that turns those into SMS: alerts are queued once per item and date, then a dispatcher sends them
 * through the configured provider, retrying with a back-off. Nothing here is verified with PSRA or any issuer.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, need } from '../common/context';
import { addDays, localDayOf } from '../common/time';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { withOrg, withoutTenant } from '../persistence/pool';
import { sendMessage } from '../notify/provider';
import { logger } from '../common/logger';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const trainingSchema = z.object({ title: z.string().trim().min(2).max(120), certificateNo: z.string().trim().max(60).optional().nullable(), issuedOn: day.optional().nullable(), expiresOn: day.optional().nullable() });
export const equipmentSchema = z.object({ item: z.string().trim().min(2).max(120), serialNo: z.string().trim().max(60).optional().nullable(), issuedOn: day, returnDueOn: day.optional().nullable() });

async function guardInScope(client: PoolClient, ctx: Ctx, guardId: string) {
  const g = (await client.query('SELECT id, branch_id FROM guards WHERE id = $1', [guardId])).rows[0];
  if (!g || (ctx.branchId && g.branch_id !== ctx.branchId)) throw new NotFoundError('That guard was not found.');
}

export async function addTraining(client: PoolClient, ctx: Ctx, guardId: string, input: z.infer<typeof trainingSchema>) {
  need(ctx, 'guards_write');
  await guardInScope(client, ctx, guardId);
  const id = (await client.query('INSERT INTO guard_training (org_id, guard_id, title, certificate_no, issued_on, expires_on, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [ctx.orgId, guardId, input.title, input.certificateNo ?? null, input.issuedOn ?? null, input.expiresOn ?? null, ctx.userId])).rows[0].id as string;
  await audit(client, ctx, 'guard.training_add', 'guard', guardId, { title: input.title, expiresOn: input.expiresOn ?? null });
  return { id };
}

export async function addEquipment(client: PoolClient, ctx: Ctx, guardId: string, input: z.infer<typeof equipmentSchema>) {
  need(ctx, 'guards_write');
  await guardInScope(client, ctx, guardId);
  const id = (await client.query('INSERT INTO equipment_issues (org_id, guard_id, item, serial_no, issued_on, return_due_on, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [ctx.orgId, guardId, input.item, input.serialNo ?? null, input.issuedOn, input.returnDueOn ?? null, ctx.userId])).rows[0].id as string;
  await audit(client, ctx, 'guard.equipment_issue', 'guard', guardId, { item: input.item });
  return { id };
}

export async function returnEquipment(client: PoolClient, ctx: Ctx, id: string, returnedOn: string) {
  need(ctx, 'guards_write');
  const row = (await client.query('SELECT e.id, e.guard_id, e.issued_on, e.returned_on, g.branch_id FROM equipment_issues e JOIN guards g ON g.id = e.guard_id WHERE e.id = $1 FOR UPDATE OF e', [id])).rows[0];
  if (!row || (ctx.branchId && row.branch_id !== ctx.branchId)) throw new NotFoundError('That equipment record was not found.');
  if (row.returned_on) throw new ConflictError('That item is already marked returned.');
  try {
    await client.query('UPDATE equipment_issues SET returned_on = $2 WHERE id = $1', [id, returnedOn]);
  } catch (error) {
    if ((error as { code?: string }).code === '23514') throw new BadRequestError('It cannot be returned before it was issued.');
    throw error;
  }
  await audit(client, ctx, 'guard.equipment_return', 'guard', row.guard_id, {});
  return { id, returnedOn };
}

const ITEMS = `
  SELECT 'psra' AS kind, g.id AS ref_id, g.id AS guard_id, g.full_name AS guard, g.guard_no, g.phone, g.branch_id, 'PSRA registration (as typed by the firm)' AS label, g.psra_expiry AS due
    FROM guards g WHERE g.status = 'active' AND g.psra_expiry IS NOT NULL AND g.psra_expiry <= $1::date
  UNION ALL
  SELECT 'training', t.id, g.id, g.full_name, g.guard_no, g.phone, g.branch_id, t.title, t.expires_on
    FROM guard_training t JOIN guards g ON g.id = t.guard_id WHERE g.status = 'active' AND t.expires_on IS NOT NULL AND t.expires_on <= $1::date
  UNION ALL
  SELECT 'equipment', e.id, g.id, g.full_name, g.guard_no, g.phone, g.branch_id, 'Return ' || e.item, e.return_due_on
    FROM equipment_issues e JOIN guards g ON g.id = e.guard_id WHERE e.returned_on IS NULL AND e.return_due_on IS NOT NULL AND e.return_due_on <= $1::date`;

/** Everything already past due or due within `days`, soonest first, paged in SQL. */
export async function expiries(client: PoolClient, ctx: Ctx, opts: { days: number; page: number; pageSize: number }) {
  const today = localDayOf(new Date());
  const horizon = addDays(today, opts.days);
  const scope = ctx.branchId ? 'WHERE x.branch_id = $2' : '';
  const params: unknown[] = ctx.branchId ? [horizon, ctx.branchId] : [horizon];
  const total = Number((await client.query(`SELECT count(*) AS n FROM (${ITEMS}) x ${scope}`, params)).rows[0].n);
  const rows = (await client.query(
    `SELECT x.kind, x.ref_id, x.guard_id, x.guard, x.guard_no, x.label, to_char(x.due, 'YYYY-MM-DD') AS due, (x.due - $${params.length + 1}::date)::int AS days_left
       FROM (${ITEMS}) x ${scope} ORDER BY x.due, x.guard_no, x.kind, x.ref_id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, [...params, today])).rows;
  return {
    today, days: opts.days, total, page: opts.page, pageSize: opts.pageSize,
    items: rows.map((r) => ({ kind: r.kind as string, refId: r.ref_id as string, guardId: r.guard_id as string, guard: r.guard as string, guardNo: r.guard_no as string, label: r.label as string, due: r.due as string, daysLeft: r.days_left as number }))
  };
}

const alertText = (kind: string, label: string, due: string, daysLeft: number): string => {
  const when = daysLeft < 0 ? `lapsed on ${due}` : `is due on ${due}`;
  return kind === 'equipment' ? `Reminder: ${label.replace(/^Return /, 'please return ')} (${when.replace('lapsed on', 'was due on')}).` : `Reminder: your ${label.replace(/ \(as typed by the firm\)/, '')} ${when}. Please renew it.`;
};

/** Queues one SMS per guard-item-date that has a phone number; running it twice queues nothing new. */
export async function queueExpiryAlerts(client: PoolClient, ctx: Ctx, days: number) {
  need(ctx, 'guards_write');
  const today = localDayOf(new Date());
  const scope = ctx.branchId ? 'WHERE x.branch_id = $2' : '';
  const params: unknown[] = ctx.branchId ? [addDays(today, days), ctx.branchId] : [addDays(today, days)];
  const rows = (await client.query(`SELECT x.kind, x.ref_id, x.guard_id, x.phone, x.label, to_char(x.due, 'YYYY-MM-DD') AS due, (x.due - '${today}'::date)::int AS days_left FROM (${ITEMS}) x ${scope}`, params)).rows;
  let queued = 0;
  let noPhone = 0;
  for (const r of rows) {
    if (!r.phone) { noPhone += 1; continue; }
    const res = await client.query(
      `INSERT INTO notification_outbox (org_id, guard_id, to_phone, purpose, body, dedupe_key) VALUES ($1, $2, $3, 'expiry-alert', $4, $5) ON CONFLICT (org_id, dedupe_key) DO NOTHING`,
      [ctx.orgId, r.guard_id, r.phone, alertText(r.kind, r.label, r.due, r.days_left), `${r.kind}:${r.ref_id}:${r.due}`]);
    queued += res.rowCount ?? 0;
  }
  await audit(client, ctx, 'notify.queue_expiry', 'org', null, { queued, noPhone });
  return { queued, alreadyQueuedOrSent: rows.length - noPhone - queued, withoutPhone: noPhone };
}

const MAX_ATTEMPTS = 5;

/** Sends what is due for ONE firm (inside its tenant transaction). A failure is retried later with a growing delay, then given up on. */
export async function dispatchOutbox(client: PoolClient, orgId: string, limit = 50): Promise<{ sent: number; failed: number; retrying: number }> {
  const due = (await client.query(`SELECT id, to_phone, body, attempts FROM notification_outbox WHERE status = 'queued' AND next_attempt_at <= now() ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit])).rows;
  const out = { sent: 0, failed: 0, retrying: 0 };
  for (const m of due) {
    const r = await sendMessage({ to: m.to_phone, purpose: 'expiry-alert', body: m.body });
    if (r.status !== 'failed') {
      await client.query(`UPDATE notification_outbox SET status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1`, [m.id]);
      out.sent += 1;
    } else if (m.attempts + 1 >= MAX_ATTEMPTS) {
      await client.query(`UPDATE notification_outbox SET status = 'failed', attempts = attempts + 1, last_error = 'gave up after repeated failures' WHERE id = $1`, [m.id]);
      out.failed += 1;
    } else {
      await client.query(`UPDATE notification_outbox SET attempts = attempts + 1, next_attempt_at = now() + (power(4, attempts + 1) * interval '1 minute'), last_error = 'delivery failed, will retry' WHERE id = $1`, [m.id]);
      out.retrying += 1;
    }
  }
  void orgId;
  return out;
}

/** The background drain: every firm with something due, one transaction each. */
export async function dispatchAllOutboxes(): Promise<number> {
  const orgs = await withoutTenant(async (c) => (await c.query('SELECT org_id FROM outbox_orgs()')).rows.map((r) => r.org_id as string));
  let sent = 0;
  for (const orgId of orgs) {
    try {
      sent += (await withOrg(orgId, (c) => dispatchOutbox(c, orgId))).sent;
    } catch (error) {
      logger.error('outbox dispatch failed for a firm', { orgId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return sent;
}

export async function listOutbox(client: PoolClient, opts: { page: number; pageSize: number }) {
  const total = Number((await client.query('SELECT count(*) AS n FROM notification_outbox')).rows[0].n);
  const rows = (await client.query(`SELECT o.id, o.purpose, o.body, o.status, o.attempts, o.last_error, o.created_at, o.sent_at, g.full_name AS guard FROM notification_outbox o LEFT JOIN guards g ON g.id = o.guard_id ORDER BY o.created_at DESC, o.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`)).rows;
  return { total, page: opts.page, pageSize: opts.pageSize, items: rows.map((r) => ({ id: r.id, purpose: r.purpose, body: r.body, status: r.status, attempts: r.attempts, lastError: r.last_error, guard: r.guard, createdAt: r.created_at, sentAt: r.sent_at })) };
}

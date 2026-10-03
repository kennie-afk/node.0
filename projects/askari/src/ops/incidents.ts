/** Incidents: the report is a fact and is never edited. Follow-ups, closing and reopening are further notes. */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { audit, Ctx, need } from '../common/context';
import { nextCounter, pad } from '../common/counters';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';

export const incidentSchema = z.object({
  siteId: z.string().uuid(),
  shiftId: z.string().uuid().optional().nullable(),
  guardId: z.string().uuid().optional().nullable(),
  severity: z.enum(['info', 'minor', 'major', 'critical']),
  category: z.string().trim().min(2).max(60),
  narrative: z.string().trim().min(5).max(4000),
  occurredAt: z.string().datetime({ offset: true }).optional()
});

const STATUS = `COALESCE((SELECT CASE n.kind WHEN 'close' THEN 'closed' ELSE 'open' END FROM incident_notes n WHERE n.incident_id = i.id AND n.kind IN ('close', 'reopen') ORDER BY n.id DESC LIMIT 1), 'open')`;
const COLS = `i.id, i.incident_no, i.branch_id, i.site_id, si.name AS site, c.name AS client, i.shift_id, i.guard_id, g.full_name AS guard, i.severity, i.category, i.narrative, i.occurred_at, i.created_at,
  u.display_name AS reported_by, ${STATUS} AS status`;
const FROM = `FROM incidents i JOIN sites si ON si.id = i.site_id JOIN clients c ON c.id = si.client_id LEFT JOIN guards g ON g.id = i.guard_id LEFT JOIN users u ON u.id = i.reported_by`;

const view = (r: Record<string, any>) => ({ id: r.id, incidentNo: r.incident_no, siteId: r.site_id, site: r.site, client: r.client, shiftId: r.shift_id, guardId: r.guard_id, guard: r.guard, severity: r.severity, category: r.category, narrative: r.narrative, occurredAt: r.occurred_at, createdAt: r.created_at, reportedBy: r.reported_by, status: r.status });

export async function reportIncident(client: PoolClient, ctx: Ctx, input: z.infer<typeof incidentSchema>) {
  need(ctx, 'incident_write');
  const site = (await client.query('SELECT branch_id FROM sites WHERE id = $1', [input.siteId])).rows[0];
  if (!site || (ctx.branchId && site.branch_id !== ctx.branchId)) throw new NotFoundError('That site was not found.');
  if (input.shiftId) {
    const sh = (await client.query('SELECT site_id FROM shifts WHERE id = $1', [input.shiftId])).rows[0];
    if (!sh || sh.site_id !== input.siteId) throw new ConflictError('That shift is not at this site.');
  }
  const occurred = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (occurred.getTime() > Date.now() + 5 * 60_000) throw new BadRequestError('The incident time is in the future.');
  const n = await nextCounter(client, ctx.orgId, 'incident');
  const row = (
    await client.query(
      `INSERT INTO incidents (org_id, branch_id, incident_no, site_id, shift_id, guard_id, reported_by, severity, category, narrative, occurred_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [ctx.orgId, site.branch_id, `INC-${pad(n, 5)}`, input.siteId, input.shiftId ?? null, input.guardId ?? null, ctx.userId, input.severity, input.category, input.narrative, occurred]
    )
  ).rows[0];
  await audit(client, ctx, 'incident.report', 'incident', row.id, { severity: input.severity }, site.branch_id);
  return getIncident(client, ctx, row.id);
}

export async function getIncident(client: PoolClient, ctx: Ctx, id: string) {
  const r = (await client.query(`SELECT ${COLS} ${FROM} WHERE i.id = $1`, [id])).rows[0];
  if (!r || (ctx.branchId && r.branch_id !== ctx.branchId)) throw new NotFoundError('That incident was not found.');
  const notes = (await client.query(`SELECT n.id, n.kind, n.body, n.at, u.display_name AS by FROM incident_notes n LEFT JOIN users u ON u.id = n.by_user WHERE n.incident_id = $1 ORDER BY n.id`, [id])).rows;
  return { ...view(r), notes: notes.map((n) => ({ id: Number(n.id), kind: n.kind, body: n.body, at: n.at, by: n.by })) };
}

export async function listIncidents(client: PoolClient, ctx: Ctx, opts: { status?: string; severity?: string; siteId?: string; page: number; pageSize: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (ctx.branchId) add('i.branch_id = ?', ctx.branchId);
  if (opts.severity) add('i.severity = ?', opts.severity);
  if (opts.siteId) add('i.site_id = ?', opts.siteId);
  if (opts.status === 'open' || opts.status === 'closed') add(`${STATUS} = ?`, opts.status);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n ${FROM} ${clause}`, params)).rows[0].n);
  const rows = (await client.query(`SELECT ${COLS} ${FROM} ${clause} ORDER BY i.created_at DESC, i.id LIMIT ${opts.pageSize} OFFSET ${(opts.page - 1) * opts.pageSize}`, params)).rows;
  return { items: rows.map(view), total, page: opts.page, pageSize: opts.pageSize };
}

export async function addNote(client: PoolClient, ctx: Ctx, id: string, kind: 'note' | 'close' | 'reopen', body: string) {
  need(ctx, kind === 'note' ? 'incident_write' : 'incident_close');
  const current = await getIncident(client, ctx, id);
  if (kind === 'close' && current.status === 'closed') throw new ConflictError('That incident is already closed.');
  if (kind === 'reopen' && current.status === 'open') throw new ConflictError('That incident is not closed.');
  if (body.trim().length < 3) throw new BadRequestError('Write a few words.');
  await client.query('INSERT INTO incident_notes (org_id, incident_id, kind, body, by_user) VALUES ($1, $2, $3, $4, $5)', [ctx.orgId, id, kind, body.trim(), ctx.userId]);
  await audit(client, ctx, `incident.${kind}`, 'incident', id);
  return getIncident(client, ctx, id);
}

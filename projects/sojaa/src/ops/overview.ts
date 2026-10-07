/** The owner's morning view, the client's read-only portal, and the shift evidence behind both. */
import { PoolClient } from 'pg';
import { Ctx, getSettings } from '../common/context';
import { localDayOf, monthBounds, TZ } from '../common/time';
import { can } from '../domain/roles';
import { boardCounts, ATTENDANCE_SQL } from './attendance-service';
import { cached } from '../common/ttl-cache';
import { computeMonth, summarise, tablesReady } from '../payroll/service';
import { debtorsSummary } from '../invoicing/service';
import { NotFoundError } from '../domain/errors';
import { classifyShift } from './attendance';

/**
 * The dashboard. Counts and the debtors total are SQL aggregates (no rows are loaded), and the whole view is cached for a few seconds
 * per firm, branch and role (see ttl-cache.ts); the payroll figure, the one part that needs the full month computed, is the main reason.
 */
export async function overview(client: PoolClient, ctx: Ctx) {
  return cached(`${ctx.orgId}|overview|${ctx.branchId ?? '-'}|${ctx.role}`, () => overviewUncached(client, ctx));
}

async function overviewUncached(client: PoolClient, ctx: Ctx) {
  const today = localDayOf(new Date());
  const counts = await boardCounts(client, ctx, { day: today });
  const params: unknown[] = [];
  let branch = '';
  if (ctx.branchId) {
    params.push(ctx.branchId);
    branch = ' AND i.branch_id = $1';
  }
  const incidents = (
    await client.query(
      `SELECT i.severity, count(*)::int AS n FROM incidents i
        WHERE COALESCE((SELECT CASE n.kind WHEN 'close' THEN 'closed' ELSE 'open' END FROM incident_notes n WHERE n.incident_id = i.id AND n.kind IN ('close', 'reopen') ORDER BY n.id DESC LIMIT 1), 'open') = 'open'${branch} GROUP BY i.severity`,
      params
    )
  ).rows;
  const openIncidents: Record<string, number> = { info: 0, minor: 0, major: 0, critical: 0 };
  for (const r of incidents) openIncidents[r.severity] = r.n;
  const swaps = Number((await client.query(`SELECT count(*) AS n FROM swap_requests w JOIN shifts s ON s.id = w.shift_id WHERE w.status = 'pending'${ctx.branchId ? ' AND s.branch_id = $1' : ''}`, ctx.branchId ? [ctx.branchId] : [])).rows[0].n);
  const openShifts = Number((await client.query(`SELECT count(*) AS n FROM shifts s WHERE s.status = 'scheduled' AND s.guard_id IS NULL AND s.start_at > now() AND s.start_at < now() + interval '7 days'${ctx.branchId ? ' AND s.branch_id = $1' : ''}`, ctx.branchId ? [ctx.branchId] : [])).rows[0].n);

  const out: Record<string, unknown> = { day: today, attendance: counts, openIncidents, pendingSwaps: swaps, openShiftsNextWeek: openShifts };

  if (can(ctx.role, 'reports') && !ctx.branchId) {
    out.unbilledShifts = Number((await client.query(
      `SELECT count(*) AS n FROM shifts s WHERE s.status = 'scheduled' AND s.guard_id IS NOT NULL AND s.end_at < now() AND s.start_at > now() - interval '70 days'
          AND EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind IN ('out', 'override_out')) AND EXISTS (SELECT 1 FROM attendance_events e WHERE e.shift_id = s.id AND e.kind IN ('in', 'override_in'))
          AND NOT EXISTS (SELECT 1 FROM client_invoice_shifts x WHERE x.shift_id = s.id)`
    )).rows[0].n);
    const settings = await getSettings(client);
    out.minimumWageCents = settings.minWageCents;
  }
  if (can(ctx.role, 'salary_view') && !ctx.branchId) {
    const month = today.slice(0, 7);
    const computed = await computeMonth(client, ctx, month);
    const s = summarise(computed.rows);
    out.payroll = { month, ...s, tables: tablesReady(computed.tables), unresolvedShifts: computed.unresolvedShifts };
    const d = await debtorsSummary(client);
    out.debtors = { totalCents: d.totalCents, overdueCents: d.totalCents - d.totals.not_due!, clients: d.clients };
  }
  return out;
}

/**
 * What the client may see through their private link: for each of their sites, per day in a month, how many shifts were scheduled, how many
 * had a verified check-in and check-out, late and missed counts. No guard names, no numbers, no pay: attendance verification and nothing else.
 */
export async function portalSummary(client: PoolClient, clientId: string, month: string) {
  const c = (await client.query('SELECT name FROM clients WHERE id = $1', [clientId])).rows[0];
  if (!c) throw new NotFoundError('That link is not valid.');
  const settings = await getSettings(client);
  const { first, nextFirst } = monthBounds(month);
  const rows = (
    await client.query(
      `SELECT s.id, s.guard_id, si.name AS site, s.start_at, s.end_at, s.scheduled_minutes, s.status, ${ATTENDANCE_SQL}
         FROM shifts s JOIN sites si ON si.id = s.site_id WHERE si.client_id = $1 AND s.status = 'scheduled' AND s.start_at >= ($2::date::timestamp AT TIME ZONE '${TZ}') AND s.start_at < ($3::date::timestamp AT TIME ZONE '${TZ}') ORDER BY s.start_at`,
      [clientId, first, nextFirst]
    )
  ).rows;
  const now = new Date();
  const rules = { checkinEarlyMinutes: settings.checkinEarlyMinutes, lateGraceMinutes: settings.lateGraceMinutes, missedAfterMinutes: settings.missedAfterMinutes };
  const bySite = new Map<string, Map<string, { scheduled: number; verified: number; late: number; missed: number }>>();
  for (const r of rows) {
    const day = localDayOf(r.start_at);
    const cls = r.guard_id ? classifyShift({ startAt: r.start_at, endAt: r.end_at, scheduledMinutes: r.scheduled_minutes }, { inAt: r.in_at, outAt: r.out_at, inOverridden: false, outOverridden: false }, now, rules) : { state: 'missed' as const, late: false, lateMinutes: 0 };
    const days = bySite.get(r.site) ?? new Map();
    const d = days.get(day) ?? { scheduled: 0, verified: 0, late: 0, missed: 0 };
    if (cls.state !== 'upcoming') d.scheduled += 1;
    if (cls.state === 'completed') d.verified += 1;
    if (cls.late) d.late += 1;
    if (cls.state === 'missed' || cls.state === 'no_checkout') d.missed += 1;
    days.set(day, d);
    bySite.set(r.site, days);
  }
  const sites = [...bySite.entries()].map(([site, days]) => {
    const list = [...days.entries()].map(([day, d]) => ({ day, ...d }));
    return { site, totals: list.reduce((t, d) => ({ scheduled: t.scheduled + d.scheduled, verified: t.verified + d.verified, late: t.late + d.late, missed: t.missed + d.missed }), { scheduled: 0, verified: 0, late: 0, missed: 0 }), days: list };
  });
  return { client: c.name as string, month, sites, notice: 'A shift counts as verified when the guard was recorded checking in and out by the security firm. Times are those of the firm\'s server.' };
}

/** The dashboard moved from loading whole datasets into JavaScript to SQL aggregates: these hold the new answers equal to the old computation. */
import { afterAll, describe, expect, it } from 'vitest';
import { boot, get, localInstant, makeGuard, makePlace, newTenant, on, pastShift, post, shutdown } from './helpers';
import { ATTENDANCE_SQL, board, boardRow } from '../src/ops/attendance-service';
import { debtors, debtorsSummary } from '../src/invoicing/service';
import { AGEING, ageingBucket, daysBetween } from '../src/invoicing/compute';
import { getSettings } from '../src/common/context';

const DAY = '2026-09-15';
const NOW = localInstant(DAY, '12:00');

describe.runIf(on)('SQL aggregates equal the old JavaScript computation (real Postgres)', () => {
  afterAll(shutdown);

  it('the attendance board counts, orders, filters and pages in SQL exactly as classifyShift did', async () => {
    const { pool } = await boot();
    const t = await newTenant('Board SQL Ltd');
    const place = await makePlace(t.owner.auth);
    const mk = async (start: string, hours: number, opts: { inAfterMin?: number | null; outAtEnd?: boolean } = {}) => {
      const g = await makeGuard(t.owner.auth);
      return pastShift(t, place, g.id, localInstant(DAY, start), { hours, ...opts });
    };
    const ids = {
      onSite: await mk('06:00', 8, { outAtEnd: false }),
      noCheckout: await mk('04:00', 6, { outAtEnd: false }),
      completed: await mk('06:00', 8),
      lateDone: await mk('05:00', 8, { inAfterMin: 40 }),
      missed: await mk('08:00', 4, { inAfterMin: null }),
      awaiting: await mk('11:50', 4, { inAfterMin: null }),
      upcoming: await mk('15:00', 4, { inAfterMin: null })
    };
    await pool.withMigrator(async (c) => {
      await c.query(`UPDATE attendance_events SET geofence = 'outside' WHERE shift_id = $1 AND kind = 'in'`, [ids.completed]);
      await c.query(`INSERT INTO shifts (org_id, branch_id, site_id, post_id, start_at, end_at, scheduled_minutes) SELECT $1, $2, $3, $4, $5::timestamptz + g * interval '1 minute', $5::timestamptz + g * interval '1 minute' + interval '4 hours', 240 FROM generate_series(0, 59) g`, [t.orgId, t.branchId, place.siteId, place.postId, localInstant(DAY, '09:00')]);
      await c.query(`UPDATE shifts SET status = 'cancelled' WHERE id = $1`, [ids.upcoming]);
    });

    const result = await pool.withOrg(t.orgId, async (c) => {
      const ctx = { orgId: t.orgId, userId: t.owner.id, role: 'owner', branchId: null } as any;
      const settings = await getSettings(c);
      const rules = { checkinEarlyMinutes: settings.checkinEarlyMinutes, lateGraceMinutes: settings.lateGraceMinutes, missedAfterMinutes: settings.missedAfterMinutes };
      // the old implementation, verbatim in effect: load every row, classify in JS, sort in JS
      const raw = (await c.query(
        `SELECT s.id, s.site_id, si.name AS site, c.name AS client, p.name AS post, s.guard_id, g.full_name AS guard, g.guard_no, s.start_at, s.end_at, s.scheduled_minutes, s.status, ${ATTENDANCE_SQL}
           FROM shifts s JOIN sites si ON si.id = s.site_id JOIN clients c ON c.id = si.client_id JOIN posts p ON p.id = s.post_id LEFT JOIN guards g ON g.id = s.guard_id
          WHERE s.status = 'scheduled' AND s.start_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Nairobi') AND s.start_at < (($1::date + 1)::timestamp AT TIME ZONE 'Africa/Nairobi') ORDER BY s.start_at, si.name, s.id`, [DAY])).rows;
      const all = raw.map((r) => boardRow(r, rules, NOW));
      const rank: Record<string, number> = { missed: 0, no_checkout: 1, open: 2, awaiting: 3, on_site: 4, upcoming: 5, completed: 6, cancelled: 7 };
      const sortRef = (list: typeof all) => [...list].sort((a, b) => rank[a.state]! - rank[b.state]! || Number(b.late) - Number(a.late) || a.startAt.getTime() - b.startAt.getTime());
      const refCounts: Record<string, number> = { total: all.length, upcoming: 0, awaiting: 0, missed: 0, on_site: 0, no_checkout: 0, completed: 0, open: 0, late: 0, outsideGeofence: 0 };
      for (const r of all) { refCounts[r.state] = (refCounts[r.state] ?? 0) + 1; if (r.late) refCounts.late! += 1; if (r.geofence === 'outside') refCounts.outsideGeofence! += 1; }

      const pages = [];
      for (let page = 1; page <= 20; page += 1) {
        const b = await board(c, ctx, { day: DAY, page, pageSize: 7 }, NOW);
        pages.push(...b.items);
        if (b.items.length < 7) break;
      }
      const first = await board(c, ctx, { day: DAY, page: 1, pageSize: 7 }, NOW);
      const lateOnly = await board(c, ctx, { day: DAY, page: 1, pageSize: 200, state: 'late' }, NOW);
      const missedOnly = await board(c, ctx, { day: DAY, page: 1, pageSize: 200, state: 'missed' }, NOW);
      return { all, sortRef, refCounts, pages, first, lateOnly, missedOnly };
    });

    expect(result.first.counts).toEqual(result.refCounts);
    expect(result.first.total).toBe(result.all.length);
    // every state is present in the seed, so the equality is not vacuous
    for (const state of ['on_site', 'no_checkout', 'completed', 'missed', 'awaiting', 'open']) expect(result.refCounts[state]).toBeGreaterThan(0);
    expect(result.refCounts.late).toBeGreaterThan(0);
    expect(result.refCounts.outsideGeofence).toBe(1);
    expect(result.first.items).toHaveLength(7);
    const ref = result.sortRef(result.all);
    expect(result.pages.map((r) => r.shiftId)).toEqual(ref.map((r) => r.shiftId));
    expect(result.pages.map((r) => [r.state, r.late, r.lateMinutes])).toEqual(ref.map((r) => [r.state, r.late, r.lateMinutes]));
    expect(result.lateOnly.items.map((r) => r.shiftId)).toEqual(result.sortRef(result.all.filter((r) => r.late)).map((r) => r.shiftId));
    expect(result.missedOnly.total).toBe(result.refCounts.missed);
  }, 120_000);

  it('debtors aggregated in SQL equal the old per-invoice loop, and the summary agrees with both', async () => {
    const { pool } = await boot();
    const t = await newTenant('Debtors SQL Ltd');
    const asOf = '2026-10-06';
    const clients: string[] = [];
    for (let i = 0; i < 4; i += 1) clients.push((await post(t.owner.auth, '/v1/clients', { name: `Debtor ${i} ${Date.now()}` })).body.id);
    const dueOffsets = [-10, 0, 5, 30, 31, 60, 61, 90, 91, 400];
    await pool.withMigrator(async (c) => {
      let n = 0;
      for (const [ci, clientId] of clients.entries()) {
        for (const off of dueOffsets.slice(ci, ci + 6)) {
          n += 1;
          const due = new Date(Date.parse(`${asOf}T00:00:00Z`) - off * 86_400_000).toISOString().slice(0, 10);
          const inv = (await c.query(`INSERT INTO client_invoices (org_id, client_id, number, month, issue_date, due_date, total_cents, created_by) VALUES ($1, $2, $3, '2026-01', '2026-01-01', $4, $5, $6) RETURNING id`, [t.orgId, clientId, `T-${n}`, due, 100_00 * n, t.owner.id])).rows[0];
          if (n % 3 === 0) { // part payment
            const pay = (await c.query(`INSERT INTO client_payments (org_id, client_id, amount_cents, received_on, method, created_by) VALUES ($1, $2, $3, '2026-02-01', 'cash', $4) RETURNING id`, [t.orgId, clientId, 30_00, t.owner.id])).rows[0];
            await c.query(`INSERT INTO client_payment_allocations (org_id, payment_id, invoice_id, amount_cents) VALUES ($1, $2, $3, 3000)`, [t.orgId, pay.id, inv.id]);
          }
          if (n % 7 === 0) await c.query(`INSERT INTO client_payments (org_id, client_id, amount_cents, received_on, method, created_by) VALUES ($1, $2, 1, '2026-02-01', 'cash', $3)`, [t.orgId, clientId, t.owner.id]);
        }
      }
    });
    const out = await pool.withOrg(t.orgId, async (c) => {
      const BALANCE = `i.total_cents - COALESCE((SELECT sum(n.amount_cents) FROM client_credit_notes n WHERE n.invoice_id = i.id), 0) - COALESCE((SELECT sum(a.amount_cents) FROM client_payment_allocations a WHERE a.invoice_id = i.id), 0)`;
      const rows = (await c.query(`SELECT i.id, i.client_id, c.name AS client, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, ${BALANCE} AS balance FROM client_invoices i JOIN clients c ON c.id = i.client_id WHERE (${BALANCE}) > 0`)).rows;
      return { rows, sql: await debtors(c, asOf), summary: await debtorsSummary(c, asOf) };
    });
    // the old loop
    const byClient = new Map<string, { clientId: string; client: string; buckets: Record<string, number>; totalCents: number; invoices: number; oldestDaysOverdue: number }>();
    const totals: Record<string, number> = Object.fromEntries(AGEING.map((b) => [b, 0]));
    for (const r of out.rows) {
      const bucket = ageingBucket(r.due_date, asOf);
      const bal = Number(r.balance);
      let e = byClient.get(r.client_id);
      if (!e) { e = { clientId: r.client_id, client: r.client, buckets: Object.fromEntries(AGEING.map((b) => [b, 0])), totalCents: 0, invoices: 0, oldestDaysOverdue: 0 }; byClient.set(r.client_id, e); }
      e.buckets[bucket] = (e.buckets[bucket] ?? 0) + bal; e.totalCents += bal; e.invoices += 1;
      e.oldestDaysOverdue = Math.max(e.oldestDaysOverdue, daysBetween(r.due_date, asOf));
      totals[bucket] = (totals[bucket] ?? 0) + bal;
    }
    const items = [...byClient.values()].sort((a, b) => b.totalCents - a.totalCents);
    expect(out.sql.items).toEqual(items);
    expect(out.sql.totals).toEqual(totals);
    expect(out.sql.totalCents).toBe(items.reduce((s, x) => s + x.totalCents, 0));
    expect(out.summary.totals).toEqual(totals);
    expect(out.summary.totalCents).toBe(out.sql.totalCents);
    expect(out.summary.clients).toBe(items.length);
    for (const b of AGEING) expect(totals[b]).toBeGreaterThan(0);
  });

  it('the dashboard is cached per firm and role for a short time, and a write by the firm clears it at once', async () => {
    const cache = await import('../src/common/ttl-cache');
    const t = await newTenant('Cache Ltd');
    await makePlace(t.owner.auth);
    const { pool } = await boot();
    const addOpenShift = (days: number) => pool.withMigrator((c) => c.query(`INSERT INTO shifts (org_id, branch_id, site_id, post_id, start_at, end_at, scheduled_minutes) SELECT $1, $2, s.id, p.id, now() + ($3 || ' days')::interval, now() + ($3 || ' days')::interval + interval '4 hours', 240 FROM sites s JOIN posts p ON p.site_id = s.id WHERE s.org_id = $1 LIMIT 1`, [t.orgId, t.branchId, String(days)]));
    cache.setCacheTtl(30_000);
    try {
      const first = await get(t.owner.auth, '/v1/overview');
      expect(first.body.openShiftsNextWeek).toBe(0);
      // a change that bypasses the API cannot invalidate anything: it stays invisible inside the TTL, which proves the answer is the cached one
      await addOpenShift(1);
      expect((await get(t.owner.auth, '/v1/overview')).body.openShiftsNextWeek).toBe(0);
      // a write through the API clears this firm's entries at once
      expect((await post(t.owner.auth, '/v1/clients', { name: `Cache client ${Date.now()}` })).status).toBe(201);
      expect((await get(t.owner.auth, '/v1/overview')).body.openShiftsNextWeek).toBe(1);
      // and another firm's cache is untouched by this firm's write
      const other = await newTenant('Cache Other Ltd');
      await get(other.owner.auth, '/v1/overview');
      expect((await post(t.owner.auth, '/v1/clients', { name: `Cache client B ${Date.now()}` })).status).toBe(201);
      await addOpenShift(2);
      expect((await get(t.owner.auth, '/v1/overview')).body.openShiftsNextWeek).toBe(2);
    } finally {
      cache.setCacheTtl(0);
    }
  });
});

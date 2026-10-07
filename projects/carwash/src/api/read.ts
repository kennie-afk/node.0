import { Router } from "express";
import { z } from "zod";
import { withOrg } from "../persistence/pool";
import { authenticate, requireRole } from "./middleware";
import { readStoredDay } from "../reconciliation/service";
import { assertSiteAccess, listSite } from "./scope";
import { flagsPage, jobsPage, paymentsPage } from "../persistence/listings";
import { afterClause, decodeCursor, keySelect, optionalUuid, orderBy, parseLimit, SortColumn } from "../persistence/paging";
import { sendArray } from "./respond";
import { BadRequestError, NotFoundError } from "../domain/errors";

const router = Router();

/**
 * What an attendant must not read: the payments, flags and water readings the product checks their
 * own work against. If the person being audited can see the evidence, they can fit around it.
 */
export const staffOnly = requireRole("owner", "manager", "supervisor", "support");

const dayShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const SITE_COLUMNS: SortColumn[] = [
  { sql: "s.name", dir: "asc", type: "text" },
  { sql: "s.id", dir: "asc", type: "uuid" }
];

router.get("/sites", authenticate, async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 200, 500);
    const params: unknown[] = [listSite(req)];
    const after = afterClause(SITE_COLUMNS, decodeCursor(req.query.after, 2), params);
    params.push(limit + 1);
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      // counts come from the indexed per-site tables once, grouped, not as a subselect per site row
      const { rows } = await client.query(
        `SELECT s.id, s.name, s.timezone, s.till_number, s.litres_per_wash, s.cash_ratio,
                COALESCE(b.n, 0) AS bays, COALESCE(j.n, 0) AS jobs, COALESCE(d.n, 0) AS open_flags,
                ${keySelect(SITE_COLUMNS)}
           FROM sites s
           LEFT JOIN LATERAL (SELECT count(*) AS n FROM bays b WHERE b.site_id = s.id) b ON true
           LEFT JOIN LATERAL (SELECT COALESCE(sum(c.jobs_recorded), 0) AS n FROM day_closes c WHERE c.site_id = s.id) j ON true
           LEFT JOIN LATERAL (SELECT count(*) AS n FROM discrepancies d WHERE d.site_id = s.id AND d.state = 'open') d ON true
          WHERE ($1::uuid IS NULL OR s.id = $1) ${after ? `AND ${after}` : ""}
          ORDER BY ${orderBy(SITE_COLUMNS)} LIMIT $${params.length}`,
        params
      );
      return rows;
    });

    sendArray(res, rows, limit, SITE_COLUMNS, (row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      tillNumber: row.till_number,
      litresPerWash: Number(row.litres_per_wash),
      cashRatio: Number(row.cash_ratio),
      bays: Number(row.bays),
      jobs: Number(row.jobs),
      openFlags: Number(row.open_flags)
    }));
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", authenticate, async (req, res, next) => {
  try {
    // An attendant tied to a site sees that site's jobs whatever they ask for.
    res.json(await withOrg(req.principal!.orgId, (client) => jobsPage(client, { siteId: listSite(req) }, req.query)));
  } catch (error) {
    next(error);
  }
});

router.get("/payments", authenticate, staffOnly, async (req, res, next) => {
  try {
    res.json(await withOrg(req.principal!.orgId, (client) => paymentsPage(client, { siteId: listSite(req) }, req.query)));
  } catch (error) {
    next(error);
  }
});

router.get("/discrepancies", authenticate, staffOnly, async (req, res, next) => {
  try {
    // `state` filters the queue (open by default in the console); `all` returns every state.
    const query = { ...req.query, state: typeof req.query.state === "string" ? req.query.state : "all" };
    res.json(await withOrg(req.principal!.orgId, (client) => flagsPage(client, { siteId: listSite(req) }, query)));
  } catch (error) {
    next(error);
  }
});

const TELEMETRY_COLUMNS: SortColumn[] = [
  { sql: "hour", dir: "desc", type: "timestamptz" },
  { sql: "metric", dir: "asc", type: "text" }
];

router.get("/telemetry", authenticate, staffOnly, async (req, res, next) => {
  try {
    const siteId = listSite(req) ?? optionalUuid(req.query.siteId, "siteId");
    const limit = parseLimit(req.query.limit, 72, 500);
    // the window keeps the scan bounded however much history there is; older hours are reached with a larger `days`
    const days = parseLimit(req.query.days, 7, 800);
    const params: unknown[] = [siteId, days];
    const after = afterClause(TELEMETRY_COLUMNS, decodeCursor(req.query.after, 2), params);
    params.push(limit + 1);
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      // hours already rolled up (older than the minute retention) are read from telemetry_hour
      const { rows } = await client.query(
        `WITH readings AS (
           SELECT date_trunc('hour', bucket) AS hour, metric, total FROM telemetry_minute
            WHERE ($1::uuid IS NULL OR site_id = $1) AND bucket >= now() - make_interval(days => $2::int)
           UNION ALL
           SELECT bucket AS hour, metric, total FROM telemetry_hour
            WHERE ($1::uuid IS NULL OR site_id = $1) AND bucket >= now() - make_interval(days => $2::int)
         ), hourly AS (
           SELECT hour, metric, SUM(total) AS total FROM readings GROUP BY hour, metric
         )
         SELECT hour, metric, total, ${keySelect(TELEMETRY_COLUMNS)} FROM hourly
          ${after ? `WHERE ${after}` : ""}
          ORDER BY ${orderBy(TELEMETRY_COLUMNS)} LIMIT $${params.length}`,
        params
      );
      return rows;
    });

    sendArray(res, rows, limit, TELEMETRY_COLUMNS, (row) => ({
      hour: row.hour,
      metric: row.metric,
      total: Number(row.total)
    }));
  } catch (error) {
    next(error);
  }
});

/**
 * A day exactly as it was last reconciled. This is a read: it never recomputes and never writes (it
 * used to call closeDay, so a GET changed data and a suspended organisation could write through it).
 * Recomputing is POST /sites/close.
 */
router.get("/report", authenticate, staffOnly, async (req, res, next) => {
  try {
    const siteId = String(req.query.siteId ?? "");
    const day = dayShape.safeParse(req.query.day);
    if (!siteId || !day.success) {
      throw new BadRequestError("siteId and a YYYY-MM-DD day are required");
    }
    assertSiteAccess(req, siteId);

    const stored = await readStoredDay(req.principal!.orgId, siteId, day.data);
    if (!stored) {
      throw new NotFoundError("That day has not been reconciled yet. Use Close day to run it.");
    }
    res.json({
      summary: stored.summary,
      closedAt: stored.closedAt,
      vehiclesDetected: stored.vehiclesDetected,
      jobsRecorded: stored.jobsRecorded,
      expectedCents: stored.expectedCents,
      receivedCents: stored.receivedCents,
      gapCents: stored.gapCents,
      discrepancies: stored.discrepancies
    });
  } catch (error) {
    next(error);
  }
});

const COUNTED = "('in_progress','awaiting_payment','paid','closed')";

/**
 * The headline numbers. Everything up to each site's last reconciled day (before today) comes from day_closes,
 * which holds one row per site per day, and only the days since then are counted live from jobs and payments,
 * so the cost no longer grows with the organisation's whole history. A day that was never reconciled and
 * lies before the latest closed one is not in these totals until it is closed. Open work and open flags come from partial
 * indexes that hold only open rows.
 */
router.get("/overview", authenticate, staffOnly, async (req, res, next) => {
  try {
    const siteId = listSite(req);
    const { summary, name } = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `WITH last_close AS (
           -- today's own close, if someone ran one early, is not an anchor: work done after it must still show
           SELECT site_id, max(business_day) AS day FROM day_closes
            WHERE business_day < current_date AND ($1::uuid IS NULL OR site_id = $1) GROUP BY site_id
         ), closed AS (
           SELECT COALESCE(sum(c.jobs_recorded), 0) AS jobs, COALESCE(sum(c.payments_count), 0) AS payments,
                  COALESCE(sum(c.expected_cents), 0) AS expected, COALESCE(sum(c.received_cents), 0) AS received
             FROM day_closes c JOIN last_close lc ON lc.site_id = c.site_id AND c.business_day <= lc.day
         ), live_jobs AS (
           SELECT count(*) AS jobs, COALESCE(sum(j.list_total_cents), 0) AS expected
             FROM jobs j LEFT JOIN last_close lc ON lc.site_id = j.site_id
            WHERE j.state IN ${COUNTED} AND ($1::uuid IS NULL OR j.site_id = $1)
              AND (lc.day IS NULL OR j.created_at >= lc.day + 1)
         ), live_payments AS (
           SELECT count(*) AS payments, COALESCE(sum(p.amount_cents), 0) AS received
             FROM payments p LEFT JOIN last_close lc ON lc.site_id = p.site_id
            WHERE p.reversed_at IS NULL AND ($1::uuid IS NULL OR p.site_id = $1)
              AND (lc.day IS NULL OR p.received_at >= lc.day + 1)
         )
         SELECT (SELECT count(*) FROM sites WHERE ($1::uuid IS NULL OR id = $1)) AS sites,
                closed.jobs + live_jobs.jobs AS jobs,
                (SELECT count(*) FROM jobs WHERE state IN ('created','in_progress','awaiting_payment') AND ($1::uuid IS NULL OR site_id = $1)) AS open_jobs,
                closed.payments + live_payments.payments AS payments,
                (SELECT count(*) FROM payments WHERE job_id IS NULL AND reversed_at IS NULL AND ($1::uuid IS NULL OR site_id = $1)) AS unmatched_payments,
                closed.received + live_payments.received AS received_cents,
                closed.expected + live_jobs.expected AS expected_cents,
                (SELECT count(*) FROM discrepancies WHERE state = 'open' AND ($1::uuid IS NULL OR site_id = $1)) AS open_flags,
                (SELECT COALESCE(sum(est_value_cents), 0) FROM discrepancies WHERE state = 'open' AND ($1::uuid IS NULL OR site_id = $1)) AS flagged_cents,
                (SELECT count(*) FROM devices WHERE status = 'active' AND ($1::uuid IS NULL OR site_id = $1)) AS devices
           FROM closed, live_jobs, live_payments`,
        [siteId]
      );
      const org = await client.query(`SELECT name FROM organisations WHERE id = $1`, [req.principal!.orgId]);
      return { summary: rows[0], name: org.rows[0]?.name ?? "your organisation" };
    });

    res.json({
      organisation: name,
      sites: Number(summary.sites),
      jobs: Number(summary.jobs),
      openJobs: Number(summary.open_jobs),
      payments: Number(summary.payments),
      unmatchedPayments: Number(summary.unmatched_payments),
      receivedCents: Number(summary.received_cents),
      expectedCents: Number(summary.expected_cents),
      gapCents: Number(summary.expected_cents) - Number(summary.received_cents),
      openFlags: Number(summary.open_flags),
      flaggedCents: Number(summary.flagged_cents),
      devices: Number(summary.devices)
    });
  } catch (error) {
    next(error);
  }
});

export default router;

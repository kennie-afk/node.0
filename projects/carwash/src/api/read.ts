import { Router } from "express";
import { z } from "zod";
import { withOrg } from "../persistence/pool";
import { authenticate } from "./middleware";
import { closeDay } from "../reconciliation/service";
import { BadRequestError } from "../domain/errors";

const router = Router();

const dayShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

router.get("/sites", authenticate, async (req, res, next) => {
  try {
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT s.id, s.name, s.timezone, s.till_number, s.litres_per_wash, s.cash_ratio,
                (SELECT count(*) FROM bays b WHERE b.site_id = s.id) AS bays,
                (SELECT count(*) FROM jobs j WHERE j.site_id = s.id) AS jobs,
                (SELECT count(*) FROM discrepancies d WHERE d.site_id = s.id AND d.state = 'open') AS open_flags
           FROM sites s ORDER BY s.name`
      );
      return rows;
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        timezone: row.timezone,
        tillNumber: row.till_number,
        litresPerWash: Number(row.litres_per_wash),
        cashRatio: Number(row.cash_ratio),
        bays: Number(row.bays),
        jobs: Number(row.jobs),
        openFlags: Number(row.open_flags)
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", authenticate, async (req, res, next) => {
  try {
    const siteId = String(req.query.siteId ?? "");
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT j.id, j.state, j.quoted_total_cents, j.list_total_cents, j.created_at,
                j.closed_at, v.plate_normalised, u.display_name AS worker,
                (SELECT count(*) FROM payments p WHERE p.job_id = j.id) AS payments
           FROM jobs j
           LEFT JOIN vehicles v ON v.id = j.vehicle_id
           LEFT JOIN users u ON u.id = j.worker_id
          WHERE ($1 = '' OR j.site_id::text = $1)
          ORDER BY j.created_at DESC
          LIMIT 100`,
        [siteId]
      );
      return rows;
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        state: row.state,
        quotedCents: Number(row.quoted_total_cents),
        listCents: Number(row.list_total_cents),
        createdAt: row.created_at,
        closedAt: row.closed_at,
        plate: row.plate_normalised,
        worker: row.worker,
        paid: Number(row.payments) > 0
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/payments", authenticate, async (req, res, next) => {
  try {
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT id, channel, amount_cents, external_ref, job_id, received_at
           FROM payments ORDER BY received_at DESC LIMIT 100`
      );
      return rows;
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        channel: row.channel,
        amountCents: Number(row.amount_cents),
        reference: row.external_ref,
        jobId: row.job_id,
        matched: row.job_id !== null,
        receivedAt: row.received_at
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/discrepancies", authenticate, async (req, res, next) => {
  try {
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT d.id, d.type, d.severity, d.est_value_cents, d.summary, d.evidence,
                d.state, d.business_day, s.name AS site
           FROM discrepancies d
           JOIN sites s ON s.id = d.site_id
          ORDER BY
            CASE d.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            d.est_value_cents DESC
          LIMIT 100`
      );
      return rows;
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        severity: row.severity,
        estimatedCents: Number(row.est_value_cents),
        summary: row.summary,
        evidence: row.evidence,
        state: row.state,
        businessDay: row.business_day,
        site: row.site
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/telemetry", authenticate, async (req, res, next) => {
  try {
    const siteId = String(req.query.siteId ?? "");
    const rows = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT date_trunc('hour', bucket) AS hour, metric, SUM(total) AS total
           FROM telemetry_minute
          WHERE ($1 = '' OR site_id::text = $1)
          GROUP BY date_trunc('hour', bucket), metric
          ORDER BY hour DESC
          LIMIT 72`,
        [siteId]
      );
      return rows;
    });

    res.json(
      rows.map((row) => ({
        hour: row.hour,
        metric: row.metric,
        total: Number(row.total)
      }))
    );
  } catch (error) {
    next(error);
  }
});

router.get("/report", authenticate, async (req, res, next) => {
  try {
    const siteId = String(req.query.siteId ?? "");
    const day = dayShape.safeParse(req.query.day);
    if (!siteId || !day.success) {
      throw new BadRequestError("siteId and a YYYY-MM-DD day are required");
    }

    const outcome = await closeDay(req.principal!.orgId, siteId, day.data);
    res.json({
      summary: outcome.report,
      vehiclesDetected: outcome.result.vehiclesDetected,
      jobsRecorded: outcome.result.jobsRecorded,
      expectedCents: outcome.result.expectedRevenue,
      receivedCents: outcome.result.receivedRevenue,
      gapCents: outcome.result.gap,
      discrepancies: outcome.result.discrepancies
    });
  } catch (error) {
    next(error);
  }
});

router.get("/overview", authenticate, async (req, res, next) => {
  try {
    const summary = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT
           (SELECT count(*) FROM sites) AS sites,
           (SELECT count(*) FROM jobs) AS jobs,
           (SELECT count(*) FROM jobs WHERE state IN ('created','in_progress','awaiting_payment')) AS open_jobs,
           (SELECT count(*) FROM payments) AS payments,
           (SELECT count(*) FROM payments WHERE job_id IS NULL) AS unmatched_payments,
           (SELECT coalesce(sum(amount_cents),0) FROM payments) AS received_cents,
           (SELECT coalesce(sum(list_total_cents),0) FROM jobs WHERE state <> 'abandoned') AS expected_cents,
           (SELECT count(*) FROM discrepancies WHERE state = 'open') AS open_flags,
           (SELECT coalesce(sum(est_value_cents),0) FROM discrepancies WHERE state = 'open') AS flagged_cents,
           (SELECT count(*) FROM devices WHERE status = 'active') AS devices`
      );
      return rows[0];
    });

    const org = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(`SELECT name FROM organisations WHERE id = $1`, [
        req.principal!.orgId
      ]);
      return rows[0]?.name ?? "your organisation";
    });

    res.json({
      organisation: org,
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

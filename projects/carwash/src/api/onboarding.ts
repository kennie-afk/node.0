/**
 * First-hour value: an onboarding checklist derived from what actually exists (never a separate
 * "done" flag that can drift), sample data an owner can try before connecting anything, and a plain
 * "what this found" summary built only from days that were really reconciled.
 */
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireWritable } from './middleware';
import { withOrg } from '../persistence/pool';
import { BadRequestError } from '../domain/errors';
import { closeDay } from '../reconciliation/service';
import { loadSample, removeSample } from '../demo/sandbox';
import { buildSummary } from '../reporting/summary';

const router = Router();

export interface ChecklistStep {
  key: 'site' | 'attendants' | 'till' | 'reconcile';
  title: string;
  detail: string;
  done: boolean;
  href: string;
}

router.get('/onboarding', authenticate, requireRole('owner', 'manager', 'supervisor', 'support'), async (req, res, next) => {
  try {
    const facts = await withOrg(req.principal!.orgId, async (client) => {
      const { rows } = await client.query(
        `SELECT
           (SELECT count(*)::int FROM sites WHERE NOT is_demo) AS sites,
           (SELECT count(*)::int FROM users WHERE NOT is_demo AND role IN ('worker','supervisor','manager') AND status = 'active') AS attendants,
           (SELECT count(*)::int FROM sites WHERE NOT is_demo AND till_number IS NOT NULL) AS tills,
           (SELECT count(*)::int FROM payments p JOIN sites s ON s.id = p.site_id WHERE NOT s.is_demo) AS payments,
           (SELECT count(*)::int FROM day_closes d JOIN sites s ON s.id = d.site_id WHERE NOT s.is_demo) AS closes,
           (SELECT count(*)::int FROM jobs j JOIN sites s ON s.id = j.site_id WHERE NOT s.is_demo) AS jobs,
           EXISTS (SELECT 1 FROM sites WHERE is_demo) AS sample`
      );
      return rows[0];
    });

    const steps: ChecklistStep[] = [
      {
        key: 'site',
        title: 'Your first site is created',
        detail: facts.sites > 0 ? 'Check its name, opening hours and typical water use.' : 'Add a site.',
        done: facts.sites > 0,
        href: '/console/sites'
      },
      {
        key: 'attendants',
        title: 'Add your attendants',
        detail: facts.attendants > 0 ? `${facts.attendants} on the team.` : 'Each person records their own work, so the record carries a name.',
        done: facts.attendants > 0,
        href: '/console/team/new'
      },
      {
        key: 'till',
        title: 'Connect your till or paybill',
        detail:
          facts.tills === 0
            ? 'Enter the till number on your site so payments find the right job.'
            : facts.payments > 0
              ? `${facts.payments} payment${facts.payments === 1 ? '' : 's'} received.`
              : 'Till saved. Waiting for the first payment to arrive.',
        done: facts.tills > 0,
        href: '/console/sites'
      },
      {
        key: 'reconcile',
        title: 'Run your first reconciliation',
        detail: facts.closes > 0 ? `${facts.closes} day${facts.closes === 1 ? '' : 's'} checked.` : 'Check a finished day: it compares cars, work and money.',
        done: facts.closes > 0,
        href: '/console/found'
      }
    ];

    res.json({
      steps,
      completed: steps.filter((step) => step.done).length,
      total: steps.length,
      sample: { loaded: facts.sample, canLoad: !facts.sample && facts.jobs === 0 && facts.payments === 0 },
      hasRealActivity: facts.jobs > 0 || facts.payments > 0
    });
  } catch (error) {
    next(error);
  }
});

router.post('/sandbox', authenticate, requireRole('owner'), requireWritable, async (req, res, next) => {
  try {
    res.status(201).json(await loadSample(req.principal!.orgId));
  } catch (error) {
    next(error);
  }
});

router.delete('/sandbox', authenticate, requireRole('owner'), requireWritable, async (req, res, next) => {
  try {
    res.json(await removeSample(req.principal!.orgId));
  } catch (error) {
    next(error);
  }
});

const summaryQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(14) });

router.get('/summary', authenticate, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    const parsed = summaryQuery.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('days must be a whole number between 1 and 90');
    res.json(await buildSummary(req.principal!.orgId, parsed.data.days));
  } catch (error) {
    next(error);
  }
});

const recentSchema = z.object({ days: z.number().int().min(1).max(31).default(7) });

/** Reconcile the last N finished days at every real site, so a new owner can see results at once. */
router.post('/reconcile/recent', authenticate, requireRole('owner', 'manager'), requireWritable, async (req, res, next) => {
  try {
    const parsed = recentSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError('days must be a whole number between 1 and 31');

    const sites = await withOrg(req.principal!.orgId, async (client) =>
      (await client.query('SELECT id FROM sites WHERE NOT is_demo ORDER BY name')).rows.map((row) => row.id as string)
    );
    const today = new Date();
    let checked = 0;
    let flags = 0;
    for (const siteId of sites) {
      for (let back = 1; back <= parsed.data.days; back += 1) {
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - back)).toISOString().slice(0, 10);
        const outcome = await closeDay(req.principal!.orgId, siteId, day);
        checked += 1;
        flags += outcome.discrepanciesWritten;
      }
    }
    res.json({ sites: sites.length, daysChecked: checked, flagsRaised: flags });
  } catch (error) {
    next(error);
  }
});

export default router;

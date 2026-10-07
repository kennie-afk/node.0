import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { audit, getSettings, orgInfo, wrap } from '../common/context';
import { inOrg, parse } from './helpers';
import { checklist } from '../onboarding/service';
import { env } from '../config/env';
import { can, permissionsOf } from '../domain/roles';

const router = Router();

router.get('/settings', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client, ctx) => ({
    organisation: await orgInfo(client),
    settings: await getSettings(client),
    permissions: permissionsOf(ctx.role),
    capabilities: { billingMode: env.BILLING_MODE }
  })));
}));

const bp = z.number().int().min(10_000).max(100_000);
const settingsSchema = z.object({
  minWageCents: z.number().int().min(0).max(100_000_000_000).optional(),
  allowancesCountTowardMin: z.boolean().optional(),
  standardMonthlyHours: z.number().int().min(50).max(400).optional(),
  overtimeMultiplierBp: bp.optional(),
  restDayMultiplierBp: bp.optional(),
  holidayMultiplierBp: bp.optional(),
  checkinEarlyMinutes: z.number().int().min(0).max(600).optional(),
  lateGraceMinutes: z.number().int().min(0).max(240).optional(),
  missedAfterMinutes: z.number().int().min(5).max(720).optional(),
  defaultGeofenceM: z.number().int().min(20).max(5000).optional(),
  maxHoursPerWeek: z.number().int().min(1).max(168).nullable().optional(),
  minRestHours: z.number().int().min(1).max(24).nullable().optional(),
  billBasis: z.enum(['scheduled', 'actual']).optional(),
  annualLeaveDays: z.number().int().min(0).max(366).optional(),
  sickLeaveDays: z.number().int().min(0).max(366).nullable().optional(),
  absenceDeduction: z.enum(['off', 'unpaid_leave', 'unpaid_leave_and_missed']).optional(),
  psraLicenceNo: z.string().trim().max(60).nullable().optional()
});

router.patch('/settings', authenticate, requirePermission('settings'), requireWritable, wrap(async (req, res) => {
  const b = parse(settingsSchema, req.body);
  res.json(await inOrg(req, async (client, ctx) => {
    const has = (k: keyof typeof b) => b[k] !== undefined;
    await client.query(
      `UPDATE org_settings SET
         min_wage_cents = COALESCE($1, min_wage_cents), allowances_count_toward_min = COALESCE($2, allowances_count_toward_min), standard_monthly_hours = COALESCE($3, standard_monthly_hours),
         overtime_multiplier_bp = COALESCE($4, overtime_multiplier_bp), rest_day_multiplier_bp = COALESCE($5, rest_day_multiplier_bp), holiday_multiplier_bp = COALESCE($6, holiday_multiplier_bp),
         checkin_early_minutes = COALESCE($7, checkin_early_minutes), late_grace_minutes = COALESCE($8, late_grace_minutes), missed_after_minutes = COALESCE($9, missed_after_minutes),
         default_geofence_m = COALESCE($10, default_geofence_m), max_hours_per_week = CASE WHEN $11::boolean THEN $12::int ELSE max_hours_per_week END,
         min_rest_hours = CASE WHEN $13::boolean THEN $14::int ELSE min_rest_hours END, bill_basis = COALESCE($15, bill_basis),
         annual_leave_days = COALESCE($16, annual_leave_days), sick_leave_days = CASE WHEN $17::boolean THEN $18::int ELSE sick_leave_days END, absence_deduction = COALESCE($19, absence_deduction), updated_at = now()`,
      [b.minWageCents ?? null, b.allowancesCountTowardMin ?? null, b.standardMonthlyHours ?? null, b.overtimeMultiplierBp ?? null, b.restDayMultiplierBp ?? null, b.holidayMultiplierBp ?? null, b.checkinEarlyMinutes ?? null,
       b.lateGraceMinutes ?? null, b.missedAfterMinutes ?? null, b.defaultGeofenceM ?? null, has('maxHoursPerWeek'), b.maxHoursPerWeek ?? null, has('minRestHours'), b.minRestHours ?? null, b.billBasis ?? null,
       b.annualLeaveDays ?? null, has('sickLeaveDays'), b.sickLeaveDays ?? null, b.absenceDeduction ?? null]
    );
    if (has('psraLicenceNo')) await client.query('UPDATE organisations SET psra_licence_no = $1', [b.psraLicenceNo?.trim() || null]);
    await audit(client, ctx, 'settings.update', 'settings', null, { ...b });
    return { organisation: await orgInfo(client), settings: await getSettings(client) };
  }));
}));

router.get('/onboarding', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => checklist(client)));
}));

// What each kind of audit entry may reveal. A manager who runs operations is meant not to see wages or invoicing
// (see domain/roles.ts), so the entry stays visible, saying that something happened, but its figures do not.
const WAGE_ACTIONS = /^(guard\.pay_change|payroll\.)/;
const MONEY_ACTIONS = /^(invoice\.|payment\.)/;

router.get('/audit', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client, ctx) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const before = Number(req.query.before) > 0 ? Number(req.query.before) : null;
    const showWages = can(ctx.role, 'salary_view');
    const showMoney = can(ctx.role, 'invoices_write') || can(ctx.role, 'payments_post') || showWages;

    // A person limited to one branch sees that branch's entries, not the whole firm's.
    const params: unknown[] = [limit + 1];
    const where: string[] = [];
    if (before !== null) { params.push(before); where.push(`a.id < $${params.length}`); }
    if (ctx.branchId) { params.push(ctx.branchId); where.push(`a.branch_id = $${params.length}`); }

    const rows = (await client.query(
      `SELECT a.id, a.actor_id, u.display_name AS actor, a.action, a.entity, a.entity_id, a.detail, a.created_at
         FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.id DESC LIMIT $1`,
      params
    )).rows;

    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => {
        const hidden = (WAGE_ACTIONS.test(r.action) && !showWages) || (MONEY_ACTIONS.test(r.action) && !showMoney);
        return { id: Number(r.id), actorId: r.actor_id, actor: r.actor, action: r.action, entity: r.entity, entityId: r.entity_id, detail: hidden ? { redacted: 'This figure needs payroll access.' } : r.detail, at: r.created_at };
      }),
      next: rows.length > limit ? Number(page[page.length - 1].id) : null
    };
  }));
}));

export default router;

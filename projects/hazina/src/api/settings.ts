import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { audit, getSettings, orgInfo, wrap } from '../common/context';
import { inOrg, parse } from './helpers';
import { checklist } from '../onboarding/service';
import { env } from '../config/env';

const router = Router();

router.get('/settings', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => ({ organisation: await orgInfo(client), settings: await getSettings(client), capabilities: { mpesaSimulator: env.MPESA_SIMULATOR, billingMode: env.BILLING_MODE } })));
}));

const settingsSchema = z.object({
  makerChecker: z.enum(['strict', 'relaxed']).optional(),
  withdrawalApprovalCents: z.number().int().min(0).max(100_000_000_000).optional(),
  capacityShareBp: z.number().int().min(100).max(10_000).optional(),
  financialYearStartMonth: z.number().int().min(1).max(12).optional()
});

router.patch('/settings', authenticate, requirePermission('settings'), requireWritable, wrap(async (req, res) => {
  const body = parse(settingsSchema, req.body);
  res.json(await inOrg(req, async (client, ctx) => {
    await client.query(
      `UPDATE org_settings SET maker_checker = COALESCE($1, maker_checker), withdrawal_approval_cents = COALESCE($2, withdrawal_approval_cents),
              capacity_share_bp = COALESCE($3, capacity_share_bp), financial_year_start_month = COALESCE($4, financial_year_start_month), updated_at = now()`,
      [body.makerChecker ?? null, body.withdrawalApprovalCents ?? null, body.capacityShareBp ?? null, body.financialYearStartMonth ?? null]
    );
    await audit(client, ctx, 'settings.update', 'settings', null, { ...body });
    return getSettings(client);
  }));
}));

router.get('/onboarding', authenticate, requirePermission('read'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => checklist(client)));
}));

router.get('/audit', authenticate, requirePermission('reports'), wrap(async (req, res) => {
  res.json(await inOrg(req, async (client) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const rows = (await client.query('SELECT id, actor_id, action, entity, entity_id, detail, created_at FROM audit_events ORDER BY id DESC LIMIT $1', [limit])).rows;
    return rows.map((r) => ({ id: Number(r.id), actorId: r.actor_id, action: r.action, entity: r.entity, entityId: r.entity_id, detail: r.detail, at: r.created_at }));
  }));
}));

export default router;

/**
 * The owner's view of Dawa's own subscription, and (in mock mode only) a way to simulate
 * paying it. The simulated payment is not a shortcut around the real path: it builds the same Daraja
 * confirmation a real payment produces and feeds it through `ingestConfirmation`, so the same
 * matching, idempotency and state changes run. In live mode the route does not exist.
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { authenticate, requireRole } from './middleware';
import { env } from '../config/env';
import { getBillingView, payShortcode } from '../billing/service';
import { billingConfig } from '../billing/config';
import { LIST_PRICE_MAX_BRANCHES } from '../billing/pricing';
import { ingestConfirmation } from '../mpesa/service';
import { withOrg } from '../persistence/pool';
import { BadRequestError, NotFoundError } from '../domain/errors';

const router = Router();

/** Public: the pricing page reads this, so what it shows is always what billing will charge. */
router.get('/pricing', (_req, res) => {
  const config = billingConfig();
  res.json({
    currency: 'KES',
    trialDays: config.trialDays,
    firstBranchCents: config.firstBranchCents,
    extraBranchCents: config.extraBranchCents,
    listPriceMaxBranches: LIST_PRICE_MAX_BRANCHES,
    provisional: true
  });
});

router.get('/billing', authenticate, requireRole('owner', 'manager'), async (req, res, next) => {
  try {
    res.json(await getBillingView(req.principal!.orgId));
  } catch (error) {
    next(error);
  }
});

const mockSchema = z.object({ amountCents: z.number().int().positive().max(100_000_000).optional() });

/** Daraja's TransTime is local (EAT, UTC+3) as yyyymmddhhmmss. */
function darajaTime(at: Date): string {
  const eat = new Date(at.getTime() + 3 * 3_600_000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

router.post('/billing/mock-payment', authenticate, requireRole('owner'), async (req, res, next) => {
  try {
    if (env.BILLING_MODE !== 'mock') {
      throw new NotFoundError('No route matches POST /v1/billing/mock-payment');
    }
    const parsed = mockSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new BadRequestError('amountCents must be a positive whole number');

    const before = await getBillingView(req.principal!.orgId);
    const amountCents = parsed.data.amountCents ?? (before.outstandingCents > 0 ? before.outstandingCents : before.quote.amountCents);
    const owner = await withOrg(req.principal!.orgId, async (client) =>
      (await client.query('SELECT phone FROM users WHERE id = $1', [req.principal!.userId])).rows[0]?.phone as string | undefined
    );

    await ingestConfirmation({
      TransactionType: 'Pay Bill',
      TransID: `MOCK${randomBytes(5).toString('hex').toUpperCase()}`,
      TransTime: darajaTime(new Date()),
      TransAmount: amountCents / 100,
      BusinessShortCode: payShortcode(),
      BillRefNumber: before.billingRef,
      MSISDN: owner ?? '254700000000',
      FirstName: 'Mock'
    });
    res.status(201).json({ simulated: true, billing: await getBillingView(req.principal!.orgId) });
  } catch (error) {
    next(error);
  }
});

export default router;

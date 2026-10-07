/**
 * A public, login-free giving page per church (`/public/give/:slug`) that starts an M-Pesa STK push
 * through the existing mpesa module and reports its status.
 *
 * What makes an unauthenticated money endpoint safe enough:
 *  - strict validation: only phone, amount, optional giving type; unknown fields are refused;
 *  - amounts bounded (KES 10 to 150,000, the STK ceiling), phone must be a real Kenyan mobile;
 *  - the giving type must be an active one of THIS church;
 *  - an Idempotency-Key (16-80 chars, client generated) is required; a retry returns the first request;
 *  - per-IP limiter, plus a per-phone cap (3 per 10 minutes) and a per-church cap (200 per hour)
 *    counted in the database, so it holds across API replicas and a prompt cannot be spammed at a person;
 *  - nothing about members, other gifts or the ledger is ever returned; the phone is masked.
 * LIVE DARAJA IS UNVERIFIED: the push path is exercised against the mock provider and an injected HTTP
 * client only. Do not announce the page until a real shortcode has been tested end to end.
 */
import { Router } from 'express';
import { z } from 'zod';
import db from '@models';
import { env } from '../../config/env';
import { runAsTenant } from '../../common/tenant-run';
import { requestTx, route } from '../../common/http';
import { moneyInput, toInt } from '../../common/money';
import { ApiError, BadRequestError, NotFoundError } from '../../utils/errors';
import { publicGivingLimiter } from '../../middleware/rate-limit.middleware';
import { ensureGivingSetup } from '../giving/types.service';
import { insertReturningId } from '../giving/shared';
import { exec, select, selectOne } from '../finance/sql';
import { callbackSecretFor } from '../mpesa/config';
import { normalisePhone } from '../mpesa/phone';
import { stkProvider } from '../mpesa/provider';
import type { RouteMount } from '../types';

export const MIN_MINOR = 1_000; // KES 10
export const MAX_MINOR = 15_000_000; // KES 150,000
const PER_PHONE = 3;
const PER_CHURCH_HOUR = 200;

const router = Router();
router.use(publicGivingLimiter);

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/);
const keySchema = z.string().regex(/^[A-Za-z0-9_\-:.]{16,80}$/, 'Idempotency-Key must be 16-80 characters of letters, digits, _ - : .');

async function churchBySlug(raw: string) {
  const slug = slugSchema.safeParse(raw);
  const church = slug.success ? await db.Church.findOne({ where: { slug: slug.data } }) : null;
  // Same answer for "no such church" and "inactive": the page does not reveal which slugs exist.
  if (!church || !church.isActive) throw new NotFoundError('This giving page does not exist');
  return { id: church.id as number, name: church.name as string, slug: church.slug as string };
}

const maskPhone = (phone: string) => `${phone.slice(0, 6)}***${phone.slice(-3)}`;

router.get('/:slug', route(async (req) => {
  const church = await churchBySlug(req.params.slug);
  return runAsTenant(church.id, async () => {
    const t = await requestTx();
    await ensureGivingSetup(t, church.id);
    const types = await select<any>(t, `SELECT id, name FROM giving_types WHERE church_id = :churchId AND is_active = :active ORDER BY name`, { churchId: church.id, active: true });
    return {
      church: { name: church.name, slug: church.slug },
      types: types.map((r) => ({ id: toInt(r.id), name: r.name })),
      minAmountMinor: MIN_MINOR,
      maxAmountMinor: MAX_MINOR,
      configured: Boolean(callbackSecretFor(church.slug)),
      testMode: env.MPESA_MODE === 'mock'
    };
  });
}));

const giveBody = z
  .object({
    phone: z.string().min(9).max(16),
    amount: moneyInput,
    givingTypeId: z.number().int().positive().optional()
  })
  .strict();

router.post('/:slug', route(async (req) => {
  const church = await churchBySlug(req.params.slug);
  const key = keySchema.safeParse(req.header('idempotency-key'));
  if (!key.success) throw new BadRequestError(key.error.issues[0].message);
  const body = giveBody.parse(req.body);
  const phone = normalisePhone(body.phone);
  if (!phone) throw new BadRequestError('enter a valid Kenyan mobile number, for example 0712 345 678');
  if (body.amount < MIN_MINOR || body.amount > MAX_MINOR) throw new BadRequestError('the amount must be between KES 10 and KES 150,000');
  const secret = callbackSecretFor(church.slug);
  if (!secret) throw new ApiError('Giving by M-Pesa is not available for this church yet', 503);

  return runAsTenant(church.id, async () => {
    const t = await requestTx();
    await ensureGivingSetup(t, church.id);

    const prior = await selectOne<any>(t, `SELECT * FROM mpesa_stk_requests WHERE church_id = :churchId AND public_key = :key`, { churchId: church.id, key: key.data });
    if (prior) {
      if (prior.phone !== phone || toInt(prior.amount_minor) !== body.amount) throw new ApiError('That Idempotency-Key was already used for a different gift', 422);
      return { status: prior.status as string, phone: maskPhone(prior.phone), message: 'This request was already received.', replayed: true };
    }

    if (body.givingTypeId) {
      const type = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId AND id = :id AND is_active = :active`, { churchId: church.id, id: body.givingTypeId, active: true });
      if (!type) throw new BadRequestError('choose one of the giving options listed on the page');
    }

    const since10 = new Date(Date.now() - 10 * 60_000);
    const sinceHour = new Date(Date.now() - 60 * 60_000);
    const byPhone = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM mpesa_stk_requests WHERE church_id = :churchId AND phone = :phone AND created_at >= :since`, { churchId: church.id, phone, since: since10 });
    if (toInt(byPhone?.n) >= PER_PHONE) throw new ApiError('Too many requests for this number. Wait a few minutes before trying again.', 429);
    const byChurch = await selectOne<any>(t, `SELECT COUNT(*) AS n FROM mpesa_stk_requests WHERE church_id = :churchId AND public_key IS NOT NULL AND created_at >= :since`, { churchId: church.id, since: sinceHour });
    if (toInt(byChurch?.n) >= PER_CHURCH_HOUR) throw new ApiError('This page is receiving too many requests right now. Try again later.', 429);

    const requestId = await insertReturningId(
      t,
      `INSERT INTO mpesa_stk_requests (church_id, phone, amount_minor, account_ref, giving_type_id, public_key, created_at)
       VALUES (:churchId, :phone, :amount, 'ONLINE', :typeId, :key, :now)`,
      { churchId: church.id, phone, amount: body.amount, typeId: body.givingTypeId ?? null, key: key.data, now: new Date() }
    );
    const base = (process.env.MPESA_CALLBACK_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
    try {
      const response = await stkProvider().initiate({
        phone,
        amountMinor: body.amount,
        accountRef: 'ONLINE',
        description: 'Church giving',
        callbackUrl: `${base}/mpesa/stk/callback/${church.slug}/${secret}`
      });
      await exec(t, `UPDATE mpesa_stk_requests SET checkout_request_id = :checkout, merchant_request_id = :merchant WHERE church_id = :churchId AND id = :id`, { checkout: response.checkoutRequestId, merchant: response.merchantRequestId, churchId: church.id, id: requestId });
      return { status: 'PENDING', phone: maskPhone(phone), message: 'Check your phone and enter your M-Pesa PIN to complete the gift.', replayed: false };
    } catch (error) {
      await exec(t, `UPDATE mpesa_stk_requests SET status = 'FAILED', result_desc = :desc, completed_at = :now WHERE church_id = :churchId AND id = :id`, { desc: (error as Error).message.slice(0, 300), now: new Date(), churchId: church.id, id: requestId });
      // The failure is recorded (so the throttle sees it) and answered as a failure, not thrown, or the row would roll back.
      return { status: 'FAILED', phone: maskPhone(phone), message: 'We could not reach M-Pesa. Please try again in a moment.', replayed: false };
    }
  });
}, 202));

/** Status of one gift, found only by the donor's own idempotency key (an unguessable, client-held secret). */
router.get('/:slug/status', route(async (req) => {
  const church = await churchBySlug(req.params.slug);
  const key = keySchema.safeParse(req.header('idempotency-key'));
  if (!key.success) throw new BadRequestError(key.error.issues[0].message);
  return runAsTenant(church.id, async () => {
    const row = await selectOne<any>(await requestTx(), `SELECT status, result_desc, mpesa_receipt, phone FROM mpesa_stk_requests WHERE church_id = :churchId AND public_key = :key`, { churchId: church.id, key: key.data });
    if (!row) throw new NotFoundError('No gift found for that reference');
    return { status: row.status as string, phone: maskPhone(row.phone), receipt: row.mpesa_receipt ?? null, message: row.result_desc ?? null };
  });
}));

const mounts: RouteMount[] = [{ path: '/public/give', router }];
export default mounts;

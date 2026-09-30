import { Router } from 'express';
import { z } from 'zod';
import db from '@models';
import { env } from '../../config/env';
import { logger } from '../../common/logger';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { runAsTenant } from '../../common/tenant-run';
import { input, requestTx, route } from '../../common/http';
import { moneyInput, toMinor } from '../../common/money';
import { ApiError, BadRequestError, NotFoundError } from '../../utils/errors';
import { ensureGivingSetup } from '../giving/types.service';
import { insertReturningId } from '../giving/shared';
import { exec, select, selectOne } from '../finance/sql';
import type { RouteMount } from '../types';
import { callbackSecretFor, secretMatches } from './config';
import { normalisePhone } from './phone';
import { stkProvider } from './provider';
import {
  allocateReceipt,
  applyStkResult,
  listReceipts,
  parseTransTime,
  processReceipt,
  ReceiptInput,
  recordReceiptFailure,
  retryReceipt
} from './ingest.service';
import { toInt } from '../../common/money';

const router = Router();

// ===========================================================================================
// Public callbacks. No JWT: Safaricom cannot send one. The URL carries the church slug and a
// secret derived from it, both checked before anything is read or written.
// ===========================================================================================

async function churchFor(slug: string, secret: string): Promise<number | null> {
  if (!secretMatches(slug, secret)) return null;
  const church = await db.Church.findOne({ where: { slug } });
  return church && church.isActive ? (church.id as number) : null;
}

const ACK = { ResultCode: 0, ResultDesc: 'Accepted' };

function c2bInput(body: Record<string, unknown>): ReceiptInput {
  const transId = String(body.TransID ?? '');
  if (!/^[A-Za-z0-9]{6,20}$/.test(transId)) throw new BadRequestError('TransID is missing or malformed');
  const payer = [body.FirstName, body.MiddleName, body.LastName].filter(Boolean).join(' ');
  return {
    transId,
    channel: 'C2B',
    amountMinor: toMinor(String(body.TransAmount ?? '')),
    msisdn: body.MSISDN ? String(body.MSISDN) : null,
    billRef: body.BillRefNumber ? String(body.BillRefNumber) : null,
    shortcode: body.BusinessShortCode ? String(body.BusinessShortCode) : null,
    payerName: payer || null,
    transTime: parseTransTime(body.TransTime),
    transType: body.TransactionType ? String(body.TransactionType) : null,
    raw: body
  };
}

router.post('/c2b/validation/:slug/:secret', async (req, res) => {
  const churchId = await churchFor(req.params.slug, req.params.secret).catch(() => null);
  if (!churchId) return res.status(403).json({ ResultCode: 'C2B00016', ResultDesc: 'Rejected' });
  try {
    c2bInput(req.body ?? {});
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch {
    return res.status(200).json({ ResultCode: 'C2B00012', ResultDesc: 'Rejected' });
  }
});

router.post('/c2b/confirmation/:slug/:secret', async (req, res) => {
  const churchId = await churchFor(req.params.slug, req.params.secret).catch(() => null);
  if (!churchId) return res.status(403).json({ ResultCode: 'C2B00016', ResultDesc: 'Rejected' });

  let receipt: ReceiptInput;
  try {
    receipt = c2bInput(req.body ?? {});
  } catch (error) {
    logger.warn('malformed C2B confirmation', { requestId: req.id, reason: (error as Error).message });
    return res.status(200).json(ACK);
  }
  try {
    await runAsTenant(churchId, async () => {
      const t = await requestTx();
      await ensureGivingSetup(t, churchId);
      await processReceipt(t, churchId, receipt);
    });
  } catch (error) {
    // The money has moved whether or not we could book it, so the receipt is kept, flagged, and
    // can be retried from the inbox. Safaricom still gets its acknowledgement so it stops retrying.
    logger.error('C2B receipt could not be posted', { requestId: req.id, transId: receipt.transId, error: (error as Error).message });
    await runAsTenant(churchId, async () => recordReceiptFailure(await requestTx(), churchId, receipt, (error as Error).message)).catch((inner) =>
      logger.error('C2B failure could not be recorded', { transId: receipt.transId, error: (inner as Error).message })
    );
  }
  return res.status(200).json(ACK);
});

router.post('/stk/callback/:slug/:secret', async (req, res) => {
  const churchId = await churchFor(req.params.slug, req.params.secret).catch(() => null);
  if (!churchId) return res.status(403).json(ACK);
  const callback = (req.body?.Body?.stkCallback ?? {}) as Record<string, any>;
  if (typeof callback.CheckoutRequestID !== 'string') return res.status(200).json(ACK);
  const items: Array<{ Name: string; Value: unknown }> = callback.CallbackMetadata?.Item ?? [];
  const meta = (name: string) => items.find((i) => i.Name === name)?.Value;
  try {
    await runAsTenant(churchId, async () => {
      await applyStkResult(await requestTx(), churchId, {
        checkoutRequestId: callback.CheckoutRequestID,
        resultCode: Number(callback.ResultCode),
        resultDesc: String(callback.ResultDesc ?? ''),
        receipt: meta('MpesaReceiptNumber') ? String(meta('MpesaReceiptNumber')) : null,
        amountMinor: meta('Amount') !== undefined ? toMinor(String(meta('Amount'))) : null,
        phone: meta('PhoneNumber') ? String(meta('PhoneNumber')) : null
      });
    });
  } catch (error) {
    logger.error('STK callback could not be applied', { requestId: req.id, checkoutRequestId: callback.CheckoutRequestID, error: (error as Error).message });
  }
  return res.status(200).json(ACK);
});

// ===========================================================================================
// Console endpoints
// ===========================================================================================

const auth = Router();
auth.use(authenticateToken);
const read = requirePermission('giving:read');
const write = requirePermission('giving:write');
const me = () => currentTenant();
const id = z.string().regex(/^\d+$/).transform(Number);
const idOnly = z.object({ params: z.object({ id }) });

auth.get('/config', write, route(async () => {
  const t = await requestTx();
  const church = await selectOne<any>(t, `SELECT slug FROM churches WHERE id = :id`, { id: me().churchId });
  const secret = callbackSecretFor(church!.slug);
  const base = (process.env.MPESA_CALLBACK_BASE_URL ?? '').replace(/\/$/, '');
  const url = (path: string) => (secret ? `${base}/mpesa/${path}/${church!.slug}/${secret}` : null);
  return {
    mode: env.MPESA_MODE,
    configured: Boolean(secret),
    callbackBaseUrl: base || null,
    c2bValidationUrl: url('c2b/validation'),
    c2bConfirmationUrl: url('c2b/confirmation'),
    stkCallbackUrl: url('stk/callback')
  };
}));

auth.get('/transactions', read, route(async (req) => {
  const query = z.object({ status: z.enum(['MATCHED', 'UNALLOCATED', 'ALLOCATED', 'ERROR']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(200).optional() }).parse(req.query);
  return listReceipts(await requestTx(), me().churchId, { status: query.status }, query.limit, query.cursor);
}));

const allocateSchema = z.object({
  params: z.object({ id }),
  body: z.object({
    memberId: z.number().int().positive().nullish(),
    givingTypeId: z.number().int().positive(),
    fundId: z.number().int().positive().nullish(),
    contributorName: z.string().max(255).nullish()
  })
});
auth.post('/transactions/:id/allocate', write, route(async (req) => {
  const { params, body } = input(allocateSchema, req);
  return allocateReceipt(await requestTx(), me().churchId, me().userId, params.id, body);
}));
auth.post('/transactions/:id/retry', write, route(async (req) => retryReceipt(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));

const stkSchema = z.object({
  body: z
    .object({
      memberId: z.number().int().positive().optional(),
      phone: z.string().min(9).max(16).optional(),
      amount: moneyInput,
      givingTypeId: z.number().int().positive().optional(),
      fundId: z.number().int().positive().optional()
    })
    .refine((v) => v.memberId || v.phone, { message: 'give a memberId or a phone number' })
});

auth.post('/stk-push', write, route(async (req) => {
  const { body } = input(stkSchema, req);
  const t = await requestTx();
  const { churchId, userId } = me();
  await ensureGivingSetup(t, churchId);
  const church = await selectOne<any>(t, `SELECT slug FROM churches WHERE id = :id`, { id: churchId });
  const secret = callbackSecretFor(church!.slug);
  if (!secret) throw new ApiError('M-Pesa is not configured (MPESA_CALLBACK_SECRET is not set)', 503);

  let phone = normalisePhone(body.phone);
  if (body.memberId) {
    const member = await selectOne<any>(t, `SELECT phone_number FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: body.memberId });
    if (!member) throw new BadRequestError('memberId does not refer to a member in this church');
    phone = phone ?? normalisePhone(member.phone_number);
  }
  if (!phone) throw new BadRequestError('a valid Kenyan mobile number is required');
  const accountRef = body.memberId ? `M${body.memberId}` : 'GIVING';

  const requestId = await insertReturningId(
    t,
    `INSERT INTO mpesa_stk_requests (church_id, member_id, phone, amount_minor, account_ref, giving_type_id, fund_id, requested_by, created_at)
     VALUES (:churchId, :memberId, :phone, :amount, :ref, :typeId, :fundId, :actor, :now)`,
    { churchId, memberId: body.memberId ?? null, phone, amount: body.amount, ref: accountRef, typeId: body.givingTypeId ?? null, fundId: body.fundId ?? null, actor: userId, now: new Date() }
  );
  const base = (process.env.MPESA_CALLBACK_BASE_URL ?? 'http://localhost').replace(/\/$/, '');
  try {
    const response = await stkProvider().initiate({
      phone,
      amountMinor: body.amount,
      accountRef,
      description: 'Church giving',
      callbackUrl: `${base}/mpesa/stk/callback/${church!.slug}/${secret}`
    });
    await exec(t, `UPDATE mpesa_stk_requests SET checkout_request_id = :checkout, merchant_request_id = :merchant WHERE church_id = :churchId AND id = :id`, {
      checkout: response.checkoutRequestId,
      merchant: response.merchantRequestId,
      churchId,
      id: requestId
    });
    return { id: requestId, status: 'PENDING', provider: stkProvider().name, checkoutRequestId: response.checkoutRequestId, message: response.customerMessage };
  } catch (error) {
    await exec(t, `UPDATE mpesa_stk_requests SET status = 'FAILED', result_desc = :desc, completed_at = :now WHERE church_id = :churchId AND id = :id`, {
      desc: (error as Error).message.slice(0, 300),
      now: new Date(),
      churchId,
      id: requestId
    });
    // The failed request row must survive, so respond with the failure instead of throwing (a 4xx/5xx rolls back).
    return { id: requestId, status: 'FAILED', provider: stkProvider().name, message: (error as Error).message };
  }
}, 202));

auth.get('/stk-requests', read, route(async (req) => {
  const t = await requestTx();
  const rows = await select<any>(
    t,
    `SELECT * FROM mpesa_stk_requests WHERE church_id = :churchId ORDER BY id DESC LIMIT :limit`,
    { churchId: me().churchId, limit: Math.min(Number(req.query.limit) || 50, 200) }
  );
  return rows.map((r) => ({
    id: toInt(r.id),
    memberId: r.member_id === null ? null : toInt(r.member_id),
    phone: r.phone,
    amountMinor: toInt(r.amount_minor),
    status: r.status,
    checkoutRequestId: r.checkout_request_id,
    mpesaReceipt: r.mpesa_receipt,
    resultDesc: r.result_desc,
    createdAt: new Date(r.created_at).toISOString()
  }));
}));

// Mock-mode only: lets a demo or a test play the part of Safaricom.
const mockOnly = (_req: unknown, _res: unknown, next: (e?: unknown) => void) =>
  env.MPESA_MODE === 'mock' ? next() : next(new NotFoundError('simulation is only available in mock mode'));

const simulateC2b = z.object({
  body: z.object({
    amount: moneyInput,
    msisdn: z.string().max(20).optional(),
    billRef: z.string().max(60).optional(),
    transId: z.string().regex(/^[A-Za-z0-9]{6,20}$/).optional(),
    payerName: z.string().max(100).optional()
  })
});
auth.post('/simulate/c2b', mockOnly, write, route(async (req) => {
  const { body } = input(simulateC2b, req);
  const t = await requestTx();
  const { churchId } = me();
  await ensureGivingSetup(t, churchId);
  const transId = body.transId ?? `MOCK${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1e4)}`;
  return processReceipt(t, churchId, { transId, channel: 'C2B', amountMinor: body.amount, msisdn: body.msisdn ?? null, billRef: body.billRef ?? null, payerName: body.payerName ?? null, raw: { simulated: true } });
}, 201));

const simulateStk = z.object({ body: z.object({ checkoutRequestId: z.string().min(5).max(80), success: z.boolean().default(true) }) });
auth.post('/simulate/stk-result', mockOnly, write, route(async (req) => {
  const { body } = input(simulateStk, req);
  return applyStkResult(await requestTx(), me().churchId, {
    checkoutRequestId: body.checkoutRequestId,
    resultCode: body.success ? 0 : 1032,
    resultDesc: body.success ? 'The service request is processed successfully.' : 'Request cancelled by user',
    receipt: body.success ? `MOCK${Date.now().toString(36).toUpperCase()}` : null
  });
}));

router.use(auth);

const mounts: RouteMount[] = [{ path: '/mpesa', router }];
export default mounts;

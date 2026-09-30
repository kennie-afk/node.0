import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, requirePermission } from '../../middleware/auth.middleware';
import { currentTenant } from '../../common/tenant-context';
import { idempotent } from '../../common/idempotency';
import { input, requestTx, route } from '../../common/http';
import { moneyInput } from '../../common/money';
import { preferReplica } from '../../common/tenant-db';
import { ensureFinanceSetup } from '../finance/setup.service';
import { idParam, isoDate, limitQuery } from '../finance/schemas';
import { ensureBankAccounts } from '../banking/accounts.service';
import type { RouteMount } from '../types';
import * as vendors from './vendors.service';
import * as bills from './bills.service';
import * as petty from './petty.service';

const router = Router();
router.use(authenticateToken);
router.use(async (_req, _res, next) => {
  try {
    const t = await requestTx();
    const { churchId } = currentTenant();
    await ensureFinanceSetup(t, churchId);
    await ensureBankAccounts(t, churchId);
    next();
  } catch (error) {
    next(error);
  }
});
const me = () => ({ churchId: currentTenant().churchId, userId: currentTenant().userId });
const today = () => new Date().toISOString().slice(0, 10);
const pos = z.number().int().positive();
const idOnly = z.object({ params: idParam });
const reasonBody = z.object({ params: idParam, body: z.object({ reason: z.string().min(3).max(300) }) });

const phone = z.string().max(20).nullish();
const vendorFields = {
  kind: z.enum(['VENDOR', 'STAFF', 'MEMBER']).optional(),
  name: z.string().min(2).max(150),
  kraPin: z.string().regex(/^[AP]\d{9}[A-Za-z]$/, 'a KRA PIN looks like A123456789B').nullish(),
  phone, email: z.string().email().max(100).nullish(), bankName: z.string().max(100).nullish(), bankAccount: z.string().max(40).nullish(),
  mpesaNumber: z.string().regex(/^(?:\+?254|0)[17]\d{8}$/, 'use a Kenyan mobile number such as 0712345678').nullish(), memberId: pos.nullish(), notes: z.string().max(500).nullish()
};
const vendorCreate = z.object({ body: z.object(vendorFields) });
const vendorUpdate = z.object({ params: idParam, body: z.object({ ...vendorFields, name: vendorFields.name.optional(), isActive: z.boolean().optional() }).strict() });
const vendorList = z.object({ query: z.object({ q: z.string().max(100).optional(), kind: z.enum(['VENDOR', 'STAFF', 'MEMBER']).optional(), active: z.enum(['true', 'false']).optional(), limit: limitQuery, cursor: z.string().max(300).optional() }) });

const line = z.object({ accountId: pos, fundId: pos, ministryId: pos.nullish(), description: z.string().max(255).nullish(), amount: moneyInput });
const billFields = { vendorId: pos, reference: z.string().max(60).nullish(), billDate: isoDate, dueDate: isoDate, memo: z.string().max(500).nullish(), lines: z.array(line).min(1).max(200) };
const billCreate = z.object({ body: z.object({ kind: z.enum(['VENDOR_BILL', 'EXPENSE_CLAIM']).optional(), ...billFields }) });
const billUpdate = z.object({ params: idParam, body: z.object(billFields).partial().extend({ kind: z.enum(['VENDOR_BILL', 'EXPENSE_CLAIM']).optional() }).strict() });
const billList = z.object({
  query: z.object({
    status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(), vendorId: z.coerce.number().int().positive().optional(), kind: z.enum(['VENDOR_BILL', 'EXPENSE_CLAIM']).optional(),
    from: isoDate.optional(), to: isoDate.optional(), q: z.string().max(100).optional(), overdue: z.enum(['true', 'false']).optional(), limit: limitQuery, cursor: z.string().max(300).optional()
  })
});
const approveBody = z.object({ params: idParam, body: z.object({ postingDate: isoDate.optional() }).default({}) });
const payBody = z.object({
  params: idParam,
  body: z.object({ amount: moneyInput, paidDate: isoDate.optional(), bankAccountId: pos.optional(), accountId: pos.optional(), reference: z.string().max(80).nullish() })
});
const payVoidParams = z.object({ params: z.object({ id: idParam.shape.id, paymentId: idParam.shape.id }), body: z.object({ reason: z.string().min(3).max(300) }) });
const attachBody = z.object({ params: idParam, body: z.object({ fileName: z.string().min(1).max(200), contentType: z.string().min(3).max(100), sizeBytes: z.number().int().min(0).max(50_000_000), storageKey: z.string().min(1).max(300) }) });
const attachDelete = z.object({ params: z.object({ id: idParam.shape.id, attachmentId: idParam.shape.id }) });
const agingQuery = z.object({ query: z.object({ asOf: isoDate.optional() }) });

const toBill = (b: z.infer<typeof billCreate>['body']) => ({
  ...b,
  lines: b.lines.map((l) => ({ accountId: l.accountId, fundId: l.fundId, ministryId: l.ministryId, description: l.description, amountMinor: l.amount }))
});

// ---- vendors -----------------------------------------------------------------------------------
router.get('/vendors', requirePermission('finance:read'), route(async (req) => {
  const { query } = input(vendorList, req);
  return vendors.listVendors(await requestTx(), me().churchId, { ...query, active: query.active === undefined ? undefined : query.active === 'true' });
}));
router.post('/vendors', requirePermission('finance:post'), route(async (req) => vendors.createVendor(await requestTx(), me().churchId, me().userId, input(vendorCreate, req).body), 201));
router.get('/vendors/:id', requirePermission('finance:read'), route(async (req) => vendors.getVendor(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.put('/vendors/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(vendorUpdate, req);
  return vendors.updateVendor(await requestTx(), me().churchId, me().userId, params.id, body);
}));

// ---- bills & claims ----------------------------------------------------------------------------
router.get('/bills', requirePermission('finance:read'), route(async (req) => {
  const { query } = input(billList, req);
  return bills.listBills(await requestTx(), me().churchId, { ...query, overdue: query.overdue === 'true' });
}));
router.post('/bills', requirePermission('finance:post'), route(async (req) => bills.createBill(await requestTx(), me().churchId, me().userId, toBill(input(billCreate, req).body)), 201));
router.post('/expense-claims', requirePermission('finance:post'), route(async (req) => bills.createBill(await requestTx(), me().churchId, me().userId, { ...toBill(input(billCreate, req).body), kind: 'EXPENSE_CLAIM' }), 201));
router.get('/bills/:id', requirePermission('finance:read'), route(async (req) => bills.getBill(await requestTx(), me().churchId, input(idOnly, req).params.id)));
router.put('/bills/:id', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(billUpdate, req);
  const changes: any = { ...body };
  if (body.lines) changes.lines = body.lines.map((l) => ({ accountId: l.accountId, fundId: l.fundId, ministryId: l.ministryId, description: l.description, amountMinor: l.amount }));
  return bills.updateBill(await requestTx(), me().churchId, me().userId, params.id, changes);
}));
router.delete('/bills/:id', requirePermission('finance:post'), route(async (req) => {
  await bills.deleteBill(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id);
  return undefined;
}, 204));
router.post('/bills/:id/submit', requirePermission('finance:post'), route(async (req) => bills.submitBill(await requestTx(), me().churchId, me().userId, input(idOnly, req).params.id)));
router.post('/bills/:id/approve', requirePermission('finance:approve'), route(async (req) => {
  const { params, body } = input(approveBody, req);
  return bills.approveBill(await requestTx(), me().churchId, me().userId, params.id, body);
}));
router.post('/bills/:id/reject', requirePermission('finance:approve'), route(async (req) => {
  const { params, body } = input(reasonBody, req);
  return bills.rejectBill(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));
router.post('/bills/:id/void', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(reasonBody, req);
  return bills.voidBill(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));
router.post('/bills/:id/pay', requirePermission('finance:post'), idempotent(), route(async (req) => {
  const { params, body } = input(payBody, req);
  const result = await bills.payBill(await requestTx(), me().churchId, me().userId, params.id, {
    amountMinor: body.amount, paidDate: body.paidDate ?? today(), bankAccountId: body.bankAccountId, accountId: body.accountId, reference: body.reference, idempotencyKey: req.header('idempotency-key') ?? null
  });
  return result;
}, 201));
router.post('/bills/:id/payments/:paymentId/void', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(payVoidParams, req);
  return bills.voidPayment(await requestTx(), me().churchId, me().userId, params.id, params.paymentId, body.reason);
}));
router.post('/bills/:id/attachments', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(attachBody, req);
  return bills.addAttachment(await requestTx(), me().churchId, me().userId, params.id, body);
}, 201));
router.delete('/bills/:id/attachments/:attachmentId', requirePermission('finance:post'), route(async (req) => {
  const { params } = input(attachDelete, req);
  return bills.removeAttachment(await requestTx(), me().churchId, params.id, params.attachmentId);
}));

router.get('/reports/aging', requirePermission('finance:read'), preferReplica, route(async (req) => bills.agingReport(await requestTx(), me().churchId, input(agingQuery, req).query.asOf ?? today())));

// ---- petty cash --------------------------------------------------------------------------------
const voucherCreate = z.object({ body: z.object({ bankAccountId: pos, date: isoDate, payee: z.string().min(2).max(150), memo: z.string().max(300).nullish(), accountId: pos, fundId: pos, ministryId: pos.nullish(), amount: moneyInput }) });
const voucherList = z.object({ query: z.object({ bankAccountId: z.coerce.number().int().positive().optional(), status: z.enum(['POSTED', 'VOID']).optional(), limit: limitQuery, cursor: z.string().max(100).optional() }) });
const replenishBody = z.object({ params: z.object({ bankAccountId: idParam.shape.id }), body: z.object({ date: isoDate.optional(), sourceBankAccountId: pos.optional(), sourceAccountId: pos.optional() }) });
const pettyParam = z.object({ params: z.object({ bankAccountId: idParam.shape.id }) });

router.get('/petty-cash/vouchers', requirePermission('finance:read'), route(async (req) => petty.listVouchers(await requestTx(), me().churchId, input(voucherList, req).query)));
router.post('/petty-cash/vouchers', requirePermission('finance:post'), route(async (req) => {
  const { body } = input(voucherCreate, req);
  return petty.createVoucher(await requestTx(), me().churchId, me().userId, { ...body, amountMinor: body.amount });
}, 201));
router.post('/petty-cash/vouchers/:id/void', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(reasonBody, req);
  return petty.voidVoucher(await requestTx(), me().churchId, me().userId, params.id, body.reason);
}));
router.get('/petty-cash/:bankAccountId/status', requirePermission('finance:read'), route(async (req) => petty.pettyStatus(await requestTx(), me().churchId, input(pettyParam, req).params.bankAccountId)));
router.post('/petty-cash/:bankAccountId/replenish', requirePermission('finance:post'), route(async (req) => {
  const { params, body } = input(replenishBody, req);
  return petty.replenish(await requestTx(), me().churchId, me().userId, params.bankAccountId, body);
}, 201));

const mounts: RouteMount[] = [{ path: '/payables', router }];
export default mounts;

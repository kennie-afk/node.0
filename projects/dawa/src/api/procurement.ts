import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inBranch, inOrg, pageLimit, parse, queryInt, queryString } from './helpers';
import {
  cancelPurchaseOrder, createCreditNote, createPurchaseOrder, creditNoteSchema, getPurchaseOrder, listPurchaseOrders, listSupplierReturns, purchaseOrderSchema,
  receivePoSchema, receivePurchaseOrder, returnToSupplier, supplierReturnSchema, voidInvoiceSchema, voidSupplierInvoice
} from '../procurement/service';

const router = Router();
router.use(authenticate);

router.post('/purchase-orders', requireWritable, wrap(async (req, res) => {
  const input = parse(purchaseOrderSchema, req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => createPurchaseOrder(client, ctx, branch, input)));
}));
router.get('/purchase-orders', requirePermission('receive_stock'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, _ctx, branch) =>
    listPurchaseOrders(client, branch.id, { status: queryString(req.query.status), supplierId: queryString(req.query.supplierId), limit: pageLimit(req.query.limit, 50, 200), offset: queryInt(req.query.offset, 0) })));
}));
router.get('/purchase-orders/:id', requirePermission('receive_stock'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => getPurchaseOrder(client, String(req.params.id))));
}));
router.post('/purchase-orders/:id/receive', requireWritable, wrap(async (req, res) => {
  const input = parse(receivePoSchema.extend({ branchId: z.string().uuid().optional() }), req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => receivePurchaseOrder(client, ctx, branch, String(req.params.id), input)));
}));
router.post('/purchase-orders/:id/cancel', requireWritable, wrap(async (req, res) => {
  const input = parse(z.object({ reason: z.string().trim().min(3).max(300) }), req.body);
  res.json(await inOrg(req, (client, ctx) => cancelPurchaseOrder(client, ctx, String(req.params.id), input.reason)));
}));

router.post('/supplier-returns', requireWritable, wrap(async (req, res) => {
  const input = parse(supplierReturnSchema, req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => returnToSupplier(client, ctx, branch, input)));
}));
router.get('/supplier-returns', requirePermission('receive_stock'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, _ctx, branch) => listSupplierReturns(client, branch.id, { limit: pageLimit(req.query.limit, 50, 200), offset: queryInt(req.query.offset, 0) })));
}));

router.post('/credit-notes', requireWritable, wrap(async (req, res) => {
  const input = parse(creditNoteSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createCreditNote(client, ctx, input)));
}));

router.post('/payables/:id/void', requireWritable, wrap(async (req, res) => {
  const input = parse(voidInvoiceSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => voidSupplierInvoice(client, ctx, String(req.params.id), input.reason)));
}));

export default router;

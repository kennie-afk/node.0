import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { wrap } from '../common/context';
import { inOrg, parse, queryInt, queryString } from './helpers';
import { createProduct, createSupplier, listProducts, listSuppliers, productSchema, supplierSchema, updateProduct } from '../inventory/service';
import {
  accountPaymentSchema, createCustomer, createPriceList, customerSchema, listCustomers, listPriceLists, priceItemSchema, priceListSchema,
  recordAccountPayment, setPriceListItem, statement, updateCustomerTerms
} from '../customers/service';

const router = Router();
router.use(authenticate);

router.get('/products', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listProducts(client, {
    search: queryString(req.query.search), category: queryString(req.query.category), includeInactive: req.query.includeInactive === 'true',
    limit: queryInt(req.query.limit, 50), offset: queryInt(req.query.offset, 0)
  })));
}));

router.post('/products', requireWritable, wrap(async (req, res) => {
  const input = parse(productSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createProduct(client, ctx, input)));
}));

router.patch('/products/:id', requireWritable, wrap(async (req, res) => {
  const input = parse(productSchema.partial().extend({ active: z.boolean().optional() }), req.body);
  res.json(await inOrg(req, (client, ctx) => updateProduct(client, ctx, String(req.params.id), input)));
}));

router.get('/suppliers', requirePermission('receive_stock'), wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listSuppliers(client)));
}));
router.post('/suppliers', requireWritable, wrap(async (req, res) => {
  const input = parse(supplierSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createSupplier(client, ctx, input)));
}));

router.get('/customers', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listCustomers(client, { search: queryString(req.query.search), limit: queryInt(req.query.limit, 100) })));
}));
router.post('/customers', requireWritable, wrap(async (req, res) => {
  const input = parse(customerSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createCustomer(client, ctx, input)));
}));
router.patch('/customers/:id', requireWritable, wrap(async (req, res) => {
  const input = parse(z.object({ creditLimitCents: z.number().int().min(0).max(1_000_000_000).optional(), priceListId: z.string().uuid().nullable().optional(), active: z.boolean().optional() }), req.body);
  res.json(await inOrg(req, (client, ctx) => updateCustomerTerms(client, ctx, String(req.params.id), input)));
}));
router.get('/customers/:id/statement', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => statement(client, String(req.params.id))));
}));
router.post('/customers/:id/payments', requireWritable, wrap(async (req, res) => {
  const input = parse(accountPaymentSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => recordAccountPayment(client, ctx, String(req.params.id), ctx.branchId, input)));
}));

router.get('/price-lists', wrap(async (req, res) => {
  res.json(await inOrg(req, (client) => listPriceLists(client)));
}));
router.post('/price-lists', requireWritable, wrap(async (req, res) => {
  const input = parse(priceListSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => createPriceList(client, ctx, input)));
}));
router.put('/price-lists/:id/items', requireWritable, wrap(async (req, res) => {
  const input = parse(priceItemSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => setPriceListItem(client, ctx, String(req.params.id), input)));
}));

export default router;

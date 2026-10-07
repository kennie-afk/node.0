import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireWritable } from './middleware';
import { businessDayNow, wrap } from '../common/context';
import { inBranch, pageLimit, parse, queryInt, queryString } from './helpers';
import { adjustSchema, adjustStock, alerts, batchStatusSchema, controlledRegister, findProductByGtin, listBatches, receiveSchema, receiveStock, setBatchStatus, stockSummary, writeOffExpired } from '../inventory/service';
import { Gs1Error, parseScan } from '../gs1/parse';
import { BadRequestError, ForbiddenError } from '../domain/errors';

const router = Router();
router.use(authenticate);

router.get('/stock', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => stockSummary(client, branch, await businessDayNow(client, branch.timezone), { search: queryString(req.query.search), limit: pageLimit(req.query.limit, 100, 500), offset: queryInt(req.query.offset, 0) })));
}));

router.get('/stock/batches', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, _ctx, branch) => listBatches(client, branch.id, { productId: queryString(req.query.productId), search: queryString(req.query.search), includeEmpty: req.query.includeEmpty === 'true', status: queryString(req.query.status), limit: pageLimit(req.query.limit, 200, 500), offset: queryInt(req.query.offset, 0) })));
}));

router.get('/stock/alerts', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => alerts(client, branch, await businessDayNow(client, branch.timezone))));
}));

router.post('/stock/receive', requireWritable, wrap(async (req, res) => {
  const input = parse(receiveSchema, req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => receiveStock(client, ctx, branch, input)));
}));

router.patch('/stock/batches/:id/status', requireWritable, wrap(async (req, res) => {
  const input = parse(batchStatusSchema.extend({ branchId: z.string().uuid().optional() }), req.body);
  res.json(await inBranch(req, input.branchId, (client, ctx, branch) => setBatchStatus(client, ctx, branch, String(req.params.id), input)));
}));

router.post('/stock/writeoff-expired', requireWritable, wrap(async (req, res) => {
  const input = parse(z.object({ branchId: z.string().uuid().optional(), reason: z.string().trim().min(3).max(300).default('Expired stock written off') }), req.body ?? {});
  res.json(await inBranch(req, input.branchId, (client, ctx, branch) => writeOffExpired(client, ctx, branch, input.reason)));
}));

router.post('/stock/adjust', requireWritable, wrap(async (req, res) => {
  const input = parse(adjustSchema.extend({ branchId: z.string().uuid().optional() }), req.body);
  res.json(await inBranch(req, input.branchId, (client, ctx, branch) => adjustStock(client, ctx, branch, input)));
}));

/**
 * What a scanner produced: a GS1 DataMatrix or a plain barcode. Returns the parsed fields, the product it belongs to (if
 * the catalogue knows the GTIN), the stock in date, and - when the pack carries a serial number - whether that exact
 * pack is in stock, already sold, or was never received here.
 */
router.post('/scan', wrap(async (req, res) => {
  const input = parse(z.object({ input: z.string().min(1).max(500), branchId: z.string().uuid().optional() }), req.body);
  let scan;
  try {
    scan = parseScan(input.input);
  } catch (error) {
    if (error instanceof Gs1Error) throw new BadRequestError(error.message);
    throw error;
  }
  res.json(await inBranch(req, input.branchId, async (client, _ctx, branch) => {
    const product = scan.gtin ? await findProductByGtin(client, scan.gtin) : null;
    let inDate = 0;
    let serialStatus: 'in_stock' | 'sold' | 'unknown' | null = null;
    if (product) {
      const today = await businessDayNow(client, branch.timezone);
      inDate = Number((await client.query(`SELECT COALESCE(sum(qty_on_hand), 0)::int AS n FROM stock_batches WHERE branch_id = $1 AND product_id = $2 AND expiry_date >= $3::date`, [branch.id, product.id, today])).rows[0].n);
      if (scan.serial) {
        const unit = (await client.query('SELECT status, branch_id FROM serial_units WHERE product_id = $1 AND serial = $2', [product.id, scan.serial])).rows[0];
        serialStatus = !unit || unit.branch_id !== branch.id ? 'unknown' : unit.status;
      }
    }
    return { scan: { format: scan.format, gtin: scan.gtin, batchNo: scan.batchNo, expiryDate: scan.expiryDate, serial: scan.serial }, product, inDate, serialStatus };
  }));
}));

router.get('/controlled/register', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, ctx, branch) => {
    if (ctx.role === 'cashier') throw new ForbiddenError('The controlled-drug register is for pharmacists and managers.');
    return controlledRegister(client, branch.id, queryString(req.query.productId), pageLimit(req.query.limit, 100, 500), req.query.before === undefined ? undefined : queryInt(req.query.before, 0) || undefined);
  }));
}));

export default router;

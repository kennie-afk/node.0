import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { authenticate, requirePermission, requireWritable } from './middleware';
import { need, wrap } from '../common/context';
import { inBranch, inOrg, isoDay, parse, queryInt, queryString } from './helpers';
import { addPayment, createSale, getSale, listSales, paymentSchema, returnItems, returnSchema, saleSchema, voidSale, voidSchema } from '../sales/service';
import { env } from '../config/env';
import { DARAJA_ACCEPTED } from '../mpesa/daraja';
import { ingestConfirmation } from '../mpesa/service';
import { logger } from '../common/logger';
import { NotFoundError } from '../domain/errors';
import { csvCell } from '../common/csv';

const router = Router();

// ---- M-Pesa: called by Safaricom, so it carries no bearer token. The secret in the path is our own authentication;
// ---- nothing about Daraja signing its callbacks is assumed.
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post('/mpesa/:secret/confirmation', wrap(async (req, res) => {
  if (!secretMatches(String(req.params.secret), env.MPESA_CALLBACK_SECRET)) throw new NotFoundError('No route matches POST /v1/mpesa/confirmation');
  try {
    await ingestConfirmation(req.body);
  } catch (error) {
    // Daraja retries a rejected confirmation, so a malformed one is logged and acknowledged rather than looped on
    logger.warn('mpesa confirmation could not be processed', { error: error instanceof Error ? error.message : String(error) });
  }
  res.json(DARAJA_ACCEPTED);
}));

router.post('/mpesa/:secret/validation', wrap(async (req, res) => {
  if (!secretMatches(String(req.params.secret), env.MPESA_CALLBACK_SECRET)) throw new NotFoundError('No route matches POST /v1/mpesa/validation');
  res.json(DARAJA_ACCEPTED);
}));

// ---- everything below needs a signed-in person ----
router.use(authenticate);

router.post('/sales', requireWritable, wrap(async (req, res) => {
  const input = parse(saleSchema, req.body);
  res.status(201).json(await inBranch(req, input.branchId, (client, ctx, branch) => createSale(client, ctx, branch, input)));
}));

router.get('/sales', wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, (client, ctx, branch) =>
    listSales(client, ctx, branch.id, { day: queryString(req.query.day), status: queryString(req.query.status), limit: queryInt(req.query.limit, 50), offset: queryInt(req.query.offset, 0) })));
}));

router.get('/sales/:id', wrap(async (req, res) => {
  res.json(await inOrg(req, (client, ctx) => getSale(client, ctx, String(req.params.id))));
}));

router.post('/sales/:id/payments', requireWritable, wrap(async (req, res) => {
  const input = parse(paymentSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => addPayment(client, ctx, String(req.params.id), input)));
}));

router.post('/sales/:id/void', requireWritable, wrap(async (req, res) => {
  const input = parse(voidSchema, req.body);
  res.json(await inOrg(req, (client, ctx) => voidSale(client, ctx, String(req.params.id), input.reason)));
}));

router.post('/sales/:id/returns', requireWritable, wrap(async (req, res) => {
  const input = parse(returnSchema, req.body);
  res.status(201).json(await inOrg(req, (client, ctx) => returnItems(client, ctx, String(req.params.id), input)));
}));

/** M-Pesa money that reached a till and matched no sale. A manager assigns it, or a cashier claims it by typing its code. */
router.get('/mpesa/unmatched', requirePermission('day_close'), wrap(async (req, res) => {
  res.json(await inBranch(req, req.query.branchId, async (client, _ctx, branch) => {
    const rows = (await client.query(
      `SELECT external_ref, reference, amount_cents, payer_msisdn, received_at FROM mpesa_unmatched WHERE branch_id = $1 AND assigned_sale IS NULL ORDER BY received_at DESC LIMIT 100`,
      [branch.id]
    )).rows;
    return rows.map((r) => ({ externalRef: r.external_ref, reference: r.reference, amountCents: Number(r.amount_cents), payerMsisdn: r.payer_msisdn, receivedAt: r.received_at }));
  }));
}));

// ---- dispensing records ----

async function dispensingRows(req: import('express').Request, branchId: unknown, from: string | undefined, to: string | undefined, productId: string | undefined, patient: string | undefined, limit: number, offset: number) {
  return inBranch(req, branchId, async (client, ctx, branch) => {
    need(ctx, 'dispense');
    const params: unknown[] = [branch.id];
    let where = 'd.branch_id = $1';
    if (from || to) {
      params.push(branch.timezone);
      const tz = `$${params.length}::text`;
      if (from) { params.push(from); where += ` AND (d.dispensed_at AT TIME ZONE ${tz})::date >= $${params.length}::date`; }
      if (to) { params.push(to); where += ` AND (d.dispensed_at AT TIME ZONE ${tz})::date <= $${params.length}::date`; }
    }
    if (productId) { params.push(productId); where += ` AND d.product_id = $${params.length}`; }
    if (patient) { params.push(`%${patient}%`); where += ` AND d.patient_name ILIKE $${params.length}`; }
    return (await client.query(
      `SELECT d.id, d.dispensed_at, p.name AS product, p.category, d.qty, d.patient_name, d.patient_phone, d.patient_age_years, d.patient_sex,
              d.prescriber_name, d.prescriber_reg_no, d.prescription_ref, d.directions, u.display_name AS dispensed_by, u.licence_no, w.display_name AS witness, s.number AS sale_number,
              (SELECT string_agg(b.batch_no, ',') FROM sale_line_batches lb JOIN stock_batches b ON b.id = lb.batch_id WHERE lb.sale_line_id = d.sale_line_id) AS batches
         FROM dispensing_records d JOIN products p ON p.id = d.product_id JOIN users u ON u.id = d.dispensed_by LEFT JOIN users w ON w.id = d.witness_id JOIN sales s ON s.id = d.sale_id
        WHERE ${where} ORDER BY d.dispensed_at DESC LIMIT ${Math.min(limit, 5000)} OFFSET ${Math.max(0, offset)}`,
      params
    )).rows;
  });
}

router.get('/dispensing', wrap(async (req, res) => {
  const rows = await dispensingRows(req, req.query.branchId, queryString(req.query.from), queryString(req.query.to), queryString(req.query.productId), queryString(req.query.patient), queryInt(req.query.limit, 100), queryInt(req.query.offset, 0));
  res.json(rows.map((r) => ({
    id: r.id, dispensedAt: r.dispensed_at, saleNumber: r.sale_number, product: r.product, category: r.category, qty: r.qty, batches: r.batches,
    patientName: r.patient_name, patientPhone: r.patient_phone, patientAgeYears: r.patient_age_years, patientSex: r.patient_sex,
    prescriberName: r.prescriber_name, prescriberRegNo: r.prescriber_reg_no, prescriptionRef: r.prescription_ref, directions: r.directions,
    dispensedBy: r.dispensed_by, licenceNo: r.licence_no, witness: r.witness
  })));
}));

router.get('/dispensing/export.csv', wrap(async (req, res) => {
  const from = z.optional(isoDay).parse(queryString(req.query.from));
  const to = z.optional(isoDay).parse(queryString(req.query.to));
  const rows = await dispensingRows(req, req.query.branchId, from, to, queryString(req.query.productId), undefined, 5000, 0);
  const header = ['dispensed_at', 'sale', 'product', 'category', 'qty', 'batches', 'patient', 'patient_phone', 'age', 'sex', 'prescriber', 'prescriber_reg_no', 'prescription_ref', 'directions', 'dispensed_by', 'dispenser_licence', 'witness'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push([r.dispensed_at, r.sale_number, r.product, r.category, r.qty, r.batches, r.patient_name, r.patient_phone, r.patient_age_years, r.patient_sex, r.prescriber_name, r.prescriber_reg_no, r.prescription_ref, r.directions, r.dispensed_by, r.licence_no, r.witness].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="dawa-dispensing-log.csv"');
  res.send(`${lines.join('\n')}\n`);
}));

export default router;

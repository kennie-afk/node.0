/**
 * The sale path: the one transaction that moves stock and money together.
 *
 * Oversell protection is layered. Within a sale the batch rows are locked FOR UPDATE (products in a fixed order, so
 * two sales cannot deadlock each other) before FEFO decides what to take; if another sale holds the rows, this one
 * waits and then sees the stock that is really left. Behind that, stock_batches.qty_on_hand has CHECK (>= 0), so even
 * a bug here could not commit negative stock. Expired stock is never allocated.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { audit, BranchRow, businessDayNow, Ctx, need, verifyWitness, WitnessInput } from '../common/context';
import { allocateFefo, BatchLike, InsufficientStock } from '../inventory/fefo';
import { writeRegister } from '../inventory/service';
import { can } from '../domain/roles';

const witnessSchema = z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) });

export const dispensingSchema = z.object({
  patientName: z.string().trim().min(2).max(120),
  patientPhone: z.string().trim().max(30).optional().nullable(),
  patientAgeYears: z.number().int().min(0).max(130).optional().nullable(),
  patientSex: z.enum(['female', 'male', 'other']).optional().nullable(),
  prescriberName: z.string().trim().min(2).max(120),
  prescriberRegNo: z.string().trim().max(40).optional().nullable(),
  prescriptionRef: z.string().trim().max(60).optional().nullable(),
  directions: z.string().trim().max(300).optional().nullable()
});

export const paymentSchema = z.object({
  method: z.enum(['cash', 'mpesa', 'credit']),
  amountCents: z.number().int().positive().max(1_000_000_000),
  /** the M-Pesa confirmation code the customer's phone shows, when the cashier types it in */
  externalRef: z.string().trim().min(6).max(30).optional()
});

export const saleSchema = z.object({
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        qty: z.number().int().min(1).max(100_000).optional(),
        /** serials scanned from the packs being sold; qty is then their count */
        serials: z.array(z.string().trim().min(1).max(20)).max(500).optional(),
        dispensing: dispensingSchema.optional()
      })
    )
    .min(1)
    .max(100),
  payments: z.array(paymentSchema).max(6).default([]),
  discountCents: z.number().int().min(0).max(1_000_000_000).default(0),
  discountReason: z.string().trim().min(3).max(200).optional(),
  witness: witnessSchema.optional()
});
export type SaleInput = z.infer<typeof saleSchema>;

const MPESA_MATCH_WINDOW_MINUTES = 90;

function ksh(cents: number): string {
  return `KSh ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 2 })}`;
}

async function paidTotal(client: PoolClient, saleId: string): Promise<number> {
  const { rows } = await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS paid FROM sale_payments WHERE sale_id = $1', [saleId]);
  return Number(rows[0].paid);
}

async function customerBalance(client: PoolClient, customerId: string): Promise<number> {
  const { rows } = await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS balance FROM customer_ledger WHERE customer_id = $1', [customerId]);
  return Number(rows[0].balance);
}

async function assertDayOpen(client: PoolClient, branchId: string, day: string): Promise<void> {
  const closed = await client.query('SELECT 1 FROM day_closes WHERE branch_id = $1 AND business_day = $2', [branchId, day]);
  if (closed.rows.length > 0) throw new AppError(409, 'day-closed', `The day ${day} is already closed at this branch.`);
}

interface PaymentApplied {
  recorded: number;
  changeCents: number;
}

/**
 * Applies one payment to a sale. Cash may be tendered above what is due (the difference is change and is not
 * recorded as received); an M-Pesa code or a credit charge may not exceed what is due.
 */
async function applyPayment(
  client: PoolClient,
  ctx: Ctx,
  sale: { id: string; branchId: string; customerId: string | null },
  remainingCents: number,
  payment: z.infer<typeof paymentSchema>
): Promise<PaymentApplied> {
  if (remainingCents <= 0) throw new ConflictError('That sale is already fully paid.');

  if (payment.method === 'cash') {
    const recorded = Math.min(payment.amountCents, remainingCents);
    await client.query(`INSERT INTO sale_payments (org_id, branch_id, sale_id, method, amount_cents, created_by) VALUES ($1, $2, $3, 'cash', $4, $5)`, [ctx.orgId, sale.branchId, sale.id, recorded, ctx.userId]);
    return { recorded, changeCents: payment.amountCents - recorded };
  }

  if (payment.method === 'mpesa') {
    if (!payment.externalRef) throw new BadRequestError('Type the M-Pesa confirmation code, or leave the payment out and wait for the confirmation to arrive.');
    const ref = payment.externalRef.toUpperCase();
    const used = await client.query('SELECT 1 FROM sale_payments WHERE external_ref = $1', [ref]);
    if (used.rows.length > 0) throw new AppError(409, 'mpesa-code-used', `M-Pesa code ${ref} has already been applied to a sale.`);

    // The confirmation may have reached the till before the cashier typed the code: claim it from the unmatched list.
    const held = (await client.query('SELECT id, amount_cents, payer_msisdn, received_at, branch_id, assigned_sale FROM mpesa_unmatched WHERE external_ref = $1 FOR UPDATE', [ref])).rows[0];
    let amount = payment.amountCents;
    let msisdn: string | null = null;
    let receivedAt = new Date();
    if (held) {
      if (held.assigned_sale) throw new AppError(409, 'mpesa-code-used', `M-Pesa code ${ref} has already been assigned.`);
      if (held.branch_id !== sale.branchId) throw new AppError(409, 'mpesa-other-branch', 'That M-Pesa payment was made to a different branch.');
      amount = Number(held.amount_cents);
      msisdn = held.payer_msisdn;
      receivedAt = held.received_at;
    }
    if (amount > remainingCents) throw new AppError(422, 'mpesa-exceeds-due', `That M-Pesa payment is ${ksh(amount)} but only ${ksh(remainingCents)} is due on this sale.`);
    await client.query(
      `INSERT INTO sale_payments (org_id, branch_id, sale_id, method, amount_cents, external_ref, payer_msisdn, received_at, created_by)
       VALUES ($1, $2, $3, 'mpesa', $4, $5, $6, $7, $8)`,
      [ctx.orgId, sale.branchId, sale.id, amount, ref, msisdn, receivedAt, ctx.userId]
    );
    if (held) await client.query('UPDATE mpesa_unmatched SET assigned_sale = $2 WHERE id = $1', [held.id, sale.id]);
    return { recorded: amount, changeCents: 0 };
  }

  // credit: charged to the customer's account, within their limit
  if (!sale.customerId) throw new BadRequestError('Choose a customer to put this on credit.');
  const customer = (await client.query('SELECT credit_limit_cents, active, name FROM customers WHERE id = $1 FOR UPDATE', [sale.customerId])).rows[0];
  if (!customer || !customer.active) throw new NotFoundError('That customer was not found.');
  if (payment.amountCents > remainingCents) throw new AppError(422, 'credit-exceeds-due', 'The credit amount is more than is due on this sale.');
  const balance = await customerBalance(client, sale.customerId);
  if (balance + payment.amountCents > Number(customer.credit_limit_cents)) {
    throw new AppError(422, 'credit-limit', `${customer.name} would owe ${ksh(balance + payment.amountCents)}, over their limit of ${ksh(Number(customer.credit_limit_cents))}.`);
  }
  await client.query(`INSERT INTO sale_payments (org_id, branch_id, sale_id, method, amount_cents, created_by) VALUES ($1, $2, $3, 'credit', $4, $5)`, [ctx.orgId, sale.branchId, sale.id, payment.amountCents, ctx.userId]);
  await client.query(
    `INSERT INTO customer_ledger (org_id, customer_id, branch_id, kind, amount_cents, ref_type, ref_id, actor_id) VALUES ($1, $2, $3, 'sale', $4, 'sale', $5, $6)`,
    [ctx.orgId, sale.customerId, sale.branchId, payment.amountCents, sale.id, ctx.userId]
  );
  return { recorded: payment.amountCents, changeCents: 0 };
}

async function settle(client: PoolClient, saleId: string, totalCents: number): Promise<'completed' | 'pending_payment'> {
  const status = (await paidTotal(client, saleId)) >= totalCents ? 'completed' : 'pending_payment';
  await client.query('UPDATE sales SET status = $2 WHERE id = $1 AND status <> \'voided\'', [saleId, status]);
  return status;
}

export async function createSale(client: PoolClient, ctx: Ctx, branch: BranchRow, input: SaleInput) {
  need(ctx, 'sell');
  if (input.discountCents > 0) {
    need(ctx, 'discount');
    if (!input.discountReason) throw new BadRequestError('A discount needs a reason.');
  }

  const day = await businessDayNow(client, branch.timezone);
  await assertDayOpen(client, branch.id, day);

  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const products = (await client.query('SELECT * FROM products WHERE id = ANY($1::uuid[])', [productIds])).rows;
  if (products.length !== productIds.length) throw new NotFoundError('A product on the sale was not found.');
  const byId = new Map(products.map((p) => [p.id as string, p]));
  for (const p of products) if (!p.active) throw new ConflictError(`${p.name} is no longer sold.`);

  // customer, price list
  let customer: Record<string, any> | undefined;
  if (input.customerId) {
    customer = (await client.query('SELECT id, name, price_list_id, active FROM customers WHERE id = $1', [input.customerId])).rows[0];
    if (!customer || !customer.active) throw new NotFoundError('That customer was not found.');
  }
  const listPrices = new Map<string, number>();
  if (customer?.price_list_id) {
    const items = (await client.query('SELECT product_id, price_cents FROM price_list_items WHERE price_list_id = $1 AND product_id = ANY($2::uuid[])', [customer.price_list_id, productIds])).rows;
    for (const item of items) listPrices.set(item.product_id, Number(item.price_cents));
  }

  // professional rules per line
  const needsPharmacist = input.lines.some((line) => byId.get(line.productId)!.category !== 'otc');
  const hasControlled = input.lines.some((line) => byId.get(line.productId)!.category === 'controlled');
  if (needsPharmacist) need(ctx, 'dispense');
  let witnessId: string | null = null;
  if (hasControlled) {
    need(ctx, 'controlled');
    witnessId = await verifyWitness(client, ctx, input.witness as WitnessInput | undefined, normalisePhone);
  }
  for (const line of input.lines) {
    const product = byId.get(line.productId)!;
    if (product.category !== 'otc' && !line.dispensing) {
      throw new AppError(422, 'dispensing-required', `${product.name} is ${product.category === 'controlled' ? 'a controlled drug' : 'a prescription item'}: record the patient and the prescriber.`);
    }
    if (!line.qty && !(line.serials && line.serials.length)) throw new BadRequestError(`Give a quantity (or scan the packs) for ${product.name}.`);
    if (line.serials && line.qty && line.qty !== line.serials.length) throw new BadRequestError(`${product.name}: quantity and scanned packs disagree.`);
    if (line.serials && new Set(line.serials).size !== line.serials.length) throw new AppError(409, 'duplicate-scan', `${product.name}: the same pack was scanned twice.`);
  }

  // lock and allocate, products in a fixed order
  type Planned = { lineIndex: number; product: Record<string, any>; qty: number; unitPrice: number; allocations: Array<{ batchId: string; qty: number; unitCostCents: number; serials: string[] }> };
  const planned: Planned[] = [];
  const order = input.lines.map((line, lineIndex) => ({ line, lineIndex })).sort((a, b) => (a.line.productId === b.line.productId ? a.lineIndex - b.lineIndex : a.line.productId < b.line.productId ? -1 : 1));

  for (const { line, lineIndex } of order) {
    const product = byId.get(line.productId)!;
    const unitPrice = listPrices.get(product.id) ?? Number(product.list_price_cents);
    if (unitPrice <= 0) throw new AppError(422, 'no-price', `${product.name} has no price yet. Set one in the catalogue.`);
    const serials = line.serials ?? [];
    const qty = serials.length ? serials.length : line.qty!;

    const batchRows = (
      await client.query(
        `SELECT id, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, qty_on_hand, received_at, unit_cost_cents
           FROM stock_batches WHERE branch_id = $1 AND product_id = $2 AND qty_on_hand > 0 FOR UPDATE`,
        [branch.id, product.id]
      )
    ).rows;
    const batches: BatchLike[] = batchRows.map((row) => ({ id: row.id, expiryDate: row.expiry_date, qtyOnHand: row.qty_on_hand, receivedAt: row.received_at, unitCostCents: Number(row.unit_cost_cents) }));

    let allocations: Planned['allocations'];
    if (serials.length) {
      const units = (await client.query('SELECT id, serial, status, batch_id, branch_id FROM serial_units WHERE product_id = $1 AND serial = ANY($2::text[]) FOR UPDATE', [product.id, serials])).rows;
      const found = new Map(units.map((u) => [u.serial as string, u]));
      const perBatch = new Map<string, string[]>();
      for (const serial of serials) {
        const unit = found.get(serial);
        if (!unit || unit.branch_id !== branch.id) throw new AppError(422, 'serial-unknown', `Serial ${serial} of ${product.name} was never received at this branch. Do not sell it: it may not be genuine stock.`);
        if (unit.status === 'sold') throw new AppError(409, 'serial-already-sold', `Serial ${serial} of ${product.name} has ALREADY BEEN SOLD. Two packs cannot share a serial number: set it aside and tell the manager.`);
        perBatch.set(unit.batch_id, [...(perBatch.get(unit.batch_id) ?? []), serial]);
      }
      allocations = [];
      for (const [batchId, list] of perBatch) {
        const batch = batches.find((b) => b.id === batchId);
        if (!batch) throw new AppError(409, 'insufficient-stock', `${product.name}: the batch for a scanned pack has no stock left on record.`);
        if (batch.expiryDate < day) throw new AppError(422, 'expired', `A scanned pack of ${product.name} is from an expired batch (${batch.expiryDate}). It cannot be sold.`);
        if (batch.qtyOnHand < list.length) throw new AppError(409, 'insufficient-stock', `${product.name}: only ${batch.qtyOnHand} left on record in that batch.`);
        allocations.push({ batchId, qty: list.length, unitCostCents: batch.unitCostCents, serials: list });
      }
    } else {
      try {
        allocations = allocateFefo(batches, qty, day).map((a) => ({ ...a, serials: [] }));
      } catch (error) {
        if (error instanceof InsufficientStock) {
          throw new AppError(409, 'insufficient-stock', `${product.name}: ${error.available} in date, ${error.requested} asked for.`);
        }
        throw error;
      }
    }
    planned.push({ lineIndex, product, qty, unitPrice, allocations });
  }

  const subtotal = planned.reduce((sum, p) => sum + p.qty * p.unitPrice, 0);
  if (input.discountCents > subtotal) throw new BadRequestError('The discount is more than the sale.');
  const total = subtotal - input.discountCents;
  if (total <= 0) throw new BadRequestError('A sale must be worth more than nothing.');

  // number: the counter row is the lock that keeps numbers gap-free per branch per day
  const counter = (
    await client.query(
      `INSERT INTO sale_counters (org_id, branch_id, business_day, last_number) VALUES ($1, $2, $3, 1)
       ON CONFLICT (branch_id, business_day) DO UPDATE SET last_number = sale_counters.last_number + 1 RETURNING last_number`,
      [ctx.orgId, branch.id, day]
    )
  ).rows[0].last_number as number;
  const number = `${branch.code}-${day.slice(2).replace(/-/g, '')}-${String(counter).padStart(4, '0')}`;

  const sale = (
    await client.query(
      `INSERT INTO sales (org_id, branch_id, number, business_day, cashier_id, customer_id, subtotal_cents, discount_cents, total_cents, discount_by, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [ctx.orgId, branch.id, number, day, ctx.userId, input.customerId ?? null, subtotal, input.discountCents, total, input.discountCents > 0 ? ctx.userId : null, branch.isDemo]
    )
  ).rows[0];

  const lineResults: Array<{ lineId: string; productId: string; name: string; qty: number; unitPriceCents: number; lineTotalCents: number }> = [];
  for (const p of planned.sort((a, b) => a.lineIndex - b.lineIndex)) {
    const cost = p.allocations.reduce((sum, a) => sum + a.qty * a.unitCostCents, 0);
    const lineId = (
      await client.query(
        `INSERT INTO sale_lines (org_id, sale_id, product_id, qty, unit_price_cents, line_total_cents, cost_cents) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [ctx.orgId, sale.id, p.product.id, p.qty, p.unitPrice, p.qty * p.unitPrice, cost]
      )
    ).rows[0].id as string;
    lineResults.push({ lineId, productId: p.product.id, name: p.product.name, qty: p.qty, unitPriceCents: p.unitPrice, lineTotalCents: p.qty * p.unitPrice });

    for (const a of p.allocations) {
      const updated = await client.query('UPDATE stock_batches SET qty_on_hand = qty_on_hand - $2 WHERE id = $1 AND qty_on_hand >= $2 RETURNING batch_no, to_char(expiry_date, \'YYYY-MM-DD\') AS exp', [a.batchId, a.qty]);
      if (updated.rowCount === 0) throw new AppError(409, 'insufficient-stock', `${p.product.name}: stock changed while you were selling. Try again.`);
      const batch = updated.rows[0];
      await client.query(`INSERT INTO sale_line_batches (org_id, sale_line_id, batch_id, qty, unit_cost_cents) VALUES ($1, $2, $3, $4, $5)`, [ctx.orgId, lineId, a.batchId, a.qty, a.unitCostCents]);
      await client.query(
        `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, actor_id)
         VALUES ($1, $2, $3, $4, 'sale', $5, $6, 'sale', $7, $8)`,
        [ctx.orgId, branch.id, p.product.id, a.batchId, -a.qty, a.unitCostCents, sale.id, ctx.userId]
      );
      const eventType = p.product.category === 'otc' ? 'sale' : 'dispense';
      if (a.serials.length) {
        for (const serial of a.serials) {
          await client.query(`UPDATE serial_units SET status = 'sold', sold_at = now() WHERE product_id = $1 AND serial = $2`, [p.product.id, serial]);
          await client.query(
            `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, serial, qty, ref_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)`,
            [ctx.orgId, branch.id, eventType, p.product.id, p.product.gtin, batch.batch_no, batch.exp, serial, sale.id]
          );
        }
      } else {
        await client.query(
          `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [ctx.orgId, branch.id, eventType, p.product.id, p.product.gtin, batch.batch_no, batch.exp, a.qty, sale.id]
        );
      }
    }

    if (p.product.category !== 'otc') {
      const d = input.lines[p.lineIndex]!.dispensing!;
      await client.query(
        `INSERT INTO dispensing_records (org_id, branch_id, sale_id, sale_line_id, product_id, qty, patient_name, patient_phone, patient_age_years, patient_sex,
                                         prescriber_name, prescriber_reg_no, prescription_ref, directions, dispensed_by, witness_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [ctx.orgId, branch.id, sale.id, lineId, p.product.id, p.qty, d.patientName, d.patientPhone ?? null, d.patientAgeYears ?? null, d.patientSex ?? null,
         d.prescriberName, d.prescriberRegNo ?? null, d.prescriptionRef ?? null, d.directions ?? null, ctx.userId, witnessId]
      );
      if (p.product.category === 'controlled') {
        await writeRegister(client, ctx, branch.id, p.product.id, 'dispense', -p.qty, witnessId!, {
          batchNo: (await client.query('SELECT string_agg(b.batch_no, \',\') AS b FROM sale_line_batches l JOIN stock_batches b ON b.id = l.batch_id WHERE l.sale_line_id = $1', [lineId])).rows[0].b,
          patientName: d.patientName, prescriber: d.prescriberName, refType: 'sale', refId: sale.id
        });
      }
    }
  }

  if (input.discountCents > 0) {
    await audit(client, ctx, 'sale.discount', 'sale', sale.id, { discountCents: input.discountCents, reason: input.discountReason }, branch.id);
  }

  // payments tendered at the till
  let remaining = total;
  let change = 0;
  const saleRef = { id: sale.id as string, branchId: branch.id, customerId: input.customerId ?? null };
  for (const payment of input.payments) {
    if (remaining <= 0) break;
    const applied = await applyPayment(client, ctx, saleRef, remaining, payment);
    remaining -= applied.recorded;
    change += applied.changeCents;
  }
  const status = await settle(client, sale.id, total);

  return { saleId: sale.id as string, number, status, totalCents: total, discountCents: input.discountCents, paidCents: total - remaining, dueCents: remaining, changeCents: change, lines: lineResults };
}

export async function addPayment(client: PoolClient, ctx: Ctx, saleId: string, payment: z.infer<typeof paymentSchema>) {
  need(ctx, 'sell');
  const sale = (await client.query('SELECT id, branch_id, customer_id, total_cents, status, business_day FROM sales WHERE id = $1 FOR UPDATE', [saleId])).rows[0];
  if (!sale) throw new NotFoundError('That sale was not found.');
  if (ctx.branchId && sale.branch_id !== ctx.branchId) throw new ForbiddenError('That sale belongs to a different branch.');
  if (sale.status === 'voided') throw new ConflictError('That sale was voided.');
  const day = (await client.query('SELECT to_char($1::date, \'YYYY-MM-DD\') AS d', [sale.business_day])).rows[0].d as string;
  await assertDayOpen(client, sale.branch_id, day);
  const remaining = Number(sale.total_cents) - (await paidTotal(client, saleId));
  const applied = await applyPayment(client, ctx, { id: sale.id, branchId: sale.branch_id, customerId: sale.customer_id }, remaining, payment);
  const status = await settle(client, saleId, Number(sale.total_cents));
  return { saleId, status, paidCents: Number(sale.total_cents) - remaining + applied.recorded, dueCents: remaining - applied.recorded, changeCents: applied.changeCents };
}

/**
 * An M-Pesa confirmation that reached a branch till. It is matched to the sale whose number the customer typed as the
 * account reference, or else to the one pending sale at that branch worth exactly that amount in the last hour and a
 * half, and only when exactly one candidate fits. Anything else is kept for a manager to assign. Delivered twice, it is
 * applied once: the M-Pesa transaction id is unique.
 */
export async function applyMpesaConfirmation(
  client: PoolClient,
  orgId: string,
  branchId: string,
  payment: { externalRef: string; amountCents: number; payerMsisdn: string; receivedAt: Date; reference: string }
): Promise<{ matched: boolean; duplicate: boolean; saleId: string | null }> {
  const ref = payment.externalRef.toUpperCase();
  const seen = await client.query('SELECT sale_id FROM sale_payments WHERE external_ref = $1 UNION ALL SELECT assigned_sale FROM mpesa_unmatched WHERE external_ref = $1', [ref]);
  if (seen.rows.length > 0) return { matched: seen.rows[0].sale_id !== null, duplicate: true, saleId: seen.rows[0].sale_id ?? null };

  const typed = payment.reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pending = (
    await client.query(
      `SELECT s.id, s.number, s.total_cents, s.customer_id, s.business_day
         FROM sales s WHERE s.branch_id = $1 AND s.status = 'pending_payment' AND s.created_at > now() - ($2 || ' minutes')::interval
        ORDER BY s.created_at DESC FOR UPDATE`,
      [branchId, String(MPESA_MATCH_WINDOW_MINUTES)]
    )
  ).rows;

  let target: Record<string, any> | undefined;
  if (typed) target = pending.find((s) => (s.number as string).replace(/[^A-Z0-9]/g, '') === typed);
  if (!target) {
    const candidates: Record<string, any>[] = [];
    for (const s of pending) {
      const due = Number(s.total_cents) - (await paidTotal(client, s.id));
      if (due === payment.amountCents) candidates.push(s);
    }
    if (candidates.length === 1) target = candidates[0];
  }

  if (target) {
    const due = Number(target.total_cents) - (await paidTotal(client, target.id));
    if (payment.amountCents <= due) {
      await client.query(
        `INSERT INTO sale_payments (org_id, branch_id, sale_id, method, amount_cents, external_ref, payer_msisdn, received_at) VALUES ($1, $2, $3, 'mpesa', $4, $5, $6, $7)`,
        [orgId, branchId, target.id, payment.amountCents, ref, payment.payerMsisdn, payment.receivedAt]
      );
      await settle(client, target.id, Number(target.total_cents));
      return { matched: true, duplicate: false, saleId: target.id };
    }
  }
  await client.query(
    `INSERT INTO mpesa_unmatched (org_id, branch_id, external_ref, reference, amount_cents, payer_msisdn, received_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (external_ref) DO NOTHING`,
    [orgId, branchId, ref, payment.reference || null, payment.amountCents, payment.payerMsisdn, payment.receivedAt]
  );
  return { matched: false, duplicate: false, saleId: null };
}

export const voidSchema = z.object({ reason: z.string().trim().min(3).max(200) });

export async function voidSale(client: PoolClient, ctx: Ctx, saleId: string, reason: string) {
  need(ctx, 'void_sale');
  const sale = (await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId])).rows[0];
  if (!sale) throw new NotFoundError('That sale was not found.');
  if (ctx.branchId && sale.branch_id !== ctx.branchId) throw new ForbiddenError('That sale belongs to a different branch.');
  if (sale.status === 'voided') throw new ConflictError('That sale is already voided.');
  const branch = (await client.query('SELECT timezone FROM branches WHERE id = $1', [sale.branch_id])).rows[0];
  const day = await businessDayNow(client, branch.timezone);
  const saleDay = (await client.query('SELECT to_char($1::date, \'YYYY-MM-DD\') AS d', [sale.business_day])).rows[0].d as string;
  if (saleDay !== day) throw new AppError(409, 'void-too-late', 'Only a sale from today can be voided. Use a return for an earlier sale.');
  await assertDayOpen(client, sale.branch_id, saleDay);

  const rx = await client.query(
    `SELECT 1 FROM sale_lines l JOIN products p ON p.id = l.product_id WHERE l.sale_id = $1 AND p.category <> 'otc' LIMIT 1`,
    [saleId]
  );
  if (rx.rows.length > 0) {
    throw new AppError(409, 'void-dispensed', 'A sale that dispensed prescription or controlled items cannot be voided: the dispensing record stays. Use a return with a reason.');
  }
  const returned = await client.query('SELECT 1 FROM sale_returns WHERE sale_id = $1 LIMIT 1', [saleId]);
  if (returned.rows.length > 0) throw new ConflictError('That sale already has returns; it cannot also be voided.');

  const lines = (
    await client.query(
      `SELECT l.id AS line_id, l.product_id, lb.batch_id, lb.qty, lb.unit_cost_cents, p.gtin, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp
         FROM sale_lines l JOIN sale_line_batches lb ON lb.sale_line_id = l.id JOIN products p ON p.id = l.product_id JOIN stock_batches b ON b.id = lb.batch_id
        WHERE l.sale_id = $1 ORDER BY lb.batch_id FOR UPDATE OF b`,
      [saleId]
    )
  ).rows;
  for (const row of lines) {
    await client.query('UPDATE stock_batches SET qty_on_hand = qty_on_hand + $2 WHERE id = $1', [row.batch_id, row.qty]);
    await client.query(
      `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, reason, actor_id)
       VALUES ($1, $2, $3, $4, 'sale_return', $5, $6, 'sale', $7, $8, $9)`,
      [ctx.orgId, sale.branch_id, row.product_id, row.batch_id, row.qty, row.unit_cost_cents, saleId, `void: ${reason}`, ctx.userId]
    );
    await client.query(`INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id) VALUES ($1, $2, 'return', $3, $4, $5, $6, $7, $8)`, [ctx.orgId, sale.branch_id, row.product_id, row.gtin, row.batch_no, row.exp, row.qty, saleId]);
  }
  // serialised packs scanned on this sale go back on the shelf
  await client.query(
    `UPDATE serial_units SET status = 'in_stock', sold_at = NULL
      WHERE (product_id, serial) IN (SELECT product_id, serial FROM ntts_outbox WHERE ref_id = $1 AND serial IS NOT NULL AND event_type IN ('sale', 'dispense'))`,
    [saleId]
  );
  // credit given is reversed on the customer's account
  const credit = (await client.query(`SELECT COALESCE(sum(amount_cents), 0)::bigint AS c FROM sale_payments WHERE sale_id = $1 AND method = 'credit'`, [saleId])).rows[0].c;
  if (Number(credit) > 0 && sale.customer_id) {
    await client.query(
      `INSERT INTO customer_ledger (org_id, customer_id, branch_id, kind, amount_cents, ref_type, ref_id, note, actor_id) VALUES ($1, $2, $3, 'return', $4, 'sale', $5, 'void', $6)`,
      [ctx.orgId, sale.customer_id, sale.branch_id, -Number(credit), saleId, ctx.userId]
    );
  }
  await client.query(`UPDATE sales SET status = 'voided', void_reason = $2, voided_by = $3, voided_at = now() WHERE id = $1`, [saleId, reason, ctx.userId]);
  await audit(client, ctx, 'sale.void', 'sale', saleId, { reason, number: sale.number, totalCents: Number(sale.total_cents) }, sale.branch_id);
  return { saleId, status: 'voided' as const };
}

export const returnSchema = z.object({
  lineId: z.string().uuid(),
  qty: z.number().int().min(1).max(100_000),
  reason: z.string().trim().min(3).max(200),
  refundMethod: z.enum(['cash', 'mpesa', 'credit']),
  /** whether the units go back on the shelf; ignored (forced false) for prescription and controlled items */
  restock: z.boolean().default(true)
});

export async function returnItems(client: PoolClient, ctx: Ctx, saleId: string, input: z.infer<typeof returnSchema>) {
  need(ctx, 'return_sale');
  const sale = (await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [saleId])).rows[0];
  if (!sale) throw new NotFoundError('That sale was not found.');
  if (ctx.branchId && sale.branch_id !== ctx.branchId) throw new ForbiddenError('That sale belongs to a different branch.');
  if (sale.status === 'voided') throw new ConflictError('That sale was voided.');
  const line = (
    await client.query(
      `SELECT l.*, p.category, p.gtin, p.name FROM sale_lines l JOIN products p ON p.id = l.product_id WHERE l.id = $1 AND l.sale_id = $2 FOR UPDATE OF l`,
      [input.lineId, saleId]
    )
  ).rows[0];
  if (!line) throw new NotFoundError('That line is not on this sale.');
  if (line.category === 'controlled') throw new AppError(409, 'return-controlled', 'A controlled drug cannot be returned through the till: record it with the pharmacist and a witness as an adjustment.');
  if (input.qty > line.qty - line.returned_qty) throw new AppError(422, 'return-too-many', `Only ${line.qty - line.returned_qty} of ${line.name} can still be returned.`);
  const branch = (await client.query('SELECT timezone FROM branches WHERE id = $1', [sale.branch_id])).rows[0];
  await assertDayOpen(client, sale.branch_id, await businessDayNow(client, branch.timezone));

  const restock = input.restock && line.category === 'otc';
  const refund = input.qty * Number(line.unit_price_cents) - Math.round((Number(sale.discount_cents) * input.qty * Number(line.unit_price_cents)) / Math.max(1, Number(sale.subtotal_cents)));
  if (input.refundMethod === 'credit' && !sale.customer_id) throw new BadRequestError('A refund to credit needs a customer on the sale.');

  if (restock) {
    let toReturn = input.qty;
    const parts = (
      await client.query(
        `SELECT lb.id, lb.batch_id, lb.qty, lb.returned_qty, lb.unit_cost_cents, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp
           FROM sale_line_batches lb JOIN stock_batches b ON b.id = lb.batch_id WHERE lb.sale_line_id = $1 ORDER BY lb.batch_id FOR UPDATE OF b`,
        [input.lineId]
      )
    ).rows;
    for (const part of parts) {
      if (toReturn === 0) break;
      const room = part.qty - part.returned_qty;
      const take = Math.min(room, toReturn);
      if (take <= 0) continue;
      await client.query('UPDATE sale_line_batches SET returned_qty = returned_qty + $2 WHERE id = $1', [part.id, take]);
      await client.query('UPDATE stock_batches SET qty_on_hand = qty_on_hand + $2 WHERE id = $1', [part.batch_id, take]);
      await client.query(
        `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, reason, actor_id)
         VALUES ($1, $2, $3, $4, 'sale_return', $5, $6, 'sale', $7, $8, $9)`,
        [ctx.orgId, sale.branch_id, line.product_id, part.batch_id, take, part.unit_cost_cents, saleId, input.reason, ctx.userId]
      );
      await client.query(`INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id) VALUES ($1, $2, 'return', $3, $4, $5, $6, $7, $8)`, [ctx.orgId, sale.branch_id, line.product_id, line.gtin, part.batch_no, part.exp, take, saleId]);
      toReturn -= take;
    }
  }
  await client.query('UPDATE sale_lines SET returned_qty = returned_qty + $2 WHERE id = $1', [input.lineId, input.qty]);
  await client.query(
    `INSERT INTO sale_returns (org_id, branch_id, sale_id, sale_line_id, qty, refund_cents, refund_method, reason, restocked, actor_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [ctx.orgId, sale.branch_id, saleId, input.lineId, input.qty, refund, input.refundMethod, input.reason, restock, ctx.userId]
  );
  if (input.refundMethod === 'credit' && sale.customer_id && refund > 0) {
    await client.query(
      `INSERT INTO customer_ledger (org_id, customer_id, branch_id, kind, amount_cents, ref_type, ref_id, note, actor_id) VALUES ($1, $2, $3, 'return', $4, 'sale', $5, $6, $7)`,
      [ctx.orgId, sale.customer_id, sale.branch_id, -refund, saleId, input.reason, ctx.userId]
    );
  }
  await audit(client, ctx, 'sale.return', 'sale', saleId, { lineId: input.lineId, qty: input.qty, refundCents: refund, restocked: restock, reason: input.reason }, sale.branch_id);
  return { saleId, refundCents: refund, restocked: restock };
}

export async function getSale(client: PoolClient, ctx: Ctx, saleId: string) {
  const sale = (
    await client.query(
      `SELECT s.*, to_char(s.business_day, 'YYYY-MM-DD') AS day, u.display_name AS cashier, c.name AS customer
         FROM sales s JOIN users u ON u.id = s.cashier_id LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`,
      [saleId]
    )
  ).rows[0];
  if (!sale || (ctx.branchId && sale.branch_id !== ctx.branchId)) throw new NotFoundError('That sale was not found.');
  const lines = (
    await client.query(
      `SELECT l.id, l.product_id, p.name, p.category, l.qty, l.unit_price_cents, l.line_total_cents, l.returned_qty
         FROM sale_lines l JOIN products p ON p.id = l.product_id WHERE l.sale_id = $1 ORDER BY l.id`,
      [saleId]
    )
  ).rows;
  const payments = (await client.query('SELECT method, amount_cents, external_ref, received_at FROM sale_payments WHERE sale_id = $1 ORDER BY created_at', [saleId])).rows;
  const paid = payments.reduce((sum, p) => sum + Number(p.amount_cents), 0);
  return {
    id: sale.id as string,
    number: sale.number as string,
    branchId: sale.branch_id as string,
    day: sale.day as string,
    status: sale.status as string,
    cashier: sale.cashier as string,
    customer: sale.customer as string | null,
    subtotalCents: Number(sale.subtotal_cents),
    discountCents: Number(sale.discount_cents),
    totalCents: Number(sale.total_cents),
    paidCents: paid,
    dueCents: sale.status === 'voided' ? 0 : Number(sale.total_cents) - paid,
    voidReason: sale.void_reason as string | null,
    createdAt: sale.created_at as Date,
    lines: lines.map((l) => ({ id: l.id as string, productId: l.product_id as string, name: l.name as string, category: l.category as string, qty: l.qty as number, unitPriceCents: Number(l.unit_price_cents), lineTotalCents: Number(l.line_total_cents), returnedQty: l.returned_qty as number })),
    payments: payments.map((p) => ({ method: p.method as string, amountCents: Number(p.amount_cents), externalRef: p.external_ref as string | null, receivedAt: p.received_at as Date }))
  };
}

export async function listSales(client: PoolClient, ctx: Ctx, branchId: string, opts: { day?: string; status?: string; limit?: number; offset?: number }) {
  const params: unknown[] = [branchId];
  let clause = 's.branch_id = $1';
  if (opts.day) {
    params.push(opts.day);
    clause += ` AND s.business_day = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    clause += ` AND s.status = $${params.length}`;
  }
  // a cashier sees their own sales; anyone who can close the day sees the branch's
  if (!can(ctx.role, 'day_close') && !can(ctx.role, 'dispense')) {
    params.push(ctx.userId);
    clause += ` AND s.cashier_id = $${params.length}`;
  }
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = (
    await client.query(
      `SELECT s.id, s.number, to_char(s.business_day, 'YYYY-MM-DD') AS day, s.status, s.total_cents, s.created_at, u.display_name AS cashier,
              COALESCE((SELECT sum(amount_cents) FROM sale_payments p WHERE p.sale_id = s.id), 0)::bigint AS paid
         FROM sales s JOIN users u ON u.id = s.cashier_id WHERE ${clause} ORDER BY s.created_at DESC LIMIT ${limit} OFFSET ${Math.max(0, opts.offset ?? 0)}`,
      params
    )
  ).rows;
  return rows.map((r) => ({ id: r.id as string, number: r.number as string, day: r.day as string, status: r.status as string, totalCents: Number(r.total_cents), paidCents: Number(r.paid), cashier: r.cashier as string, createdAt: r.created_at as Date }));
}

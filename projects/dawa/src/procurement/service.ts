/**
 * Buying: purchase orders, stock sent back to a supplier, credit notes, and voiding a supplier invoice that was entered
 * wrongly. Everything runs inside the caller's tenant transaction, so a half-done receipt or return cannot be committed.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { audit, BranchRow, Ctx, need, verifyWitness, WitnessInput } from '../common/context';
import { toPage } from '../common/paging';
import { receiveStock, writeRegister } from '../inventory/service';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const witnessSchema = z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) });

// ---- purchase orders ------------------------------------------------------------------------------

export const purchaseOrderSchema = z.object({
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  expectedDate: isoDate.optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.number().int().min(1).max(1_000_000),
    unitCostCents: z.number().int().min(0).max(100_000_000).default(0)
  })).min(1).max(200)
});

export async function createPurchaseOrder(client: PoolClient, ctx: Ctx, branch: BranchRow, input: z.infer<typeof purchaseOrderSchema>) {
  need(ctx, 'receive_stock');
  const supplier = (await client.query('SELECT id FROM suppliers WHERE id = $1 AND active', [input.supplierId])).rows[0];
  if (!supplier) throw new NotFoundError('That supplier was not found.');
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  if (ids.length !== input.lines.length) throw new BadRequestError('A product appears twice on the order: combine the quantities.');
  const found = (await client.query('SELECT id FROM products WHERE id = ANY($1::uuid[]) AND active', [ids])).rows;
  if (found.length !== ids.length) throw new NotFoundError('A product on the order was not found.');

  // numbers are gap-free per organisation; the advisory lock makes two simultaneous orders take different numbers
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`po-number:${ctx.orgId}`]);
  const count = Number((await client.query('SELECT count(*) AS n FROM purchase_orders')).rows[0].n);
  const number = `PO-${String(count + 1).padStart(5, '0')}`;
  const po = (
    await client.query(
      `INSERT INTO purchase_orders (org_id, branch_id, supplier_id, number, expected_date, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.orgId, branch.id, input.supplierId, number, input.expectedDate ?? null, input.note ?? null, ctx.userId]
    )
  ).rows[0];
  for (const line of input.lines) {
    await client.query(`INSERT INTO purchase_order_lines (org_id, purchase_order_id, product_id, qty_ordered, unit_cost_cents) VALUES ($1, $2, $3, $4, $5)`, [ctx.orgId, po.id, line.productId, line.qty, line.unitCostCents]);
  }
  const totalCents = input.lines.reduce((sum, l) => sum + l.qty * l.unitCostCents, 0);
  await audit(client, ctx, 'po.create', 'purchase_order', po.id, { number, supplierId: input.supplierId, lines: input.lines.length, totalCents }, branch.id);
  return { id: po.id as string, number, status: 'open' as const, totalCents };
}

export async function listPurchaseOrders(client: PoolClient, branchId: string, opts: { status?: string; supplierId?: string; limit?: number; offset?: number } = {}) {
  const params: unknown[] = [branchId];
  let clause = 'o.branch_id = $1';
  if (opts.status) { params.push(opts.status); clause += ` AND o.status = $${params.length}`; }
  if (opts.supplierId) { params.push(opts.supplierId); clause += ` AND o.supplier_id = $${params.length}`; }
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = (
    await client.query(
      `SELECT o.id, o.number, o.status, to_char(o.expected_date, 'YYYY-MM-DD') AS expected_date, o.created_at, s.name AS supplier,
              COALESCE((SELECT sum(l.qty_ordered * l.unit_cost_cents) FROM purchase_order_lines l WHERE l.purchase_order_id = o.id), 0)::bigint AS total,
              COALESCE((SELECT sum(l.qty_ordered) FROM purchase_order_lines l WHERE l.purchase_order_id = o.id), 0)::int AS ordered,
              COALESCE((SELECT sum(l.qty_received) FROM purchase_order_lines l WHERE l.purchase_order_id = o.id), 0)::int AS received
         FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id WHERE ${clause} ORDER BY o.created_at DESC, o.id DESC LIMIT ${limit + 1} OFFSET ${offset}`,
      params
    )
  ).rows;
  return toPage(rows.map((r) => ({ id: r.id as string, number: r.number as string, status: r.status as string, supplier: r.supplier as string, expectedDate: r.expected_date as string | null, createdAt: r.created_at as Date, totalCents: Number(r.total), unitsOrdered: r.ordered as number, unitsReceived: r.received as number })), limit, offset);
}

export async function getPurchaseOrder(client: PoolClient, id: string) {
  const o = (
    await client.query(
      `SELECT o.id, o.number, o.status, o.branch_id, o.supplier_id, to_char(o.expected_date, 'YYYY-MM-DD') AS expected_date, o.note, o.cancel_reason, o.created_at, s.name AS supplier
         FROM purchase_orders o JOIN suppliers s ON s.id = o.supplier_id WHERE o.id = $1`,
      [id]
    )
  ).rows[0];
  if (!o) throw new NotFoundError('That purchase order was not found.');
  const lines = (
    await client.query(
      `SELECT l.id, l.product_id, p.name AS product, p.category, l.qty_ordered, l.qty_received, l.unit_cost_cents FROM purchase_order_lines l JOIN products p ON p.id = l.product_id WHERE l.purchase_order_id = $1 ORDER BY p.name, l.id`,
      [id]
    )
  ).rows;
  const receipts = (
    await client.query(
      `SELECT i.id, i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date, i.total_cents FROM purchase_order_receipts r JOIN supplier_invoices i ON i.id = r.supplier_invoice_id WHERE r.purchase_order_id = $1 ORDER BY r.created_at`,
      [id]
    )
  ).rows;
  return {
    id: o.id as string, number: o.number as string, status: o.status as string, branchId: o.branch_id as string, supplierId: o.supplier_id as string, supplier: o.supplier as string,
    expectedDate: o.expected_date as string | null, note: o.note as string | null, cancelReason: o.cancel_reason as string | null, createdAt: o.created_at as Date,
    lines: lines.map((l) => ({ id: l.id as string, productId: l.product_id as string, product: l.product as string, category: l.category as string, qtyOrdered: l.qty_ordered as number, qtyReceived: l.qty_received as number, unitCostCents: Number(l.unit_cost_cents) })),
    receipts: receipts.map((r) => ({ invoiceId: r.id as string, invoiceNumber: r.invoice_number as string, invoiceDate: r.invoice_date as string, totalCents: Number(r.total_cents) }))
  };
}

export const receivePoSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: isoDate,
  dueDate: isoDate.optional().nullable(),
  lines: z.array(z.object({
    lineId: z.string().uuid(),
    batchNo: z.string().trim().min(1).max(40),
    expiryDate: isoDate,
    qty: z.number().int().min(1).max(1_000_000),
    unitCostCents: z.number().int().min(0).max(100_000_000).optional(),
    serials: z.array(z.string().trim().min(1).max(20)).max(5000).optional()
  })).min(1).max(200),
  witness: witnessSchema.optional()
});

/** Receives (part of) an order against a supplier invoice: one transaction books the stock, the payable and the order's progress. */
export async function receivePurchaseOrder(client: PoolClient, ctx: Ctx, branch: BranchRow, poId: string, input: z.infer<typeof receivePoSchema>) {
  need(ctx, 'receive_stock');
  const po = (await client.query('SELECT id, status, branch_id, supplier_id, number FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId])).rows[0];
  if (!po) throw new NotFoundError('That purchase order was not found.');
  if (po.branch_id !== branch.id) throw new AppError(409, 'po-other-branch', 'That purchase order is for a different branch.');
  if (po.status === 'cancelled' || po.status === 'received') throw new ConflictError(`That purchase order is ${po.status}.`);
  const lines = (await client.query('SELECT id, product_id, qty_ordered, qty_received, unit_cost_cents FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY id FOR UPDATE', [poId])).rows;
  const byId = new Map(lines.map((l) => [l.id as string, l]));
  const arriving = new Map<string, number>();
  for (const line of input.lines) {
    const row = byId.get(line.lineId);
    if (!row) throw new NotFoundError('A line on the delivery is not on that purchase order.');
    arriving.set(line.lineId, (arriving.get(line.lineId) ?? 0) + line.qty);
  }
  for (const [lineId, qty] of arriving) {
    const row = byId.get(lineId)!;
    const open = (row.qty_ordered as number) - (row.qty_received as number);
    if (qty > open) throw new AppError(422, 'po-over-receipt', `Only ${open} still to come on that line; the delivery has ${qty}. Receive what was ordered, or raise another order.`);
  }
  const result = await receiveStock(client, ctx, branch, {
    supplierId: po.supplier_id,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate ?? null,
    witness: input.witness,
    lines: input.lines.map((l) => {
      const row = byId.get(l.lineId)!;
      return { productId: row.product_id as string, batchNo: l.batchNo, expiryDate: l.expiryDate, qty: l.qty, unitCostCents: l.unitCostCents ?? Number(row.unit_cost_cents), serials: l.serials };
    })
  });
  for (const [lineId, qty] of arriving) {
    await client.query('UPDATE purchase_order_lines SET qty_received = qty_received + $2 WHERE id = $1', [lineId, qty]);
  }
  const left = (await client.query('SELECT COALESCE(sum(qty_ordered - qty_received), 0)::int AS n FROM purchase_order_lines WHERE purchase_order_id = $1', [poId])).rows[0].n as number;
  const status = left === 0 ? 'received' : 'partial';
  await client.query('UPDATE purchase_orders SET status = $2, closed_at = CASE WHEN $2 = \'received\' THEN now() ELSE closed_at END WHERE id = $1', [poId, status]);
  await client.query('INSERT INTO purchase_order_receipts (org_id, purchase_order_id, supplier_invoice_id) VALUES ($1, $2, $3)', [ctx.orgId, poId, result.invoiceId]);
  await audit(client, ctx, 'po.receive', 'purchase_order', poId, { number: po.number, invoiceId: result.invoiceId, status }, branch.id);
  return { ...result, purchaseOrderStatus: status as 'partial' | 'received' };
}

export async function cancelPurchaseOrder(client: PoolClient, ctx: Ctx, poId: string, reason: string) {
  need(ctx, 'suppliers');
  const po = (await client.query('SELECT id, status, number, branch_id FROM purchase_orders WHERE id = $1 FOR UPDATE', [poId])).rows[0];
  if (!po) throw new NotFoundError('That purchase order was not found.');
  if (po.status !== 'open') throw new ConflictError(po.status === 'cancelled' ? 'That purchase order is already cancelled.' : 'Part of that order has arrived; it cannot be cancelled.');
  await client.query(`UPDATE purchase_orders SET status = 'cancelled', cancel_reason = $2, closed_at = now() WHERE id = $1`, [poId, reason]);
  await audit(client, ctx, 'po.cancel', 'purchase_order', poId, { number: po.number, reason }, po.branch_id);
  return { id: poId, status: 'cancelled' as const };
}

// ---- credit notes ---------------------------------------------------------------------------------

export const creditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  amountCents: z.number().int().positive().max(10_000_000_000),
  noteNumber: z.string().trim().max(60).optional().nullable(),
  reason: z.string().trim().min(3).max(300)
});

async function lockInvoice(client: PoolClient, invoiceId: string) {
  // supplier invoices are append-only, so payments, credits and voids are serialised per invoice with an advisory lock
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`supplier-invoice:${invoiceId}`]);
  const invoice = (await client.query('SELECT id, branch_id, supplier_id, total_cents, invoice_number, voided_at FROM supplier_invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!invoice) throw new NotFoundError('That supplier invoice was not found.');
  return invoice;
}

async function invoiceBalance(client: PoolClient, invoice: { id: string; total_cents: string | number }) {
  const paid = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS p FROM supplier_payments WHERE supplier_invoice_id = $1', [invoice.id])).rows[0].p);
  const credited = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS c FROM supplier_credit_notes WHERE supplier_invoice_id = $1', [invoice.id])).rows[0].c);
  return { paid, credited, balance: Number(invoice.total_cents) - paid - credited };
}

export async function createCreditNote(client: PoolClient, ctx: Ctx, input: z.infer<typeof creditNoteSchema>, returnId?: string) {
  need(ctx, 'suppliers');
  const invoice = await lockInvoice(client, input.invoiceId);
  if (ctx.branchId && invoice.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That invoice belongs to a different branch.');
  if (invoice.voided_at) throw new AppError(409, 'invoice-voided', 'That invoice was voided; nothing is owed on it.');
  const { balance } = await invoiceBalance(client, invoice);
  if (input.amountCents > balance) throw new AppError(422, 'credit-exceeds-balance', `Only KSh ${(balance / 100).toLocaleString('en-KE')} is still owed on that invoice, so a credit note cannot be larger. If it was already paid, ask the supplier for a refund instead.`);
  const note = (
    await client.query(
      `INSERT INTO supplier_credit_notes (org_id, supplier_id, supplier_invoice_id, note_number, amount_cents, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [ctx.orgId, invoice.supplier_id, invoice.id, input.noteNumber ?? null, input.amountCents, input.reason, ctx.userId]
    )
  ).rows[0];
  await audit(client, ctx, 'supplier.credit_note', 'supplier_invoice', invoice.id, { creditNoteId: note.id, amountCents: input.amountCents, reason: input.reason, returnId: returnId ?? null }, invoice.branch_id);
  return { id: note.id as string, invoiceId: invoice.id as string, balanceCents: balance - input.amountCents };
}

// ---- supplier returns -----------------------------------------------------------------------------

export const supplierReturnSchema = z.object({
  branchId: z.string().uuid().optional(),
  batchId: z.string().uuid(),
  qty: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(3).max(300),
  /** when the supplier credits the return: which invoice it comes off, and by how much */
  credit: z.object({ invoiceId: z.string().uuid(), amountCents: z.number().int().positive().max(10_000_000_000), noteNumber: z.string().trim().max(60).optional().nullable() }).optional(),
  witness: witnessSchema.optional()
});

export async function returnToSupplier(client: PoolClient, ctx: Ctx, branch: BranchRow, input: z.infer<typeof supplierReturnSchema>) {
  need(ctx, 'adjust_stock');
  const batch = (
    await client.query(
      `SELECT b.id, b.product_id, b.batch_no, b.qty_on_hand, b.unit_cost_cents, b.supplier_invoice_id, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp, p.category, p.gtin, p.name
         FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE b.id = $1 AND b.branch_id = $2 FOR UPDATE OF b`,
      [input.batchId, branch.id]
    )
  ).rows[0];
  if (!batch) throw new NotFoundError('That batch was not found at this branch.');
  if (input.qty > batch.qty_on_hand) throw new AppError(409, 'insufficient-stock', `The batch holds ${batch.qty_on_hand}; you cannot send back ${input.qty}.`);

  // the supplier is whoever's invoice the credit comes off, else whoever delivered this batch
  let supplierId: string | null = null;
  if (input.credit) {
    supplierId = (await client.query('SELECT supplier_id FROM supplier_invoices WHERE id = $1', [input.credit.invoiceId])).rows[0]?.supplier_id ?? null;
    if (!supplierId) throw new NotFoundError('That supplier invoice was not found.');
  } else if (batch.supplier_invoice_id) {
    supplierId = (await client.query('SELECT supplier_id FROM supplier_invoices WHERE id = $1', [batch.supplier_invoice_id])).rows[0]?.supplier_id ?? null;
  }
  if (!supplierId) throw new BadRequestError('This batch has no supplier on record: name the invoice the credit comes off.');

  let witnessId: string | null = null;
  if (batch.category === 'controlled') {
    need(ctx, 'controlled');
    witnessId = await verifyWitness(client, ctx, input.witness as WitnessInput | undefined, normalisePhone);
  }

  await client.query('UPDATE stock_batches SET qty_on_hand = qty_on_hand - $2 WHERE id = $1', [batch.id, input.qty]);
  await client.query(
    `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, reason, actor_id) VALUES ($1, $2, $3, $4, 'supplier_return', $5, $6, $7, $8)`,
    [ctx.orgId, branch.id, batch.product_id, batch.id, -input.qty, batch.unit_cost_cents, input.reason, ctx.userId]
  );
  await client.query(
    `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7)`,
    [ctx.orgId, branch.id, batch.product_id, batch.gtin, batch.batch_no, batch.exp, -input.qty]
  );
  if (witnessId) await writeRegister(client, ctx, branch.id, batch.product_id, 'adjustment', -input.qty, witnessId, { batchNo: batch.batch_no, reason: `returned to supplier: ${input.reason}` });

  const ret = (
    await client.query(
      `INSERT INTO supplier_returns (org_id, branch_id, supplier_id, batch_id, product_id, qty, unit_cost_cents, reason, actor_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [ctx.orgId, branch.id, supplierId, batch.id, batch.product_id, input.qty, batch.unit_cost_cents, input.reason, ctx.userId]
    )
  ).rows[0];
  let creditNoteId: string | null = null;
  if (input.credit) {
    // the supplier_returns row is append-only, so the credit is recorded as its own row pointing back at the return in the audit trail
    const note = await createCreditNote(client, ctx, { invoiceId: input.credit.invoiceId, amountCents: input.credit.amountCents, noteNumber: input.credit.noteNumber, reason: `Return: ${input.reason}` }, ret.id);
    creditNoteId = note.id;
  }
  await audit(client, ctx, 'stock.supplier_return', 'stock_batch', batch.id, { returnId: ret.id, qty: input.qty, product: batch.name, reason: input.reason, creditNoteId }, branch.id);
  return { returnId: ret.id as string, batchId: batch.id as string, qtyOnHand: (batch.qty_on_hand as number) - input.qty, creditNoteId };
}

export async function listSupplierReturns(client: PoolClient, branchId: string, opts: { limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 50), 200);
  const offset = Math.max(0, opts.offset ?? 0);
  const rows = (
    await client.query(
      `SELECT r.id, r.qty, r.reason, r.created_at, s.name AS supplier, p.name AS product, b.batch_no, u.display_name AS actor
         FROM supplier_returns r JOIN suppliers s ON s.id = r.supplier_id JOIN products p ON p.id = r.product_id JOIN stock_batches b ON b.id = r.batch_id JOIN users u ON u.id = r.actor_id
        WHERE r.branch_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit + 1} OFFSET ${offset}`,
      [branchId]
    )
  ).rows;
  return toPage(rows.map((r) => ({ id: r.id as string, supplier: r.supplier as string, product: r.product as string, batchNo: r.batch_no as string, qty: r.qty as number, reason: r.reason as string, by: r.actor as string, createdAt: r.created_at as Date })), limit, offset);
}

// ---- voiding a wrongly entered invoice ------------------------------------------------------------

export const voidInvoiceSchema = z.object({ reason: z.string().trim().min(3).max(300) });

/**
 * Takes a wrongly entered supplier invoice out of what is owed and takes its delivery back out of stock, so the right one
 * can be entered again under the same number. It is refused (nothing changes) when money has already moved against it,
 * when any of its stock has since been sold, or when the delivery holds a controlled drug or serial-numbered packs:
 * those corrections need a credit note or a witnessed adjustment, which leave a trail of their own.
 */
export async function voidSupplierInvoice(client: PoolClient, ctx: Ctx, invoiceId: string, reason: string) {
  need(ctx, 'suppliers');
  const invoice = await lockInvoice(client, invoiceId);
  if (ctx.branchId && invoice.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That invoice belongs to a different branch.');
  if (invoice.voided_at) throw new ConflictError('That invoice is already voided.');
  const { paid, credited } = await invoiceBalance(client, invoice);
  if (paid > 0 || credited > 0) throw new AppError(409, 'invoice-has-payments', 'Money has already been paid or credited against that invoice. Record a credit note for the difference instead of voiding it.');

  const received = (
    await client.query(
      `SELECT m.batch_id, m.product_id, sum(m.qty_delta)::int AS qty, p.category, p.name, p.gtin, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp, b.qty_on_hand, b.unit_cost_cents
         FROM stock_movements m JOIN products p ON p.id = m.product_id JOIN stock_batches b ON b.id = m.batch_id
        WHERE m.ref_type = 'supplier_invoice' AND m.ref_id = $1 AND m.kind = 'receive' GROUP BY m.batch_id, m.product_id, p.category, p.name, p.gtin, b.batch_no, b.expiry_date, b.qty_on_hand, b.unit_cost_cents ORDER BY m.batch_id`,
      [invoiceId]
    )
  ).rows;
  for (const row of received) {
    if (row.category === 'controlled') throw new AppError(409, 'invoice-controlled', `${row.name} is a controlled drug: take it back out with a witnessed stock adjustment, then record a credit note.`);
    const serials = Number((await client.query('SELECT count(*) AS n FROM serial_units WHERE batch_id = $1', [row.batch_id])).rows[0].n);
    if (serials > 0) throw new AppError(409, 'invoice-serials', `${row.name} batch ${row.batch_no} holds serial-numbered packs. Record a credit note for the difference instead.`);
  }
  // lock every batch in a fixed order, then check all of them before touching any
  for (const row of received) {
    const locked = (await client.query('SELECT qty_on_hand FROM stock_batches WHERE id = $1 FOR UPDATE', [row.batch_id])).rows[0];
    if ((locked.qty_on_hand as number) < row.qty) throw new AppError(409, 'stock-already-used', `${row.name} batch ${row.batch_no}: ${row.qty} came in on this invoice but only ${locked.qty_on_hand} is left, so some was sold or moved. Record a credit note for the difference instead.`);
  }
  for (const row of received) {
    await client.query('UPDATE stock_batches SET qty_on_hand = qty_on_hand - $2 WHERE id = $1', [row.batch_id, row.qty]);
    await client.query(
      `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, reason, actor_id)
       VALUES ($1, $2, $3, $4, 'invoice_void', $5, $6, 'supplier_invoice', $7, $8, $9)`,
      [ctx.orgId, invoice.branch_id, row.product_id, row.batch_id, -row.qty, row.unit_cost_cents, invoiceId, `invoice ${invoice.invoice_number} voided: ${reason}`, ctx.userId]
    );
    await client.query(
      `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7, $8)`,
      [ctx.orgId, invoice.branch_id, row.product_id, row.gtin, row.batch_no, row.exp, -row.qty, invoiceId]
    );
  }
  await client.query('UPDATE supplier_invoices SET voided_at = now(), void_reason = $2, voided_by = $3 WHERE id = $1', [invoiceId, reason, ctx.userId]);
  await audit(client, ctx, 'supplier.invoice_void', 'supplier_invoice', invoiceId, { invoiceNumber: invoice.invoice_number, reason, totalCents: Number(invoice.total_cents), batches: received.length }, invoice.branch_id);
  return { invoiceId, voided: true, batchesReversed: received.length };
}

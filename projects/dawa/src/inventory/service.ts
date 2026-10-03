/**
 * Catalogue, suppliers, receiving, batch stock, adjustments and the alerts a pharmacist needs every morning.
 * Every function runs inside the caller's `withOrg` transaction, so row-level security confines it to one tenant.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { env } from '../config/env';
import { AppError, BadRequestError, ConflictError, NotFoundError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { audit, BranchRow, Ctx, need, verifyWitness, WitnessInput } from '../common/context';
import { daysToExpiry } from './fefo';
import { normaliseGtin } from '../gs1/parse';

// ---- catalogue ------------------------------------------------------------------------------------

export const productSchema = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: z.string().trim().max(200).optional().nullable(),
  strength: z.string().trim().max(60).optional().nullable(),
  form: z.string().trim().max(60).optional().nullable(),
  packSize: z.string().trim().max(60).optional().nullable(),
  gtin: z.string().trim().max(14).optional().nullable(),
  category: z.enum(['otc', 'prescription', 'controlled']).default('otc'),
  unit: z.string().trim().min(1).max(20).default('unit'),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  listPriceCents: z.number().int().min(0).max(1_000_000_00).default(0)
});
export type ProductInput = z.infer<typeof productSchema>;

function toProduct(row: Record<string, any>) {
  return {
    id: row.id as string,
    name: row.name as string,
    genericName: row.generic_name as string | null,
    strength: row.strength as string | null,
    form: row.form as string | null,
    packSize: row.pack_size as string | null,
    gtin: row.gtin as string | null,
    category: row.category as 'otc' | 'prescription' | 'controlled',
    unit: row.unit as string,
    reorderLevel: row.reorder_level as number,
    listPriceCents: Number(row.list_price_cents),
    active: row.active as boolean
  };
}
export type Product = ReturnType<typeof toProduct>;

function cleanGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    return normaliseGtin(raw);
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'that GTIN is not valid');
  }
}

export async function createProduct(client: PoolClient, ctx: Ctx, input: ProductInput): Promise<Product> {
  need(ctx, 'catalogue_write');
  if (input.category !== 'otc') need(ctx, 'dispense');
  const { rows } = await client.query(
    `INSERT INTO products (org_id, name, generic_name, strength, form, pack_size, gtin, category, unit, reorder_level, list_price_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [ctx.orgId, input.name, input.genericName ?? null, input.strength ?? null, input.form ?? null, input.packSize ?? null,
     cleanGtin(input.gtin), input.category, input.unit, input.reorderLevel, input.listPriceCents]
  );
  await audit(client, ctx, 'product.create', 'product', rows[0].id, { name: input.name, category: input.category });
  return toProduct(rows[0]);
}

export async function updateProduct(client: PoolClient, ctx: Ctx, id: string, input: Partial<ProductInput> & { active?: boolean }): Promise<Product> {
  need(ctx, 'catalogue_write');
  const existing = (await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!existing) throw new NotFoundError('That product was not found.');
  // Reclassifying a medicine, in either direction, is a pharmacist's decision and is on the audit trail.
  if (input.category && input.category !== existing.category) {
    need(ctx, 'dispense');
    await audit(client, ctx, 'product.reclassify', 'product', id, { from: existing.category, to: input.category });
  }
  const next = {
    name: input.name ?? existing.name,
    generic: input.genericName === undefined ? existing.generic_name : input.genericName,
    strength: input.strength === undefined ? existing.strength : input.strength,
    form: input.form === undefined ? existing.form : input.form,
    pack: input.packSize === undefined ? existing.pack_size : input.packSize,
    gtin: input.gtin === undefined ? existing.gtin : cleanGtin(input.gtin),
    category: input.category ?? existing.category,
    unit: input.unit ?? existing.unit,
    reorder: input.reorderLevel ?? existing.reorder_level,
    price: input.listPriceCents ?? Number(existing.list_price_cents),
    active: input.active ?? existing.active
  };
  const { rows } = await client.query(
    `UPDATE products SET name=$2, generic_name=$3, strength=$4, form=$5, pack_size=$6, gtin=$7, category=$8, unit=$9,
            reorder_level=$10, list_price_cents=$11, active=$12 WHERE id=$1 RETURNING *`,
    [id, next.name, next.generic, next.strength, next.form, next.pack, next.gtin, next.category, next.unit, next.reorder, next.price, next.active]
  );
  return toProduct(rows[0]);
}

export async function listProducts(
  client: PoolClient,
  opts: { search?: string; category?: string; includeInactive?: boolean; limit?: number; offset?: number }
): Promise<{ items: Product[]; total: number }> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (!opts.includeInactive) where.push('active');
  if (opts.category) {
    params.push(opts.category);
    where.push(`category = $${params.length}`);
  }
  if (opts.search) {
    params.push(`%${opts.search.replace(/[%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(name ILIKE $${params.length} OR generic_name ILIKE $${params.length} OR gtin = ${/^\d{8,14}$/.test(opts.search) ? `'${opts.search.padStart(14, '0')}'` : "'-'"})`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number((await client.query(`SELECT count(*) AS n FROM products ${clause}`, params)).rows[0].n);
  const limit = Math.min(opts.limit ?? 50, 200);
  const rows = (await client.query(`SELECT * FROM products ${clause} ORDER BY name LIMIT ${limit} OFFSET ${Math.max(0, opts.offset ?? 0)}`, params)).rows;
  return { items: rows.map(toProduct), total };
}

export async function findProductByGtin(client: PoolClient, gtin: string): Promise<Product | null> {
  const row = (await client.query('SELECT * FROM products WHERE gtin = $1', [gtin])).rows[0];
  return row ? toProduct(row) : null;
}

// ---- suppliers -------------------------------------------------------------------------------------

export const supplierSchema = z.object({ name: z.string().trim().min(1).max(200), phone: z.string().trim().max(30).optional().nullable() });

export async function createSupplier(client: PoolClient, ctx: Ctx, input: z.infer<typeof supplierSchema>) {
  // whoever receives a delivery must be able to name who it came from; paying suppliers stays with managers and owners
  need(ctx, 'receive_stock');
  let phone: string | null = null;
  if (input.phone) {
    try {
      phone = normalisePhone(input.phone);
    } catch {
      phone = input.phone;
    }
  }
  const { rows } = await client.query(`INSERT INTO suppliers (org_id, name, phone) VALUES ($1, $2, $3) RETURNING id, name, phone, active`, [ctx.orgId, input.name, phone]);
  return rows[0];
}

export async function listSuppliers(client: PoolClient) {
  return (await client.query('SELECT id, name, phone, active FROM suppliers ORDER BY name')).rows;
}

// ---- receiving -------------------------------------------------------------------------------------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const receiveSchema = z.object({
  branchId: z.string().uuid().optional(),
  supplierId: z.string().uuid(),
  invoiceNumber: z.string().trim().min(1).max(60),
  invoiceDate: isoDate,
  dueDate: isoDate.optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        batchNo: z.string().trim().min(1).max(40),
        expiryDate: isoDate,
        qty: z.number().int().min(1).max(1_000_000),
        unitCostCents: z.number().int().min(0).max(100_000_000),
        /** unit serials captured by scanning each pack; may be fewer than qty (not every pack is serialised yet) */
        serials: z.array(z.string().trim().min(1).max(20)).max(5000).optional()
      })
    )
    .min(1)
    .max(200),
  witness: z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) }).optional()
});
export type ReceiveInput = z.infer<typeof receiveSchema>;

export async function receiveStock(client: PoolClient, ctx: Ctx, branch: BranchRow, input: ReceiveInput) {
  need(ctx, 'receive_stock');
  const supplier = (await client.query('SELECT id FROM suppliers WHERE id = $1 AND active', [input.supplierId])).rows[0];
  if (!supplier) throw new NotFoundError('That supplier was not found.');

  const today = (await client.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`, [branch.timezone])).rows[0].d as string;
  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const products = (await client.query('SELECT id, category, gtin, name FROM products WHERE id = ANY($1::uuid[])', [productIds])).rows;
  if (products.length !== productIds.length) throw new NotFoundError('A product on the invoice was not found.');
  const byId = new Map(products.map((p) => [p.id as string, p]));

  const controlledLines = input.lines.filter((line) => byId.get(line.productId)!.category === 'controlled');
  let witnessId: string | null = null;
  if (controlledLines.length > 0) {
    need(ctx, 'controlled');
    witnessId = await verifyWitness(client, ctx, input.witness as WitnessInput | undefined, normalisePhone);
  }

  const total = input.lines.reduce((sum, line) => sum + line.qty * line.unitCostCents, 0);
  let invoiceId: string;
  try {
    const { rows } = await client.query(
      `INSERT INTO supplier_invoices (org_id, branch_id, supplier_id, invoice_number, invoice_date, due_date, total_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [ctx.orgId, branch.id, input.supplierId, input.invoiceNumber, input.invoiceDate, input.dueDate ?? null, total, ctx.userId]
    );
    invoiceId = rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ConflictError(`Invoice ${input.invoiceNumber} from this supplier was already received.`);
    }
    throw error;
  }

  const received: Array<{ batchId: string; productId: string; batchNo: string; qty: number; expiryDate: string; serials: number }> = [];
  const warnings: string[] = [];

  for (const line of input.lines) {
    const product = byId.get(line.productId)!;
    if (line.expiryDate < today) throw new AppError(422, 'expired-on-arrival', `${product.name} batch ${line.batchNo} is already expired and cannot be received into stock.`);
    if (daysToExpiry(line.expiryDate, today) < 90) warnings.push(`${product.name} batch ${line.batchNo} expires in ${daysToExpiry(line.expiryDate, today)} days.`);
    if (line.serials && line.serials.length > line.qty) throw new BadRequestError(`${product.name}: more serial numbers than units.`);
    if (line.serials && new Set(line.serials).size !== line.serials.length) throw new BadRequestError(`${product.name}: the same serial number appears twice.`);

    const batch = (
      await client.query(
        `INSERT INTO stock_batches (org_id, branch_id, product_id, batch_no, expiry_date, qty_on_hand, qty_received, unit_cost_cents, supplier_invoice_id)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8)
         ON CONFLICT (branch_id, product_id, batch_no, expiry_date)
         DO UPDATE SET qty_on_hand = stock_batches.qty_on_hand + EXCLUDED.qty_on_hand,
                       qty_received = stock_batches.qty_received + EXCLUDED.qty_received,
                       unit_cost_cents = EXCLUDED.unit_cost_cents
         RETURNING id`,
        [ctx.orgId, branch.id, line.productId, line.batchNo, line.expiryDate, line.qty, line.unitCostCents, invoiceId]
      )
    ).rows[0];

    await client.query(
      `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, actor_id)
       VALUES ($1, $2, $3, $4, 'receive', $5, $6, 'supplier_invoice', $7, $8)`,
      [ctx.orgId, branch.id, line.productId, batch.id, line.qty, line.unitCostCents, invoiceId, ctx.userId]
    );

    for (const serial of line.serials ?? []) {
      const inserted = await client.query(
        `INSERT INTO serial_units (org_id, branch_id, product_id, batch_id, serial) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (org_id, product_id, serial) DO NOTHING RETURNING id`,
        [ctx.orgId, branch.id, line.productId, batch.id, serial]
      );
      if (inserted.rowCount === 0) {
        throw new AppError(
          409,
          'serial-already-held',
          `Serial ${serial} of ${product.name} is already in your records. A serial number is unique to one pack: check the delivery, and do not receive a possible duplicate.`
        );
      }
    }

    await client.query(
      `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id)
       VALUES ($1, $2, 'receipt', $3, $4, $5, $6, $7, $8)`,
      [ctx.orgId, branch.id, line.productId, product.gtin, line.batchNo, line.expiryDate, line.qty, invoiceId]
    );

    if (product.category === 'controlled') {
      await writeRegister(client, ctx, branch.id, line.productId, 'receive', line.qty, witnessId!, { batchNo: line.batchNo, refType: 'supplier_invoice', refId: invoiceId });
    }
    received.push({ batchId: batch.id, productId: line.productId, batchNo: line.batchNo, qty: line.qty, expiryDate: line.expiryDate, serials: line.serials?.length ?? 0 });
  }

  await audit(client, ctx, 'stock.receive', 'supplier_invoice', invoiceId, { invoiceNumber: input.invoiceNumber, totalCents: total, lines: input.lines.length }, branch.id);
  return { invoiceId, totalCents: total, received, warnings };
}

// ---- controlled register ---------------------------------------------------------------------------

/**
 * Appends one entry to the controlled-drug register. The balance row is locked first, so two entries at the same
 * moment cannot both read the same balance: balance_after on every row is the true running balance, and it can
 * never go below zero (a CHECK on the table says so as well).
 */
export async function writeRegister(
  client: PoolClient,
  ctx: Ctx,
  branchId: string,
  productId: string,
  kind: 'receive' | 'dispense' | 'adjustment' | 'writeoff',
  qtyDelta: number,
  witnessId: string,
  extra: { batchNo?: string; patientName?: string; prescriber?: string; refType?: string; refId?: string; reason?: string } = {}
): Promise<number> {
  await client.query(
    `INSERT INTO controlled_balances (org_id, branch_id, product_id, balance) VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
    [ctx.orgId, branchId, productId]
  );
  const locked = (await client.query('SELECT balance FROM controlled_balances WHERE branch_id = $1 AND product_id = $2 FOR UPDATE', [branchId, productId])).rows[0];
  const next = (locked.balance as number) + qtyDelta;
  if (next < 0) throw new AppError(409, 'controlled-balance', 'The controlled-drug register would go below zero. Check the count.');
  await client.query('UPDATE controlled_balances SET balance = $3 WHERE branch_id = $1 AND product_id = $2', [branchId, productId, next]);
  await client.query(
    `INSERT INTO controlled_register (org_id, branch_id, product_id, kind, qty_delta, balance_after, batch_no, patient_name, prescriber, ref_type, ref_id, reason, actor_id, witness_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [ctx.orgId, branchId, productId, kind, qtyDelta, next, extra.batchNo ?? null, extra.patientName ?? null, extra.prescriber ?? null, extra.refType ?? null, extra.refId ?? null, extra.reason ?? null, ctx.userId, witnessId]
  );
  return next;
}

export async function controlledRegister(client: PoolClient, branchId: string, productId: string | undefined, limit = 100) {
  const params: unknown[] = [branchId];
  let clause = 'branch_id = $1';
  if (productId) {
    params.push(productId);
    clause += ` AND product_id = $${params.length}`;
  }
  const rows = (
    await client.query(
      `SELECT r.id, r.product_id, p.name AS product, r.kind, r.qty_delta, r.balance_after, r.batch_no, r.patient_name, r.prescriber, r.reason,
              r.created_at, a.display_name AS actor, w.display_name AS witness
         FROM controlled_register r
         JOIN products p ON p.id = r.product_id
         JOIN users a ON a.id = r.actor_id
         JOIN users w ON w.id = r.witness_id
        WHERE ${clause.replace(/branch_id/g, 'r.branch_id').replace(/product_id/g, 'r.product_id')} ORDER BY r.id DESC LIMIT ${Math.min(limit, 500)}`,
      params
    )
  ).rows;
  const balances = (
    await client.query(
      `SELECT b.product_id, p.name AS product, b.balance FROM controlled_balances b JOIN products p ON p.id = b.product_id WHERE b.branch_id = $1 ORDER BY p.name`,
      [branchId]
    )
  ).rows;
  return { balances, entries: rows };
}

// ---- stock queries ---------------------------------------------------------------------------------

export async function listBatches(client: PoolClient, branchId: string, opts: { productId?: string; includeEmpty?: boolean } = {}) {
  const params: unknown[] = [branchId];
  let clause = 'b.branch_id = $1';
  if (opts.productId) {
    params.push(opts.productId);
    clause += ` AND b.product_id = $${params.length}`;
  }
  if (!opts.includeEmpty) clause += ' AND b.qty_on_hand > 0';
  const rows = (
    await client.query(
      `SELECT b.id, b.product_id, p.name AS product, p.category, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date,
              b.qty_on_hand, b.qty_received, b.unit_cost_cents, b.received_at
         FROM stock_batches b JOIN products p ON p.id = b.product_id
        WHERE ${clause} ORDER BY p.name, b.expiry_date LIMIT 1000`,
      params
    )
  ).rows;
  return rows.map((row) => ({
    id: row.id as string,
    productId: row.product_id as string,
    product: row.product as string,
    category: row.category as string,
    batchNo: row.batch_no as string,
    expiryDate: row.expiry_date as string,
    qtyOnHand: row.qty_on_hand as number,
    qtyReceived: row.qty_received as number,
    unitCostCents: Number(row.unit_cost_cents),
    receivedAt: row.received_at as Date
  }));
}

export async function stockSummary(client: PoolClient, branch: BranchRow, today: string, opts: { search?: string } = {}) {
  const params: unknown[] = [branch.id, today];
  let filter = '';
  if (opts.search) {
    params.push(`%${opts.search}%`);
    filter = `AND (p.name ILIKE $3 OR p.generic_name ILIKE $3)`;
  }
  const rows = (
    await client.query(
      `SELECT p.id, p.name, p.strength, p.form, p.category, p.reorder_level, p.list_price_cents,
              COALESCE(sum(b.qty_on_hand) FILTER (WHERE b.expiry_date >= $2::date), 0)::int AS in_date,
              COALESCE(sum(b.qty_on_hand) FILTER (WHERE b.expiry_date < $2::date), 0)::int AS expired,
              to_char(min(b.expiry_date) FILTER (WHERE b.qty_on_hand > 0 AND b.expiry_date >= $2::date), 'YYYY-MM-DD') AS next_expiry
         FROM products p
         LEFT JOIN stock_batches b ON b.product_id = p.id AND b.branch_id = $1
        WHERE p.active ${filter}
        GROUP BY p.id ORDER BY p.name LIMIT 500`,
      params
    )
  ).rows;
  return rows.map((row) => ({
    productId: row.id as string,
    name: row.name as string,
    strength: row.strength as string | null,
    form: row.form as string | null,
    category: row.category as string,
    reorderLevel: row.reorder_level as number,
    listPriceCents: Number(row.list_price_cents),
    inDate: row.in_date as number,
    expired: row.expired as number,
    nextExpiry: row.next_expiry as string | null
  }));
}

export async function alerts(client: PoolClient, branch: BranchRow, today: string, warningDays: number = env.EXPIRY_WARNING_DAYS) {
  const expired = (
    await client.query(
      `SELECT b.id AS batch_id, p.name AS product, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date, b.qty_on_hand, b.unit_cost_cents
         FROM stock_batches b JOIN products p ON p.id = b.product_id
        WHERE b.branch_id = $1 AND b.qty_on_hand > 0 AND b.expiry_date < $2::date ORDER BY b.expiry_date`,
      [branch.id, today]
    )
  ).rows;
  const expiring = (
    await client.query(
      `SELECT b.id AS batch_id, p.name AS product, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date, b.qty_on_hand, b.unit_cost_cents
         FROM stock_batches b JOIN products p ON p.id = b.product_id
        WHERE b.branch_id = $1 AND b.qty_on_hand > 0 AND b.expiry_date >= $2::date AND b.expiry_date <= ($2::date + $3::int)
        ORDER BY b.expiry_date`,
      [branch.id, today, warningDays]
    )
  ).rows;
  const low = (
    await client.query(
      `SELECT p.id AS product_id, p.name AS product, p.reorder_level,
              COALESCE(sum(b.qty_on_hand) FILTER (WHERE b.expiry_date >= $2::date), 0)::int AS in_date
         FROM products p LEFT JOIN stock_batches b ON b.product_id = p.id AND b.branch_id = $1
        WHERE p.active AND p.reorder_level > 0
        GROUP BY p.id HAVING COALESCE(sum(b.qty_on_hand) FILTER (WHERE b.expiry_date >= $2::date), 0) <= p.reorder_level
        ORDER BY p.name`,
      [branch.id, today]
    )
  ).rows;
  const shape = (row: Record<string, any>) => ({
    batchId: row.batch_id as string,
    product: row.product as string,
    batchNo: row.batch_no as string,
    expiryDate: row.expiry_date as string,
    daysToExpiry: daysToExpiry(row.expiry_date, today),
    qty: row.qty_on_hand as number,
    valueCents: Number(row.unit_cost_cents) * (row.qty_on_hand as number)
  });
  return {
    expired: expired.map(shape),
    expiring: expiring.map(shape),
    lowStock: low.map((row) => ({ productId: row.product_id as string, product: row.product as string, reorderLevel: row.reorder_level as number, inDate: row.in_date as number })),
    warningDays
  };
}

// ---- adjustments and write-offs --------------------------------------------------------------------

export const adjustSchema = z.object({
  batchId: z.string().uuid(),
  kind: z.enum(['adjustment', 'expiry_writeoff']),
  qtyDelta: z.number().int().refine((n) => n !== 0, 'qtyDelta cannot be zero'),
  reason: z.string().trim().min(3).max(300),
  witness: z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) }).optional()
});

export async function adjustStock(client: PoolClient, ctx: Ctx, branch: BranchRow, input: z.infer<typeof adjustSchema>) {
  need(ctx, 'adjust_stock');
  const batch = (
    await client.query(
      `SELECT b.*, p.category, p.gtin, p.name, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp
         FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE b.id = $1 AND b.branch_id = $2 FOR UPDATE OF b`,
      [input.batchId, branch.id]
    )
  ).rows[0];
  if (!batch) throw new NotFoundError('That batch was not found at this branch.');
  if (input.kind === 'expiry_writeoff') {
    const today = (await client.query(`SELECT to_char((now() AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS d`, [branch.timezone])).rows[0].d as string;
    if (batch.exp >= today) throw new ConflictError('Only expired batches can be written off as expired.');
    if (input.qtyDelta > 0) throw new BadRequestError('A write-off removes stock.');
  }
  const after = (batch.qty_on_hand as number) + input.qtyDelta;
  if (after < 0) throw new AppError(409, 'insufficient-stock', `The batch holds ${batch.qty_on_hand}; that would take it below zero.`);

  let witnessId: string | null = null;
  if (batch.category === 'controlled') {
    need(ctx, 'controlled');
    witnessId = await verifyWitness(client, ctx, input.witness as WitnessInput | undefined, normalisePhone);
  }
  await client.query('UPDATE stock_batches SET qty_on_hand = $2 WHERE id = $1', [batch.id, after]);
  await client.query(
    `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, reason, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [ctx.orgId, branch.id, batch.product_id, batch.id, input.kind, input.qtyDelta, batch.unit_cost_cents, input.reason, ctx.userId]
  );
  await client.query(
    `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [ctx.orgId, branch.id, input.kind === 'expiry_writeoff' ? 'writeoff' : 'adjustment', batch.product_id, batch.gtin, batch.batch_no, batch.exp, input.qtyDelta]
  );
  if (witnessId) {
    await writeRegister(client, ctx, branch.id, batch.product_id, input.kind === 'expiry_writeoff' ? 'writeoff' : 'adjustment', input.qtyDelta, witnessId, { batchNo: batch.batch_no, reason: input.reason });
  }
  await audit(client, ctx, `stock.${input.kind}`, 'stock_batch', batch.id, { qtyDelta: input.qtyDelta, reason: input.reason, product: batch.name }, branch.id);
  return { batchId: batch.id as string, qtyOnHand: after };
}

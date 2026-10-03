/**
 * First-hour support: a checklist worked out from the records (so it is never stale), and a clearly labelled SAMPLE
 * branch a pharmacist can try - selling, dispensing, an expiry alert, a low-stock alert - before entering anything
 * real. Sample data lives in its own branch, is never billed, and is hidden (never deleted: stock and money history is
 * append-only) when the owner is ready.
 */
import { PoolClient } from 'pg';
import { audit, Ctx, need } from '../common/context';
import { AppError } from '../domain/errors';
import { gs1CheckDigit } from '../gs1/parse';
import { createSale } from '../sales/service';
import { BranchRow } from '../common/context';
import { branchCodeFrom } from '../admin/provisioning';

export async function checklist(client: PoolClient) {
  const one = async (sql: string): Promise<number> => Number((await client.query(sql)).rows[0].n);
  const products = await one(`SELECT count(*) AS n FROM products WHERE NOT is_demo AND active`);
  const suppliers = await one(`SELECT count(*) AS n FROM suppliers WHERE NOT is_demo AND active`);
  const received = await one(`SELECT count(*) AS n FROM stock_movements m JOIN branches b ON b.id = m.branch_id WHERE m.kind = 'receive' AND NOT b.is_demo`);
  const sales = await one(`SELECT count(*) AS n FROM sales WHERE NOT is_demo AND status <> 'voided'`);
  const staff = await one(`SELECT count(*) AS n FROM users WHERE NOT is_demo AND status = 'active'`);
  const tills = await one(`SELECT count(*) AS n FROM branches WHERE NOT is_demo AND NOT archived AND till_number IS NOT NULL`);
  const closes = await one(`SELECT count(*) AS n FROM day_closes c JOIN branches b ON b.id = c.branch_id WHERE NOT b.is_demo`);
  const demo = await one(`SELECT count(*) AS n FROM branches WHERE is_demo AND NOT archived`);
  const items = [
    { key: 'catalogue', title: 'Add your medicines', done: products > 0, hint: 'Name, strength, price, and whether it is over the counter, prescription or controlled. Scan the box to capture its barcode.' },
    { key: 'supplier', title: 'Add a supplier', done: suppliers > 0, hint: 'Who you buy from, so deliveries and what you owe them are tracked.' },
    { key: 'receive', title: 'Receive your first delivery', done: received > 0, hint: 'Enter batch numbers and expiry dates, or scan each pack. This is what makes expiry alerts work.' },
    { key: 'sell', title: 'Make a first sale', done: sales > 0, hint: 'Scan or search, take payment, and see the stock go down.' },
    { key: 'staff', title: 'Add your team', done: staff > 1, hint: 'Give each cashier and pharmacist their own phone and PIN so every sale has a name on it.' },
    { key: 'till', title: 'Connect your M-Pesa till', done: tills > 0, hint: 'Enter the till number so customers\' payments match their sales. Until then, type the M-Pesa code at the till.' },
    { key: 'close', title: 'Close your first day', done: closes > 0, hint: 'Count the cash at the end of the day and compare it with what the system expects.' }
  ];
  return { items, doneCount: items.filter((i) => i.done).length, total: items.length, sampleDataVisible: demo > 0 };
}

interface SampleProduct {
  name: string; generic?: string; strength?: string; form?: string; pack?: string; category: 'otc' | 'prescription' | 'controlled';
  priceKes: number; costKes: number; reorder: number; stock: Array<{ qty: number; expiresInDays: number; batch: string }>;
}

const SAMPLE: SampleProduct[] = [
  { name: 'Paracetamol 500mg tablets', generic: 'Paracetamol', strength: '500mg', form: 'Tablet', pack: 'Strip of 10', category: 'otc', priceKes: 20, costKes: 8, reorder: 40, stock: [{ qty: 200, expiresInDays: 540, batch: 'PCM-2601' }, { qty: 24, expiresInDays: 35, batch: 'PCM-2511' }, { qty: 15, expiresInDays: -20, batch: 'PCM-2409' }] },
  { name: 'Ibuprofen 400mg tablets', generic: 'Ibuprofen', strength: '400mg', form: 'Tablet', pack: 'Strip of 10', category: 'otc', priceKes: 50, costKes: 28, reorder: 30, stock: [{ qty: 120, expiresInDays: 600, batch: 'IBU-2602' }] },
  { name: 'Oral rehydration salts sachet', generic: 'Oral rehydration salts', form: 'Sachet', pack: '1 sachet', category: 'otc', priceKes: 40, costKes: 22, reorder: 30, stock: [{ qty: 8, expiresInDays: 400, batch: 'ORS-2512' }] },
  { name: 'Amoxicillin 500mg capsules', generic: 'Amoxicillin', strength: '500mg', form: 'Capsule', pack: 'Strip of 10', category: 'prescription', priceKes: 120, costKes: 70, reorder: 20, stock: [{ qty: 60, expiresInDays: 480, batch: 'AMX-2601' }, { qty: 12, expiresInDays: 50, batch: 'AMX-2512' }] },
  { name: 'Cetirizine 10mg tablets', generic: 'Cetirizine', strength: '10mg', form: 'Tablet', pack: 'Strip of 10', category: 'otc', priceKes: 60, costKes: 35, reorder: 20, stock: [{ qty: 80, expiresInDays: 700, batch: 'CTZ-2603' }] },
  { name: 'Omeprazole 20mg capsules', generic: 'Omeprazole', strength: '20mg', form: 'Capsule', pack: 'Strip of 14', category: 'prescription', priceKes: 150, costKes: 90, reorder: 15, stock: [{ qty: 45, expiresInDays: 520, batch: 'OMP-2601' }] },
  { name: 'Metformin 500mg tablets', generic: 'Metformin', strength: '500mg', form: 'Tablet', pack: 'Strip of 10', category: 'prescription', priceKes: 80, costKes: 45, reorder: 20, stock: [{ qty: 90, expiresInDays: 640, batch: 'MET-2602' }] },
  { name: 'Amlodipine 5mg tablets', generic: 'Amlodipine', strength: '5mg', form: 'Tablet', pack: 'Strip of 10', category: 'prescription', priceKes: 90, costKes: 50, reorder: 20, stock: [{ qty: 70, expiresInDays: 610, batch: 'AML-2602' }] },
  { name: 'Artemether-lumefantrine 20/120mg tablets', generic: 'Artemether-lumefantrine', strength: '20/120mg', form: 'Tablet', pack: 'Pack of 24', category: 'prescription', priceKes: 250, costKes: 160, reorder: 10, stock: [{ qty: 30, expiresInDays: 420, batch: 'ALU-2601' }] },
  { name: 'Salbutamol inhaler 100mcg', generic: 'Salbutamol', strength: '100mcg', form: 'Inhaler', pack: '200 doses', category: 'prescription', priceKes: 350, costKes: 220, reorder: 5, stock: [{ qty: 14, expiresInDays: 380, batch: 'SLB-2511' }] },
  { name: 'Diazepam 5mg tablets', generic: 'Diazepam', strength: '5mg', form: 'Tablet', pack: 'Strip of 10', category: 'controlled', priceKes: 100, costKes: 60, reorder: 0, stock: [] },
  { name: 'Zinc sulphate 20mg dispersible tablets', generic: 'Zinc sulphate', strength: '20mg', form: 'Tablet', pack: 'Strip of 10', category: 'otc', priceKes: 70, costKes: 40, reorder: 20, stock: [{ qty: 55, expiresInDays: 500, batch: 'ZNC-2601' }] },
  { name: 'Povidone-iodine 10% solution 100ml', generic: 'Povidone-iodine', strength: '10%', form: 'Solution', pack: '100ml', category: 'otc', priceKes: 180, costKes: 110, reorder: 6, stock: [{ qty: 25, expiresInDays: 800, batch: 'PVI-2602' }] },
  { name: 'Hand sanitiser 100ml', form: 'Gel', pack: '100ml', category: 'otc', priceKes: 120, costKes: 70, reorder: 10, stock: [{ qty: 40, expiresInDays: 900, batch: 'HSN-2603' }] },
  { name: 'Multivitamin tablets', form: 'Tablet', pack: 'Bottle of 30', category: 'otc', priceKes: 450, costKes: 280, reorder: 6, stock: [{ qty: 18, expiresInDays: 450, batch: 'MVT-2601' }] },
  { name: 'Cough syrup 100ml', form: 'Syrup', pack: '100ml', category: 'otc', priceKes: 220, costKes: 140, reorder: 8, stock: [{ qty: 22, expiresInDays: 300, batch: 'CGH-2601' }] }
];

function sampleGtin(n: number): string {
  const body = `9${String(n).padStart(12, '0')}`; // 13 digits in a made-up number space, never a real manufacturer's
  return `${body}${gs1CheckDigit(body)}`;
}

export async function loadSampleData(client: PoolClient, ctx: Ctx) {
  need(ctx, 'branches_write');
  const live = (await client.query('SELECT 1 FROM branches WHERE is_demo AND NOT archived')).rows;
  if (live.length > 0) throw new AppError(409, 'sample-exists', 'The sample branch is already loaded.');

  const taken = new Set((await client.query('SELECT code FROM branches')).rows.map((r) => r.code as string));
  const code = branchCodeFrom('DEMO', taken);
  const branchRow = (await client.query(`INSERT INTO branches (org_id, code, name, is_demo) VALUES ($1, $2, 'Sample branch (practice here)', true) RETURNING *`, [ctx.orgId, code])).rows[0];
  const branch: BranchRow = { id: branchRow.id, code: branchRow.code, name: branchRow.name, timezone: branchRow.timezone, tillNumber: null, isDemo: true, archived: false };

  const supplier = (await client.query(`INSERT INTO suppliers (org_id, name, is_demo) VALUES ($1, $2, true) RETURNING id`, [ctx.orgId, `Sample Supplier Ltd ${code}`])).rows[0];
  const today = (await client.query(`SELECT (now() AT TIME ZONE $1)::date AS d`, [branch.timezone])).rows[0].d as Date;

  const productIds: Array<{ id: string; sample: SampleProduct }> = [];
  let n = Math.floor(Date.now() / 1000) % 1_000_000;
  const total = SAMPLE.reduce((sum, p) => sum + p.stock.reduce((inner, st) => inner + st.qty * p.costKes * 100, 0), 0);
  const invoice = (
    await client.query(
      `INSERT INTO supplier_invoices (org_id, branch_id, supplier_id, invoice_number, invoice_date, due_date, total_cents, created_by)
       VALUES ($1, $2, $3, $4, $5, ($5::date + 14), $6, $7) RETURNING id`,
      [ctx.orgId, branch.id, supplier.id, `SAMPLE-${code}-1`, today, total, ctx.userId]
    )
  ).rows[0];

  for (const sample of SAMPLE) {
    n += 1;
    const gtin = sampleGtin(n);
    const product = (
      await client.query(
        `INSERT INTO products (org_id, name, generic_name, strength, form, pack_size, gtin, category, reorder_level, list_price_cents, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true) RETURNING id`,
        [ctx.orgId, sample.name, sample.generic ?? null, sample.strength ?? null, sample.form ?? null, sample.pack ?? null, gtin, sample.category, sample.reorder, sample.priceKes * 100]
      )
    ).rows[0];
    productIds.push({ id: product.id, sample });
    for (const stock of sample.stock) {
      const batch = (
        await client.query(
          `INSERT INTO stock_batches (org_id, branch_id, product_id, batch_no, expiry_date, qty_on_hand, qty_received, unit_cost_cents, supplier_invoice_id)
           VALUES ($1, $2, $3, $4, ($5::date + $6::int), $7, $7, $8, $9) RETURNING id`,
          [ctx.orgId, branch.id, product.id, stock.batch, today, stock.expiresInDays, stock.qty, sample.costKes * 100, invoice.id]
        )
      ).rows[0];
      await client.query(
        `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, reason, actor_id)
         VALUES ($1, $2, $3, $4, 'receive', $5, $6, 'sample', 'sample data', $7)`,
        [ctx.orgId, branch.id, product.id, batch.id, stock.qty, sample.costKes * 100, ctx.userId]
      );
    }
  }
  // a customer on credit and a handful of sales, so reports and the day close have something to show
  const customer = (
    await client.query(`INSERT INTO customers (org_id, name, credit_limit_cents, is_demo) VALUES ($1, 'Sample Customer', 500000, true) RETURNING id`, [ctx.orgId])
  ).rows[0];
  const idOf = (name: string) => productIds.find((p) => p.sample.name.startsWith(name))!.id;
  const sales = [
    { lines: [{ productId: idOf('Paracetamol'), qty: 3 }, { productId: idOf('Zinc sulphate'), qty: 1 }], payments: [{ method: 'cash' as const, amountCents: 20000 }] },
    { lines: [{ productId: idOf('Ibuprofen'), qty: 2 }, { productId: idOf('Cetirizine'), qty: 1 }], payments: [{ method: 'cash' as const, amountCents: 20000 }] },
    { lines: [{ productId: idOf('Cough syrup'), qty: 1 }], payments: [] as never[] },
    { lines: [{ productId: idOf('Hand sanitiser'), qty: 2 }], customerId: customer.id as string, payments: [{ method: 'credit' as const, amountCents: 24000 }] },
    { lines: [{ productId: idOf('Amoxicillin'), qty: 1, dispensing: { patientName: 'Sample Patient', prescriberName: 'Dr Sample', prescriptionRef: 'SAMPLE-RX-1', patientAgeYears: 34, patientSex: 'female' as const, directions: 'One capsule three times a day for 5 days' } }], payments: [{ method: 'cash' as const, amountCents: 12000 }] }
  ];
  let made = 0;
  for (const sale of sales) {
    await createSale(client, ctx, branch, { branchId: branch.id, customerId: (sale as { customerId?: string }).customerId, lines: sale.lines, payments: sale.payments, discountCents: 0 });
    made += 1;
  }
  await audit(client, ctx, 'sample.load', 'branch', branch.id, { products: SAMPLE.length, sales: made }, branch.id);
  return { branchId: branch.id, code, products: SAMPLE.length, sales: made };
}

export async function hideSampleData(client: PoolClient, ctx: Ctx) {
  need(ctx, 'branches_write');
  const branches = await client.query(`UPDATE branches SET archived = true WHERE is_demo AND NOT archived RETURNING id`);
  await client.query(`UPDATE products SET active = false WHERE is_demo`);
  await client.query(`UPDATE customers SET active = false WHERE is_demo`);
  await client.query(`UPDATE suppliers SET active = false WHERE is_demo`);
  await audit(client, ctx, 'sample.hide', 'branch', null, { branches: branches.rowCount });
  return { hidden: branches.rowCount ?? 0 };
}

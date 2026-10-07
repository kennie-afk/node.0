/** What the pharmacy owes its suppliers: received invoices, payments against them, and what is overdue. */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, NotFoundError } from '../domain/errors';
import { audit, Ctx, need } from '../common/context';
import { toPage } from '../common/paging';

export const supplierPaymentSchema = z.object({
  amountCents: z.number().int().positive().max(10_000_000_000),
  method: z.enum(['cash', 'mpesa', 'bank', 'other']),
  reference: z.string().trim().max(60).optional()
});

const INVOICES_CTE = `
  WITH inv AS (
    SELECT i.id, i.supplier_id, i.branch_id, i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
           i.total_cents, i.created_at, i.voided_at, i.void_reason, s.name AS supplier,
           COALESCE((SELECT sum(amount_cents) FROM supplier_payments p WHERE p.supplier_invoice_id = i.id), 0)::bigint AS paid,
           COALESCE((SELECT sum(amount_cents) FROM supplier_credit_notes c WHERE c.supplier_invoice_id = i.id), 0)::bigint AS credited
      FROM supplier_invoices i JOIN suppliers s ON s.id = i.supplier_id
     WHERE ($1::uuid IS NULL OR i.branch_id = $1) AND ($2::uuid IS NULL OR i.supplier_id = $2)
  )`;

export async function listPayables(client: PoolClient, branchId: string | null, opts: { openOnly?: boolean; supplierId?: string; limit?: number; offset?: number } = {}) {
  const limit = Math.min(Math.max(1, opts.limit ?? 100), 300);
  const offset = Math.max(0, opts.offset ?? 0);
  const today = (await client.query(`SELECT to_char((now() AT TIME ZONE COALESCE((SELECT timezone FROM branches WHERE ($1::uuid IS NULL OR id = $1) AND NOT is_demo ORDER BY archived, created_at LIMIT 1), 'Africa/Nairobi'))::date, 'YYYY-MM-DD') AS d`, [branchId])).rows[0].d as string;
  // what is owed is summed over every invoice, not just the page on screen
  const totals = (
    await client.query(
      `${INVOICES_CTE}
       SELECT COALESCE(sum(total_cents - paid - credited) FILTER (WHERE voided_at IS NULL AND total_cents - paid - credited > 0), 0)::bigint AS outstanding,
              COALESCE(sum(total_cents - paid - credited) FILTER (WHERE voided_at IS NULL AND total_cents - paid - credited > 0 AND due_date < $3), 0)::bigint AS overdue
         FROM inv`,
      [branchId, opts.supplierId ?? null, today]
    )
  ).rows[0];
  const rows = (
    await client.query(
      `${INVOICES_CTE}
       SELECT * FROM inv WHERE (NOT $3::boolean OR (voided_at IS NULL AND total_cents - paid - credited > 0))
        ORDER BY invoice_date DESC, created_at DESC, id DESC LIMIT ${limit + 1} OFFSET ${offset}`,
      [branchId, opts.supplierId ?? null, opts.openOnly === true]
    )
  ).rows;
  const items = rows.map((r) => {
    const voided = r.voided_at !== null;
    const balance = voided ? 0 : Number(r.total_cents) - Number(r.paid) - Number(r.credited);
    return {
      id: r.id as string, supplierId: r.supplier_id as string, supplier: r.supplier as string, invoiceNumber: r.invoice_number as string, invoiceDate: r.invoice_date as string, dueDate: r.due_date as string | null,
      totalCents: Number(r.total_cents), paidCents: Number(r.paid), creditedCents: Number(r.credited), balanceCents: balance,
      overdue: balance > 0 && r.due_date !== null && (r.due_date as string) < today, voided, voidReason: r.void_reason as string | null
    };
  });
  const page = toPage(items, limit, offset);
  return { ...page, outstandingCents: Number(totals.outstanding), overdueCents: Number(totals.overdue) };
}

export async function paySupplierInvoice(client: PoolClient, ctx: Ctx, invoiceId: string, input: z.infer<typeof supplierPaymentSchema>) {
  need(ctx, 'suppliers');
  // Supplier invoices are append-only (the application role has no UPDATE on them, so no row lock either): payments to one
  // invoice are serialised with a transaction-scoped advisory lock instead, so two payments cannot both fit the same balance.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [`supplier-invoice:${invoiceId}`]);
  const invoice = (await client.query('SELECT id, branch_id, total_cents, invoice_number, voided_at FROM supplier_invoices WHERE id = $1', [invoiceId])).rows[0];
  if (!invoice) throw new NotFoundError('That supplier invoice was not found.');
  if (invoice.voided_at) throw new AppError(409, 'invoice-voided', 'That invoice was voided; nothing is owed on it.');
  if (ctx.branchId && invoice.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That invoice belongs to a different branch.');
  const paid = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS p FROM supplier_payments WHERE supplier_invoice_id = $1', [invoiceId])).rows[0].p);
  const credited = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS c FROM supplier_credit_notes WHERE supplier_invoice_id = $1', [invoiceId])).rows[0].c);
  const balance = Number(invoice.total_cents) - paid - credited;
  if (input.amountCents > balance) throw new AppError(422, 'overpay', `Only KSh ${(balance / 100).toLocaleString('en-KE')} is still owed on that invoice.`);
  await client.query(`INSERT INTO supplier_payments (org_id, supplier_invoice_id, amount_cents, method, reference, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [ctx.orgId, invoiceId, input.amountCents, input.method, input.reference ?? null, ctx.userId]);
  await audit(client, ctx, 'supplier.payment', 'supplier_invoice', invoiceId, { amountCents: input.amountCents, method: input.method }, invoice.branch_id);
  return { invoiceId, balanceCents: balance - input.amountCents };
}

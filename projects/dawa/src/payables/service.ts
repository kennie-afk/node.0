/** What the pharmacy owes its suppliers: received invoices, payments against them, and what is overdue. */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, NotFoundError } from '../domain/errors';
import { audit, Ctx, need } from '../common/context';

export const supplierPaymentSchema = z.object({
  amountCents: z.number().int().positive().max(10_000_000_000),
  method: z.enum(['cash', 'mpesa', 'bank', 'other']),
  reference: z.string().trim().max(60).optional()
});

export async function listPayables(client: PoolClient, branchId: string | null, opts: { openOnly?: boolean } = {}) {
  const rows = (
    await client.query(
      `SELECT i.id, i.invoice_number, to_char(i.invoice_date, 'YYYY-MM-DD') AS invoice_date, to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.total_cents,
              s.name AS supplier, COALESCE((SELECT sum(amount_cents) FROM supplier_payments p WHERE p.supplier_invoice_id = i.id), 0)::bigint AS paid
         FROM supplier_invoices i JOIN suppliers s ON s.id = i.supplier_id
        WHERE ($1::uuid IS NULL OR i.branch_id = $1) ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT 300`,
      [branchId]
    )
  ).rows;
  const today = new Date().toISOString().slice(0, 10);
  const items = rows
    .map((r) => {
      const balance = Number(r.total_cents) - Number(r.paid);
      return {
        id: r.id as string, supplier: r.supplier as string, invoiceNumber: r.invoice_number as string, invoiceDate: r.invoice_date as string, dueDate: r.due_date as string | null,
        totalCents: Number(r.total_cents), paidCents: Number(r.paid), balanceCents: balance, overdue: balance > 0 && r.due_date !== null && (r.due_date as string) < today
      };
    })
    .filter((item) => !opts.openOnly || item.balanceCents > 0);
  return {
    items,
    outstandingCents: items.reduce((sum, i) => sum + i.balanceCents, 0),
    overdueCents: items.filter((i) => i.overdue).reduce((sum, i) => sum + i.balanceCents, 0)
  };
}

export async function paySupplierInvoice(client: PoolClient, ctx: Ctx, invoiceId: string, input: z.infer<typeof supplierPaymentSchema>) {
  need(ctx, 'suppliers');
  const invoice = (await client.query('SELECT id, branch_id, total_cents, invoice_number FROM supplier_invoices WHERE id = $1 FOR UPDATE', [invoiceId])).rows[0];
  if (!invoice) throw new NotFoundError('That supplier invoice was not found.');
  if (ctx.branchId && invoice.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That invoice belongs to a different branch.');
  const paid = Number((await client.query('SELECT COALESCE(sum(amount_cents), 0)::bigint AS p FROM supplier_payments WHERE supplier_invoice_id = $1', [invoiceId])).rows[0].p);
  const balance = Number(invoice.total_cents) - paid;
  if (input.amountCents > balance) throw new AppError(422, 'overpay', `Only KSh ${(balance / 100).toLocaleString('en-KE')} is still owed on that invoice.`);
  await client.query(`INSERT INTO supplier_payments (org_id, supplier_invoice_id, amount_cents, method, reference, created_by) VALUES ($1, $2, $3, $4, $5, $6)`, [ctx.orgId, invoiceId, input.amountCents, input.method, input.reference ?? null, ctx.userId]);
  await audit(client, ctx, 'supplier.payment', 'supplier_invoice', invoiceId, { amountCents: input.amountCents, method: input.method }, invoice.branch_id);
  return { invoiceId, balanceCents: balance - input.amountCents };
}

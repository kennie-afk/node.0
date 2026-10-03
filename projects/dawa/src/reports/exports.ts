/**
 * Plain CSV exports of a branch's records, so a pharmacy can always take its own data out: sales, stock, and the
 * controlled-drug register (the dispensing log and the trace log have their own exports).
 */
import { PoolClient } from 'pg';
import { BranchRow } from '../common/context';
import { toCsv } from '../common/csv';

export async function salesCsv(client: PoolClient, branch: BranchRow, from: string, to: string): Promise<string> {
  const rows = (
    await client.query(
      `SELECT s.number, to_char(s.business_day, 'YYYY-MM-DD') AS day, s.created_at, s.status, u.display_name AS cashier, c.name AS customer,
              p.name AS product, l.qty, l.unit_price_cents, l.line_total_cents, l.returned_qty, s.discount_cents, s.total_cents,
              (SELECT string_agg(x.method || ':' || x.amount_cents, ';') FROM sale_payments x WHERE x.sale_id = s.id) AS payments
         FROM sales s JOIN sale_lines l ON l.sale_id = s.id JOIN products p ON p.id = l.product_id JOIN users u ON u.id = s.cashier_id LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.branch_id = $1 AND s.business_day BETWEEN $2 AND $3 ORDER BY s.created_at, l.id LIMIT 200000`,
      [branch.id, from, to]
    )
  ).rows;
  return toCsv(
    ['sale', 'day', 'time', 'status', 'cashier', 'customer', 'product', 'qty', 'unit_price_kes', 'line_total_kes', 'returned_qty', 'sale_discount_kes', 'sale_total_kes', 'payments_method_amount_kes'],
    rows.map((r) => [r.number, r.day, r.created_at, r.status, r.cashier, r.customer, r.product, r.qty, Number(r.unit_price_cents) / 100, Number(r.line_total_cents) / 100, r.returned_qty, Number(r.discount_cents) / 100, Number(r.total_cents) / 100,
      r.payments ? String(r.payments).split(';').map((p) => { const [m, a] = p.split(':'); return `${m}:${Number(a) / 100}`; }).join(';') : ''])
  );
}

export async function stockCsv(client: PoolClient, branch: BranchRow): Promise<string> {
  const rows = (
    await client.query(
      `SELECT p.name, p.category, p.gtin, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date, b.qty_on_hand, b.qty_received, b.unit_cost_cents, b.received_at
         FROM stock_batches b JOIN products p ON p.id = b.product_id WHERE b.branch_id = $1 ORDER BY p.name, b.expiry_date`,
      [branch.id]
    )
  ).rows;
  return toCsv(['product', 'class', 'gtin', 'batch', 'expiry', 'on_hand', 'received', 'unit_cost_kes', 'received_at'],
    rows.map((r) => [r.name, r.category, r.gtin, r.batch_no, r.expiry_date, r.qty_on_hand, r.qty_received, Number(r.unit_cost_cents) / 100, r.received_at]));
}

export async function controlledCsv(client: PoolClient, branch: BranchRow): Promise<string> {
  const rows = (
    await client.query(
      `SELECT r.id, r.created_at, p.name AS product, r.kind, r.qty_delta, r.balance_after, r.batch_no, r.patient_name, r.prescriber, r.reason, a.display_name AS actor, w.display_name AS witness
         FROM controlled_register r JOIN products p ON p.id = r.product_id JOIN users a ON a.id = r.actor_id JOIN users w ON w.id = r.witness_id
        WHERE r.branch_id = $1 ORDER BY r.id`,
      [branch.id]
    )
  ).rows;
  return toCsv(['entry', 'time', 'drug', 'kind', 'qty_change', 'balance_after', 'batch', 'patient', 'prescriber', 'reason', 'by', 'witness'],
    rows.map((r) => [r.id, r.created_at, r.product, r.kind, r.qty_delta, r.balance_after, r.batch_no, r.patient_name, r.prescriber, r.reason, r.actor, r.witness]));
}

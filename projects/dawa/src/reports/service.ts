/**
 * Reports. Every figure is computed from the records on request, never stored, so a report can never disagree with
 * the ledger it is read from. Revenue is net of returns and of voided sales; margin uses what the batches actually cost.
 */
import { PoolClient } from 'pg';
import { BranchRow } from '../common/context';

const share = `(l.qty - l.returned_qty)::numeric / l.qty * (s.total_cents::numeric / NULLIF(s.subtotal_cents, 0))`;

export async function salesSummary(client: PoolClient, branchIds: string[], from: string, to: string) {
  const days = (
    await client.query(
      `SELECT to_char(s.business_day, 'YYYY-MM-DD') AS day, count(*) FILTER (WHERE s.status <> 'voided')::int AS sales,
              COALESCE(sum(s.total_cents) FILTER (WHERE s.status <> 'voided'), 0)::bigint AS gross,
              count(*) FILTER (WHERE s.status = 'voided')::int AS voids
         FROM sales s WHERE s.branch_id = ANY($1::uuid[]) AND s.business_day BETWEEN $2 AND $3 GROUP BY s.business_day ORDER BY s.business_day`,
      [branchIds, from, to]
    )
  ).rows;
  const refunds = (
    await client.query(
      `SELECT to_char((r.created_at AT TIME ZONE b.timezone)::date, 'YYYY-MM-DD') AS day, sum(r.refund_cents)::bigint AS refunded
         FROM sale_returns r JOIN branches b ON b.id = r.branch_id
        WHERE r.branch_id = ANY($1::uuid[]) AND (r.created_at AT TIME ZONE b.timezone)::date BETWEEN $2 AND $3 GROUP BY 1`,
      [branchIds, from, to]
    )
  ).rows;
  const methods = (
    await client.query(
      `SELECT p.method, sum(p.amount_cents)::bigint AS amount
         FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE s.branch_id = ANY($1::uuid[]) AND s.business_day BETWEEN $2 AND $3 AND s.status <> 'voided' GROUP BY p.method`,
      [branchIds, from, to]
    )
  ).rows;
  const refundByDay = new Map(refunds.map((r) => [r.day as string, Number(r.refunded)]));
  const perDay = days.map((d) => ({ day: d.day as string, sales: d.sales as number, voids: d.voids as number, grossCents: Number(d.gross), refundedCents: refundByDay.get(d.day) ?? 0, netCents: Number(d.gross) - (refundByDay.get(d.day) ?? 0) }));
  return {
    from, to,
    salesCount: perDay.reduce((s, d) => s + d.sales, 0),
    netCents: perDay.reduce((s, d) => s + d.netCents, 0),
    byMethod: Object.fromEntries(methods.map((m) => [m.method as string, Number(m.amount)])),
    perDay
  };
}

export async function margin(client: PoolClient, branchIds: string[], from: string, to: string) {
  const rows = (
    await client.query(
      `SELECT p.id AS product_id, p.name, p.category,
              COALESCE(sum((l.qty - l.returned_qty))::int, 0) AS units,
              COALESCE(sum(l.line_total_cents * ${share}), 0)::bigint AS revenue,
              COALESCE(sum(l.cost_cents::numeric * (l.qty - l.returned_qty) / l.qty), 0)::bigint AS cost
         FROM sale_lines l JOIN sales s ON s.id = l.sale_id JOIN products p ON p.id = l.product_id
        WHERE s.branch_id = ANY($1::uuid[]) AND s.business_day BETWEEN $2 AND $3 AND s.status <> 'voided'
        GROUP BY p.id ORDER BY revenue DESC LIMIT 500`,
      [branchIds, from, to]
    )
  ).rows;
  const items = rows.map((r) => {
    const revenue = Number(r.revenue);
    const cost = Number(r.cost);
    return { productId: r.product_id as string, name: r.name as string, category: r.category as string, units: r.units as number, revenueCents: revenue, costCents: cost, marginCents: revenue - cost, marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null };
  });
  const revenue = items.reduce((s, i) => s + i.revenueCents, 0);
  const cost = items.reduce((s, i) => s + i.costCents, 0);
  return { from, to, revenueCents: revenue, costCents: cost, marginCents: revenue - cost, marginPct: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null, items };
}

/** Fast and slow movers over the last `days` days, with how many days the stock in hand will last at that rate. */
export async function movers(client: PoolClient, branch: BranchRow, today: string, days = 30) {
  const rows = (
    await client.query(
      `SELECT p.id AS product_id, p.name,
              COALESCE((SELECT sum(l.qty - l.returned_qty) FROM sale_lines l JOIN sales s ON s.id = l.sale_id
                         WHERE l.product_id = p.id AND s.branch_id = $1 AND s.status <> 'voided' AND s.business_day > ($2::date - $3::int)), 0)::int AS sold,
              COALESCE((SELECT sum(b.qty_on_hand) FROM stock_batches b WHERE b.product_id = p.id AND b.branch_id = $1 AND b.expiry_date >= $2::date), 0)::int AS on_hand,
              COALESCE((SELECT sum(b.qty_on_hand * b.unit_cost_cents) FROM stock_batches b WHERE b.product_id = p.id AND b.branch_id = $1 AND b.expiry_date >= $2::date), 0)::bigint AS value
         FROM products p WHERE p.active ORDER BY sold DESC, p.name`,
      [branch.id, today, days]
    )
  ).rows;
  const items = rows.map((r) => {
    const perDay = (r.sold as number) / days;
    return { productId: r.product_id as string, name: r.name as string, sold: r.sold as number, onHand: r.on_hand as number, stockValueCents: Number(r.value), daysOfCover: perDay > 0 ? Math.round((r.on_hand as number) / perDay) : null };
  });
  return {
    days,
    fast: items.filter((i) => i.sold > 0).slice(0, 20),
    slow: items.filter((i) => i.sold > 0 && i.daysOfCover !== null && i.daysOfCover > 180).sort((a, b) => (b.daysOfCover ?? 0) - (a.daysOfCover ?? 0)).slice(0, 20),
    dead: items.filter((i) => i.sold === 0 && i.onHand > 0).sort((a, b) => b.stockValueCents - a.stockValueCents).slice(0, 50)
  };
}

export async function expiryLoss(client: PoolClient, branch: BranchRow, today: string, from: string, to: string) {
  const written = (
    await client.query(
      `SELECT COALESCE(sum(-m.qty_delta * m.unit_cost_cents), 0)::bigint AS value, COALESCE(sum(-m.qty_delta), 0)::int AS units
         FROM stock_movements m WHERE m.branch_id = $1 AND m.kind = 'expiry_writeoff' AND (m.created_at AT TIME ZONE $4)::date BETWEEN $2 AND $3`,
      [branch.id, from, to, branch.timezone]
    )
  ).rows[0];
  const sitting = (
    await client.query(
      `SELECT COALESCE(sum(qty_on_hand * unit_cost_cents), 0)::bigint AS value, COALESCE(sum(qty_on_hand), 0)::int AS units
         FROM stock_batches WHERE branch_id = $1 AND qty_on_hand > 0 AND expiry_date < $2::date`,
      [branch.id, today]
    )
  ).rows[0];
  return {
    from, to,
    writtenOffCents: Number(written.value), writtenOffUnits: written.units as number,
    expiredOnShelfCents: Number(sitting.value), expiredOnShelfUnits: sitting.units as number
  };
}

export async function stockValuation(client: PoolClient, branch: BranchRow, today: string) {
  const row = (
    await client.query(
      `SELECT COALESCE(sum(qty_on_hand * unit_cost_cents) FILTER (WHERE expiry_date >= $2::date), 0)::bigint AS in_date,
              COALESCE(sum(qty_on_hand * unit_cost_cents) FILTER (WHERE expiry_date < $2::date), 0)::bigint AS expired
         FROM stock_batches WHERE branch_id = $1 AND qty_on_hand > 0`,
      [branch.id, today]
    )
  ).rows[0];
  return { inDateCents: Number(row.in_date), expiredCents: Number(row.expired) };
}

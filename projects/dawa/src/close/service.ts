/**
 * The day close: what each till should hold against what was counted. Cash expected per person is the cash they took
 * on the day's non-voided sales minus the cash refunds they paid out; M-Pesa and credit are shown for the record. A day
 * is closed once: after that no sale, payment or void can be added to it, and the close itself can never be edited.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, BadRequestError } from '../domain/errors';
import { audit, BranchRow, businessDayNow, Ctx, need } from '../common/context';

export const closeSchema = z.object({
  branchId: z.string().uuid().optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  counts: z.array(z.object({ cashierId: z.string().uuid(), countedCashCents: z.number().int().min(0).max(10_000_000_000) })).max(100),
  note: z.string().trim().max(300).optional()
});

export async function previewClose(client: PoolClient, branch: BranchRow, day: string) {
  const cash = (
    await client.query(
      `SELECT p.created_by AS cashier_id, u.display_name AS name, sum(p.amount_cents)::bigint AS taken
         FROM sale_payments p JOIN sales s ON s.id = p.sale_id LEFT JOIN users u ON u.id = p.created_by
        WHERE s.branch_id = $1 AND s.business_day = $2 AND s.status <> 'voided' AND p.method = 'cash'
        GROUP BY p.created_by, u.display_name`,
      [branch.id, day]
    )
  ).rows;
  const refunds = (
    await client.query(
      `SELECT r.actor_id AS cashier_id, u.display_name AS name, sum(r.refund_cents)::bigint AS paid_out
         FROM sale_returns r LEFT JOIN users u ON u.id = r.actor_id
        WHERE r.branch_id = $1 AND (r.created_at AT TIME ZONE $3)::date = $2::date AND r.refund_method = 'cash'
        GROUP BY r.actor_id, u.display_name`,
      [branch.id, day, branch.timezone]
    )
  ).rows;
  const people = new Map<string, { cashierId: string; name: string; takenCents: number; refundedCents: number }>();
  for (const row of cash) people.set(row.cashier_id, { cashierId: row.cashier_id, name: row.name ?? 'Unknown', takenCents: Number(row.taken), refundedCents: 0 });
  for (const row of refunds) {
    const entry = people.get(row.cashier_id) ?? { cashierId: row.cashier_id, name: row.name ?? 'Unknown', takenCents: 0, refundedCents: 0 };
    entry.refundedCents = Number(row.paid_out);
    people.set(row.cashier_id, entry);
  }
  const totals = (
    await client.query(
      `SELECT count(*) FILTER (WHERE s.status <> 'voided')::int AS sales, count(*) FILTER (WHERE s.status = 'voided')::int AS voids,
              COALESCE(sum(s.total_cents - COALESCE((SELECT sum(amount_cents) FROM sale_payments x WHERE x.sale_id = s.id), 0)) FILTER (WHERE s.status = 'pending_payment'), 0)::bigint AS pending
         FROM sales s WHERE s.branch_id = $1 AND s.business_day = $2`,
      [branch.id, day]
    )
  ).rows[0];
  const byMethod = (
    await client.query(
      `SELECT p.method, COALESCE(sum(p.amount_cents), 0)::bigint AS amount
         FROM sale_payments p JOIN sales s ON s.id = p.sale_id WHERE s.branch_id = $1 AND s.business_day = $2 AND s.status <> 'voided' GROUP BY p.method`,
      [branch.id, day]
    )
  ).rows;
  const method = (name: string) => Number(byMethod.find((r) => r.method === name)?.amount ?? 0);
  const cashiers = [...people.values()].map((p) => ({ ...p, expectedCashCents: p.takenCents - p.refundedCents }));
  const closed = (await client.query('SELECT id FROM day_closes WHERE branch_id = $1 AND business_day = $2', [branch.id, day])).rows[0];
  return {
    day,
    closed: Boolean(closed),
    salesCount: totals.sales as number,
    voidsCount: totals.voids as number,
    expectedCashCents: cashiers.reduce((sum, c) => sum + c.expectedCashCents, 0),
    mpesaCents: method('mpesa'),
    creditCents: method('credit'),
    pendingCents: Number(totals.pending),
    cashiers
  };
}

export async function closeDay(client: PoolClient, ctx: Ctx, branch: BranchRow, input: z.infer<typeof closeSchema>) {
  need(ctx, 'day_close');
  const today = await businessDayNow(client, branch.timezone);
  if (input.day > today) throw new BadRequestError('A day that has not happened yet cannot be closed.');
  const preview = await previewClose(client, branch, input.day);
  if (preview.closed) throw new AppError(409, 'day-closed', `The day ${input.day} is already closed at this branch.`);

  const counted = new Map(input.counts.map((c) => [c.cashierId, c.countedCashCents]));
  const missing = preview.cashiers.filter((c) => c.expectedCashCents !== 0 && !counted.has(c.cashierId));
  if (missing.length > 0) {
    throw new AppError(422, 'count-missing', `Count the cash for ${missing.map((m) => m.name).join(', ')} before closing.`);
  }
  const known = new Set(preview.cashiers.map((c) => c.cashierId));
  for (const id of counted.keys()) if (!known.has(id)) throw new BadRequestError('A count was given for someone who took no cash that day.');

  const countedTotal = [...counted.values()].reduce((sum, v) => sum + v, 0);
  const variance = countedTotal - preview.expectedCashCents;
  let id: string;
  try {
    id = (
      await client.query(
        `INSERT INTO day_closes (org_id, branch_id, business_day, sales_count, voids_count, expected_cash_cents, counted_cash_cents, cash_variance_cents,
                                 mpesa_cents, credit_cents, pending_cents, note, closed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
        [ctx.orgId, branch.id, input.day, preview.salesCount, preview.voidsCount, preview.expectedCashCents, countedTotal, variance, preview.mpesaCents, preview.creditCents, preview.pendingCents, input.note ?? null, ctx.userId]
      )
    ).rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'day-closed', `The day ${input.day} is already closed at this branch.`);
    throw error;
  }
  for (const c of preview.cashiers) {
    const countedCash = counted.get(c.cashierId) ?? 0;
    await client.query(
      `INSERT INTO day_close_cashiers (org_id, day_close_id, cashier_id, expected_cash_cents, counted_cash_cents, variance_cents) VALUES ($1, $2, $3, $4, $5, $6)`,
      [ctx.orgId, id, c.cashierId, c.expectedCashCents, countedCash, countedCash - c.expectedCashCents]
    );
  }
  await audit(client, ctx, 'day.close', 'day_close', id, { day: input.day, varianceCents: variance, pendingCents: preview.pendingCents }, branch.id);
  return { id, day: input.day, expectedCashCents: preview.expectedCashCents, countedCashCents: countedTotal, cashVarianceCents: variance, pendingCents: preview.pendingCents };
}

export async function listCloses(client: PoolClient, branchId: string, limit = 31) {
  const rows = (
    await client.query(
      `SELECT c.id, to_char(c.business_day, 'YYYY-MM-DD') AS day, c.sales_count, c.expected_cash_cents, c.counted_cash_cents, c.cash_variance_cents, c.mpesa_cents, c.credit_cents, c.pending_cents, c.closed_at, u.display_name AS closed_by
         FROM day_closes c JOIN users u ON u.id = c.closed_by WHERE c.branch_id = $1 ORDER BY c.business_day DESC LIMIT $2`,
      [branchId, Math.min(limit, 366)]
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id as string, day: r.day as string, salesCount: r.sales_count as number, expectedCashCents: Number(r.expected_cash_cents), countedCashCents: Number(r.counted_cash_cents),
    cashVarianceCents: Number(r.cash_variance_cents), mpesaCents: Number(r.mpesa_cents), creditCents: Number(r.credit_cents), pendingCents: Number(r.pending_cents),
    closedAt: r.closed_at as Date, closedBy: r.closed_by as string
  }));
}

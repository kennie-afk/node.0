/**
 * Stock-takes. Starting one snapshots what the system believes every batch holds; people count the shelves and enter
 * what they found; a manager approves, and only then does the difference post. The difference is applied to the stock
 * as it is at approval (counted minus what was expected at the snapshot), so sales made during the count are not lost.
 * Every variance is a stock movement with the stock-take as its reason, so a shortage is on record, not silently fixed.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { AppError, ConflictError, NotFoundError } from '../domain/errors';
import { normalisePhone } from '../admin/phone';
import { audit, BranchRow, Ctx, need, verifyWitness, WitnessInput } from '../common/context';
import { writeRegister } from '../inventory/service';

export const countsSchema = z.object({
  counts: z.array(z.object({ batchId: z.string().uuid(), countedQty: z.number().int().min(0).max(10_000_000) })).min(1).max(2000)
});
export const approveSchema = z.object({
  skipUncounted: z.boolean().default(false),
  witness: z.object({ phone: z.string().min(6).max(20), pin: z.string().min(4).max(64) }).optional()
});

export async function startStocktake(client: PoolClient, ctx: Ctx, branch: BranchRow, note?: string) {
  need(ctx, 'stocktake_count');
  let id: string;
  try {
    id = (await client.query(`INSERT INTO stocktakes (org_id, branch_id, note, started_by) VALUES ($1, $2, $3, $4) RETURNING id`, [ctx.orgId, branch.id, note ?? null, ctx.userId])).rows[0].id;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ConflictError('A stock-take is already open at this branch. Finish or cancel it first.');
    throw error;
  }
  const lines = await client.query(
    `INSERT INTO stocktake_lines (org_id, stocktake_id, batch_id, expected_qty)
     SELECT $1, $2, id, qty_on_hand FROM stock_batches WHERE branch_id = $3 AND qty_on_hand > 0`,
    [ctx.orgId, id, branch.id]
  );
  await audit(client, ctx, 'stocktake.start', 'stocktake', id, { lines: lines.rowCount }, branch.id);
  return { id, lines: lines.rowCount ?? 0 };
}

export async function getStocktake(client: PoolClient, id: string) {
  const header = (await client.query('SELECT * FROM stocktakes WHERE id = $1', [id])).rows[0];
  if (!header) throw new NotFoundError('That stock-take was not found.');
  const lines = (
    await client.query(
      `SELECT l.batch_id, p.name AS product, p.category, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS expiry_date, b.unit_cost_cents,
              l.expected_qty, l.counted_qty
         FROM stocktake_lines l JOIN stock_batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id
        WHERE l.stocktake_id = $1 ORDER BY p.name, b.expiry_date`,
      [id]
    )
  ).rows;
  return {
    id: header.id as string,
    branchId: header.branch_id as string,
    status: header.status as string,
    note: header.note as string | null,
    startedAt: header.started_at as Date,
    lines: lines.map((l) => ({
      batchId: l.batch_id as string, product: l.product as string, category: l.category as string, batchNo: l.batch_no as string, expiryDate: l.expiry_date as string,
      expectedQty: l.expected_qty as number, countedQty: l.counted_qty as number | null,
      variance: l.counted_qty === null ? null : (l.counted_qty as number) - (l.expected_qty as number),
      varianceValueCents: l.counted_qty === null ? null : ((l.counted_qty as number) - (l.expected_qty as number)) * Number(l.unit_cost_cents)
    }))
  };
}

export async function currentStocktake(client: PoolClient, branchId: string) {
  const row = (await client.query(`SELECT id FROM stocktakes WHERE branch_id = $1 AND status = 'open'`, [branchId])).rows[0];
  return row ? getStocktake(client, row.id) : null;
}

export async function recordCounts(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof countsSchema>) {
  need(ctx, 'stocktake_count');
  const take = (await client.query('SELECT status, branch_id FROM stocktakes WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!take) throw new NotFoundError('That stock-take was not found.');
  if (ctx.branchId && take.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That stock-take belongs to a different branch.');
  if (take.status !== 'open') throw new ConflictError('That stock-take is no longer open.');
  let updated = 0;
  for (const count of input.counts) {
    const result = await client.query('UPDATE stocktake_lines SET counted_qty = $3 WHERE stocktake_id = $1 AND batch_id = $2', [id, count.batchId, count.countedQty]);
    if (result.rowCount === 0) throw new NotFoundError('A counted batch is not part of this stock-take.');
    updated += 1;
  }
  return { updated };
}

export async function cancelStocktake(client: PoolClient, ctx: Ctx, id: string) {
  need(ctx, 'stocktake_approve');
  const result = await client.query(`UPDATE stocktakes SET status = 'cancelled' WHERE id = $1 AND status = 'open' RETURNING branch_id`, [id]);
  if (result.rowCount === 0) throw new ConflictError('That stock-take is not open.');
  await audit(client, ctx, 'stocktake.cancel', 'stocktake', id, {}, result.rows[0].branch_id);
  return { id, status: 'cancelled' as const };
}

export async function approveStocktake(client: PoolClient, ctx: Ctx, id: string, input: z.infer<typeof approveSchema>) {
  need(ctx, 'stocktake_approve');
  const take = (await client.query('SELECT * FROM stocktakes WHERE id = $1 FOR UPDATE', [id])).rows[0];
  if (!take) throw new NotFoundError('That stock-take was not found.');
  if (ctx.branchId && take.branch_id !== ctx.branchId) throw new AppError(403, 'forbidden', 'That stock-take belongs to a different branch.');
  if (take.status !== 'open') throw new ConflictError('That stock-take is no longer open.');

  const lines = (
    await client.query(
      `SELECT l.batch_id, l.expected_qty, l.counted_qty, p.id AS product_id, p.category, p.gtin, p.name, b.batch_no, to_char(b.expiry_date, 'YYYY-MM-DD') AS exp, b.unit_cost_cents
         FROM stocktake_lines l JOIN stock_batches b ON b.id = l.batch_id JOIN products p ON p.id = b.product_id
        WHERE l.stocktake_id = $1 ORDER BY l.batch_id`,
      [id]
    )
  ).rows;
  const uncounted = lines.filter((l) => l.counted_qty === null);
  if (uncounted.length > 0 && !input.skipUncounted) {
    throw new AppError(422, 'uncounted', `${uncounted.length} batch(es) have not been counted yet, for example ${uncounted[0].name} batch ${uncounted[0].batch_no}.`);
  }
  const differing = lines.filter((l) => l.counted_qty !== null && l.counted_qty !== l.expected_qty);

  let witnessId: string | null = null;
  if (differing.some((l) => l.category === 'controlled')) {
    need(ctx, 'controlled');
    witnessId = await verifyWitness(client, ctx, input.witness as WitnessInput | undefined, normalisePhone);
  }

  let units = 0;
  let valueCents = 0;
  for (const line of differing) {
    const delta = (line.counted_qty as number) - (line.expected_qty as number);
    const batch = (await client.query('SELECT qty_on_hand FROM stock_batches WHERE id = $1 FOR UPDATE', [line.batch_id])).rows[0];
    const after = (batch.qty_on_hand as number) + delta;
    if (after < 0) throw new AppError(409, 'recount', `${line.name} batch ${line.batch_no}: sales since the count began mean the stock cannot drop that far. Count it again.`);
    await client.query('UPDATE stock_batches SET qty_on_hand = $2 WHERE id = $1', [line.batch_id, after]);
    await client.query(
      `INSERT INTO stock_movements (org_id, branch_id, product_id, batch_id, kind, qty_delta, unit_cost_cents, ref_type, ref_id, reason, actor_id)
       VALUES ($1, $2, $3, $4, 'stocktake_variance', $5, $6, 'stocktake', $7, $8, $9)`,
      [ctx.orgId, take.branch_id, line.product_id, line.batch_id, delta, line.unit_cost_cents, id, 'stock-take variance', ctx.userId]
    );
    await client.query(
      `INSERT INTO ntts_outbox (org_id, branch_id, event_type, product_id, gtin, batch_no, expiry_date, qty, ref_id) VALUES ($1, $2, 'adjustment', $3, $4, $5, $6, $7, $8)`,
      [ctx.orgId, take.branch_id, line.product_id, line.gtin, line.batch_no, line.exp, delta, id]
    );
    if (line.category === 'controlled') {
      await writeRegister(client, ctx, take.branch_id, line.product_id, 'adjustment', delta, witnessId!, { batchNo: line.batch_no, refType: 'stocktake', refId: id, reason: 'stock-take variance' });
    }
    units += delta;
    valueCents += delta * Number(line.unit_cost_cents);
  }
  await client.query(`UPDATE stocktakes SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [id, ctx.userId]);
  await audit(client, ctx, 'stocktake.approve', 'stocktake', id, { batchesAdjusted: differing.length, units, valueCents }, take.branch_id);
  return { id, status: 'approved' as const, batchesAdjusted: differing.length, netUnits: units, netValueCents: valueCents };
}

/**
 * Loan loss provisioning by ageing bucket.
 *
 * ILLUSTRATIVE, NOT REGULATORY GUIDANCE. The percentages are organisation settings with placeholder defaults; they are not
 * the CBK prudential classification, SASRA's provisioning rules or an IFRS 9 expected-credit-loss model. An accountant sets
 * the real ones and signs off the result.
 *
 * Exposure of a loan = unpaid principal + accrued, unpaid interest. Its bucket comes from its oldest unpaid overdue
 * instalment (the same ageing as the arrears report). The run compares what the buckets require with the credit balance of
 * the provision account and posts only the difference, so running it twice on one day posts nothing the second time.
 */
import { PoolClient } from 'pg';
import { Ctx, audit, getSettings } from '../common/context';
import { CODES } from '../ledger/chart';
import { accountBalance, postEntry, postingDateFor } from '../ledger/service';
import { POSITION_SQL, bucketSql } from '../reports/portfolio';
import { AGEING_BUCKETS, AgeingBucket } from './schedule';

export interface ProvisionBucket {
  bucket: AgeingBucket;
  loans: number;
  exposureCents: number;
  rateBp: number;
  requiredCents: number;
}

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

/** Required provision per bucket as at today (schedules keep no history, so ageing can only be measured now). */
export async function provisionRequirement(client: PoolClient, rates: Record<string, number>) {
  const now = await today(client);
  const rows = (await client.query(
    `SELECT ${bucketSql('p.days_overdue')} AS bucket, count(*)::int AS loans, COALESCE(sum(p.outstanding + p.accrued_interest), 0)::bigint AS exposure
       FROM (${POSITION_SQL}) p GROUP BY 1`,
    [now]
  )).rows;
  const byBucket = new Map(rows.map((r) => [r.bucket as string, r]));
  const buckets: ProvisionBucket[] = AGEING_BUCKETS.map((bucket) => {
    const exposure = Number(byBucket.get(bucket)?.exposure ?? 0);
    const rateBp = rates[bucket] ?? 0;
    // half-up rounding to the cent, in integers
    const required = Number((BigInt(exposure) * BigInt(rateBp) * 2n + 10_000n) / 20_000n);
    return { bucket, loans: Number(byBucket.get(bucket)?.loans ?? 0), exposureCents: exposure, rateBp, requiredCents: required };
  });
  return { asOf: now, buckets, requiredCents: buckets.reduce((s, b) => s + b.requiredCents, 0) };
}

export async function runProvisioning(client: PoolClient, ctx: Ctx) {
  const settings = await getSettings(client);
  const need = await provisionRequirement(client, settings.provisionRatesBp);
  const before = await accountBalance(client, CODES.loanLossProvision).then((n) => -n); // contra-asset: credit balance is the provision held
  const adjustment = need.requiredCents - before;
  let entry: { id: string; seq: number } | null = null;
  if (adjustment !== 0) {
    const amount = Math.abs(adjustment);
    entry = await postEntry(client, ctx.orgId, {
      entryDate: await postingDateFor(client, need.asOf),
      memo: `loan loss provision as at ${need.asOf} (${adjustment > 0 ? 'increase' : 'release'})`,
      sourceType: 'provision', sourceId: null, postedBy: ctx.userId,
      lines: adjustment > 0
        ? [{ accountCode: CODES.provisionExpense, debitCents: amount }, { accountCode: CODES.loanLossProvision, creditCents: amount }]
        : [{ accountCode: CODES.loanLossProvision, debitCents: amount }, { accountCode: CODES.provisionExpense, creditCents: amount }]
    });
  }
  await client.query(
    `INSERT INTO provision_runs (org_id, as_of, required_cents, before_cents, adjustment_cents, buckets, rates_bp, journal_entry_id, run_by)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [ctx.orgId, need.asOf, need.requiredCents, before, adjustment, JSON.stringify(need.buckets), JSON.stringify(settings.provisionRatesBp), entry?.id ?? null, ctx.userId]
  );
  await audit(client, ctx, 'loan.provision_run', 'loan', null, { asOf: need.asOf, requiredCents: need.requiredCents, adjustmentCents: adjustment });
  return {
    asOf: need.asOf, buckets: need.buckets, requiredCents: need.requiredCents, heldBeforeCents: before, adjustmentCents: adjustment, journalSeq: entry?.seq ?? null,
    notice: 'Illustrative percentages, NOT regulatory guidance. An accountant sets and signs off the provision.'
  };
}

export async function provisionHistory(client: PoolClient, limit: number) {
  const rows = (await client.query('SELECT * FROM provision_runs ORDER BY as_of DESC, created_at DESC LIMIT $1', [limit])).rows;
  return rows.map((r) => ({
    id: r.id, asOf: r.as_of, requiredCents: Number(r.required_cents), heldBeforeCents: Number(r.before_cents), adjustmentCents: Number(r.adjustment_cents),
    buckets: r.buckets, createdAt: r.created_at
  }));
}

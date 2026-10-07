/**
 * Portfolio quality: outstanding principal, arrears and portfolio at risk (PAR), computed from the repayment schedules.
 *
 * Schedules hold what has been paid so far, not what had been paid on some earlier day, so these figures are always
 * "as at now". Asking for a past date would give a wrong answer dressed as a right one, so `asOf` must be today.
 *
 *   PAR n = outstanding principal of loans whose oldest unpaid instalment is more than n days overdue
 *           / outstanding principal of all loans being repaid
 */
import { PoolClient } from 'pg';
import { AGEING_BUCKETS, AgeingBucket, bucketFor } from '../loans/schedule';

export interface ArrearsRow {
  loanId: string;
  loanNo: string;
  memberNo: string;
  memberName: string;
  phone: string | null;
  outstandingPrincipalCents: number;
  overduePrincipalCents: number;
  overdueInterestCents: number;
  overduePenaltyCents: number;
  daysOverdue: number;
  bucket: AgeingBucket;
}

async function today(client: PoolClient): Promise<string> {
  return (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
}

/**
 * One row per loan being repaid, aggregated in the database: outstanding principal, what is overdue as at $1, and the oldest
 * unpaid overdue instalment. Nothing is read into memory per instalment.
 */
export const POSITION_SQL = `
  SELECT l.id AS loan_id, l.loan_no, l.loan_seq, l.member_id,
         COALESCE(sum(s.principal_cents - s.paid_principal_cents), 0)::bigint AS outstanding,
         COALESCE(sum(s.principal_cents - s.paid_principal_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_principal,
         COALESCE(sum(s.interest_cents - s.paid_interest_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_interest,
         COALESCE(sum(s.penalty_cents - s.paid_penalty_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_penalty,
         COALESCE(sum(s.interest_cents - s.paid_interest_cents) FILTER (WHERE s.interest_accrued_on IS NOT NULL), 0)::bigint AS accrued_interest,
         COALESCE($1::date - min(s.due_date) FILTER (WHERE s.due_date < $1::date
               AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) + (s.penalty_cents - s.paid_penalty_cents) > 0), 0)::int AS days_overdue
    FROM loans l JOIN loan_schedule s ON s.loan_id = l.id
   WHERE l.status = 'disbursed' GROUP BY l.id, l.loan_no, l.loan_seq, l.member_id`;

/** SQL for the ageing bucket of a days-overdue expression; the same boundaries as bucketFor in loans/schedule.ts. */
export const bucketSql = (days: string) =>
  `CASE WHEN ${days} <= 0 THEN 'current' WHEN ${days} <= 30 THEN '1-30' WHEN ${days} <= 60 THEN '31-60' WHEN ${days} <= 90 THEN '61-90' WHEN ${days} <= 180 THEN '91-180' ELSE '180+' END`;

function toRow(r: Record<string, any>): ArrearsRow {
  const days = Number(r.days_overdue);
  return {
    loanId: r.loan_id, loanNo: r.loan_no, memberNo: r.member_no, memberName: r.full_name, phone: r.phone,
    outstandingPrincipalCents: Number(r.outstanding), overduePrincipalCents: Number(r.od_principal), overdueInterestCents: Number(r.od_interest),
    overduePenaltyCents: Number(r.od_penalty), daysOverdue: days, bucket: bucketFor(days)
  };
}

export interface PortfolioSummary {
  asOf: string;
  loansBeingRepaid: number;
  outstandingPrincipalCents: number;
  buckets: Array<{ bucket: AgeingBucket; loans: number; outstandingPrincipalCents: number }>;
  par: Array<{ days: number; amountCents: number; percent: number }>;
}

export async function portfolioSummary(client: PoolClient, asOf?: string): Promise<PortfolioSummary> {
  const now = await today(client);
  if (asOf && asOf !== now) throw new Error('Portfolio figures are as at today only: schedules do not keep history.');
  const rows = (await client.query(
    `SELECT ${bucketSql('p.days_overdue')} AS bucket, count(*)::int AS loans, COALESCE(sum(p.outstanding), 0)::bigint AS outstanding,
            COALESCE(sum(p.outstanding) FILTER (WHERE p.days_overdue > 1), 0)::bigint AS par1,
            COALESCE(sum(p.outstanding) FILTER (WHERE p.days_overdue > 30), 0)::bigint AS par30,
            COALESCE(sum(p.outstanding) FILTER (WHERE p.days_overdue > 60), 0)::bigint AS par60,
            COALESCE(sum(p.outstanding) FILTER (WHERE p.days_overdue > 90), 0)::bigint AS par90
       FROM (${POSITION_SQL}) p GROUP BY 1`,
    [now]
  )).rows;
  const byBucket = new Map(rows.map((r) => [r.bucket as string, r]));
  const total = rows.reduce((s, r) => s + Number(r.outstanding), 0);
  const buckets = AGEING_BUCKETS.map((bucket) => ({ bucket, loans: Number(byBucket.get(bucket)?.loans ?? 0), outstandingPrincipalCents: Number(byBucket.get(bucket)?.outstanding ?? 0) }));
  const par = ([[1, 'par1'], [30, 'par30'], [60, 'par60'], [90, 'par90']] as const).map(([days, key]) => {
    const amount = rows.reduce((s, r) => s + Number(r[key]), 0);
    return { days, amountCents: amount, percent: total > 0 ? Math.round((amount / total) * 10_000) / 100 : 0 };
  });
  return { asOf: now, loansBeingRepaid: buckets.reduce((s, b) => s + b.loans, 0), outstandingPrincipalCents: total, buckets, par };
}

/** Outstanding principal of loans more than `days` overdue (PAR numerator), for the returns engine. */
export async function parAmount(client: PoolClient, days: number): Promise<number> {
  const now = await today(client);
  const { rows } = await client.query(`SELECT COALESCE(sum(p.outstanding), 0)::bigint AS n FROM (${POSITION_SQL}) p WHERE p.days_overdue > $2`, [now, days]);
  return Number(rows[0].n);
}

/** Arrears list, worst first, paged by offset for the screen. */
export async function arrearsList(client: PoolClient, opts: { minDays: number; limit: number; offset: number }) {
  const now = await today(client);
  const min = Math.max(1, opts.minDays);
  const { rows } = await client.query(
    `SELECT p.*, m.member_no, m.full_name, m.phone, count(*) OVER ()::int AS total
       FROM (${POSITION_SQL}) p JOIN members m ON m.id = p.member_id
      WHERE p.days_overdue >= $2 ORDER BY p.days_overdue DESC, p.od_principal DESC, p.loan_seq LIMIT $3 OFFSET $4`,
    [now, min, opts.limit, opts.offset]
  );
  let total = rows.length > 0 ? Number(rows[0].total) : 0;
  if (rows.length === 0 && opts.offset > 0) {
    total = Number((await client.query(`SELECT count(*)::int AS n FROM (${POSITION_SQL}) p WHERE p.days_overdue >= $2`, [now, min])).rows[0].n);
  }
  return { asOf: now, total, items: rows.map(toRow) };
}

/**
 * Every arrears row, in pages of `pageSize` by keyset (worst first, then loan number), so a CSV of any size is produced with
 * memory bounded by one page. The caller gets each page as it is read.
 */
export async function eachArrearsPage(client: PoolClient, pageSize: number, onPage: (rows: ArrearsRow[]) => Promise<void>): Promise<number> {
  const now = await today(client);
  let after: { days: number; seq: number } | null = null;
  let count = 0;
  for (;;) {
    const params: unknown[] = [now, pageSize];
    let cursor = '';
    if (after) {
      params.push(after.days, after.seq);
      cursor = 'AND (p.days_overdue < $3 OR (p.days_overdue = $3 AND p.loan_seq > $4))';
    }
    const rows = (await client.query(
      `SELECT p.*, m.member_no, m.full_name, m.phone FROM (${POSITION_SQL}) p JOIN members m ON m.id = p.member_id
        WHERE p.days_overdue >= 1 ${cursor} ORDER BY p.days_overdue DESC, p.loan_seq LIMIT $2`,
      params
    )).rows;
    if (rows.length === 0) return count;
    await onPage(rows.map(toRow));
    count += rows.length;
    const last = rows[rows.length - 1]!;
    after = { days: Number(last.days_overdue), seq: Number(last.loan_seq) };
    if (rows.length < pageSize) return count;
  }
}

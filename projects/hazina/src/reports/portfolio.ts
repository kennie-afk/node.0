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

/** One row per loan being repaid, with what is overdue and for how long. */
async function loanPositions(client: PoolClient, asOf: string): Promise<ArrearsRow[]> {
  const { rows } = await client.query(
    `SELECT l.id, l.loan_no, m.member_no, m.full_name, m.phone,
            COALESCE(sum(s.principal_cents - s.paid_principal_cents), 0)::bigint AS outstanding,
            COALESCE(sum(s.principal_cents - s.paid_principal_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_principal,
            COALESCE(sum(s.interest_cents - s.paid_interest_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_interest,
            COALESCE(sum(s.penalty_cents - s.paid_penalty_cents) FILTER (WHERE s.due_date < $1::date), 0)::bigint AS od_penalty,
            min(s.due_date) FILTER (WHERE s.due_date < $1::date
                  AND (s.principal_cents - s.paid_principal_cents) + (s.interest_cents - s.paid_interest_cents) + (s.penalty_cents - s.paid_penalty_cents) > 0) AS oldest
       FROM loans l JOIN members m ON m.id = l.member_id JOIN loan_schedule s ON s.loan_id = l.id
      WHERE l.status = 'disbursed' GROUP BY l.id, l.loan_no, m.member_no, m.full_name, m.phone ORDER BY l.loan_no`,
    [asOf]
  );
  const asOfMs = new Date(`${asOf}T00:00:00Z`).getTime();
  return rows.map((r) => {
    const days = r.oldest ? Math.round((asOfMs - new Date(`${r.oldest}T00:00:00Z`).getTime()) / 86_400_000) : 0;
    return {
      loanId: r.id, loanNo: r.loan_no, memberNo: r.member_no, memberName: r.full_name, phone: r.phone,
      outstandingPrincipalCents: Number(r.outstanding), overduePrincipalCents: Number(r.od_principal), overdueInterestCents: Number(r.od_interest),
      overduePenaltyCents: Number(r.od_penalty), daysOverdue: days, bucket: bucketFor(days)
    };
  });
}

export interface PortfolioSummary {
  asOf: string;
  loansBeingRepaid: number;
  outstandingPrincipalCents: number;
  buckets: Array<{ bucket: AgeingBucket; loans: number; outstandingPrincipalCents: number }>;
  par: Array<{ days: number; amountCents: number; percent: number }>;
}

export async function portfolioSummary(client: PoolClient, asOf?: string): Promise<PortfolioSummary & { positions: ArrearsRow[] }> {
  const now = await today(client);
  if (asOf && asOf !== now) throw new Error('Portfolio figures are as at today only: schedules do not keep history.');
  const positions = await loanPositions(client, now);
  const total = positions.reduce((s, p) => s + p.outstandingPrincipalCents, 0);
  const buckets = AGEING_BUCKETS.map((bucket) => {
    const inBucket = positions.filter((p) => p.bucket === bucket);
    return { bucket, loans: inBucket.length, outstandingPrincipalCents: inBucket.reduce((s, p) => s + p.outstandingPrincipalCents, 0) };
  });
  const par = [1, 30, 60, 90].map((days) => {
    const amount = positions.filter((p) => p.daysOverdue > days).reduce((s, p) => s + p.outstandingPrincipalCents, 0);
    return { days, amountCents: amount, percent: total > 0 ? Math.round((amount / total) * 10_000) / 100 : 0 };
  });
  return { asOf: now, loansBeingRepaid: positions.length, outstandingPrincipalCents: total, buckets, par, positions };
}

/** Arrears list, worst first, with keyset-free paging by offset (arrears lists are short next to the member book). */
export async function arrearsList(client: PoolClient, opts: { minDays: number; limit: number; offset: number }) {
  const now = await today(client);
  const all = (await loanPositions(client, now)).filter((p) => p.daysOverdue >= Math.max(1, opts.minDays)).sort((a, b) => b.daysOverdue - a.daysOverdue || b.overduePrincipalCents - a.overduePrincipalCents);
  return { asOf: now, total: all.length, items: all.slice(opts.offset, opts.offset + opts.limit) };
}

/**
 * Savings interest and share dividends, one run per kind per period end.
 *
 *   savings_interest  Dr Interest on member savings (expense)   Cr member savings      for each member
 *   share_dividend    Dr Accumulated surplus (equity)            Cr member savings      for each member (credited to savings)
 *
 * The rate is an annual percentage in basis points applied to the member's balance AT the period end, not to an average over
 * the year: a deliberately simple scheme, stated here so nobody mistakes it for an average-balance computation. Which rate a
 * SACCO declares, and whether its members vote on it, are its own decisions; nothing here is a statutory rate. One journal
 * entry per member, posted in bulk. The unique key (kind, period end) makes a repeat run a no-op.
 */
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError, ConflictError } from '../domain/errors';
import { Ctx, audit, orgInfo } from '../common/context';
import { CODES } from '../ledger/chart';
import { postEntries, postingDateFor } from '../ledger/service';

export const dividendSchema = z.object({
  kind: z.enum(['savings_interest', 'share_dividend']),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rateBp: z.number().int().min(1).max(100_000)
});

export async function runDividend(client: PoolClient, ctx: Ctx, input: z.infer<typeof dividendSchema>) {
  const org = await orgInfo(client);
  if (org.kind !== 'sacco') throw new ConflictError('Only a SACCO has member savings and shares.');
  const today = (await client.query(`SELECT to_char((now() AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS d`)).rows[0].d as string;
  if (input.periodEnd > today) throw new BadRequestError('The period has not ended.');

  const prior = (await client.query('SELECT * FROM dividend_runs WHERE kind = $1 AND period_end = $2', [input.kind, input.periodEnd])).rows[0];
  if (prior) return { id: prior.id as string, duplicate: true, members: Number(prior.members), totalCents: Number(prior.total_cents), rateBp: Number(prior.rate_bp) };

  const sourceAccount = input.kind === 'savings_interest' ? CODES.savings : CODES.shares;
  const debitAccount = input.kind === 'savings_interest' ? CODES.savingsInterestExpense : CODES.retained;
  const balances = (await client.query(
    `SELECT l.member_id, m.member_no, (sum(l.credit_cents) - sum(l.debit_cents))::bigint AS bal
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id AND a.code = $1
       JOIN members m ON m.id = l.member_id AND m.status <> 'exited'
      WHERE e.entry_date <= $2::date AND l.member_id IS NOT NULL
      GROUP BY l.member_id, m.member_no HAVING sum(l.credit_cents) - sum(l.debit_cents) > 0 ORDER BY m.member_no`,
    [sourceAccount, input.periodEnd]
  )).rows;
  // half-up to the cent, in integers
  const shares = balances.map((r) => ({ memberId: r.member_id as string, memberNo: r.member_no as string, cents: Number((BigInt(r.bal) * BigInt(input.rateBp) * 2n + 10_000n) / 20_000n) })).filter((r) => r.cents > 0);
  const total = shares.reduce((s, r) => s + r.cents, 0);

  const run = (await client.query(
    `INSERT INTO dividend_runs (org_id, kind, period_end, rate_bp, members, total_cents, run_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [ctx.orgId, input.kind, input.periodEnd, input.rateBp, shares.length, total, ctx.userId]
  )).rows[0];
  if (shares.length > 0) {
    const date = await postingDateFor(client, today);
    const label = input.kind === 'savings_interest' ? 'savings interest' : 'share dividend';
    const txnIds = shares.map(() => randomUUID());
    const posted = await postEntries(client, ctx.orgId, shares.map((r, i) => ({
      entryDate: date, memo: `${label} ${input.periodEnd} ${r.memberNo} at ${input.rateBp / 100}%`, sourceType: input.kind, sourceId: txnIds[i]!, postedBy: ctx.userId,
      lines: [
        { accountCode: debitAccount, debitCents: r.cents },
        { accountCode: CODES.savings, creditCents: r.cents, memberId: r.memberId }
      ]
    })));
    // the member's savings statement is built from these rows, so the credit must appear there as well as in the ledger
    await client.query(
      `INSERT INTO savings_txns (id, org_id, member_id, product, kind, amount_cents, channel, reference, status, requested_by, occurred_on, journal_entry_id)
       SELECT t.id, $1, t.member_id, 'savings', 'deposit', t.amount, 'transfer', $2, 'posted', $3, $4::date, t.entry_id
         FROM unnest($5::uuid[], $6::uuid[], $7::bigint[], $8::uuid[]) AS t(id, member_id, amount, entry_id)`,
      [ctx.orgId, `${input.kind === 'savings_interest' ? 'INT' : 'DIV'}-${input.periodEnd}`, ctx.userId, date, txnIds, shares.map((r) => r.memberId), shares.map((r) => r.cents), posted.map((p) => p.id)]
    );
  }
  await audit(client, ctx, `dividend.${input.kind}`, 'dividend_run', run.id, { periodEnd: input.periodEnd, rateBp: input.rateBp, members: shares.length, totalCents: total });
  return { id: run.id as string, duplicate: false, members: shares.length, totalCents: total, rateBp: input.rateBp };
}

export async function listDividendRuns(client: PoolClient) {
  const rows = (await client.query('SELECT * FROM dividend_runs ORDER BY period_end DESC, created_at DESC LIMIT 50')).rows;
  return rows.map((r) => ({ id: r.id, kind: r.kind, periodEnd: r.period_end, rateBp: Number(r.rate_bp), members: Number(r.members), totalCents: Number(r.total_cents), createdAt: r.created_at }));
}

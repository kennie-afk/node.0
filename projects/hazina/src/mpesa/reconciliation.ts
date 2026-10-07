/**
 * M-Pesa reconciliation: what was received, what was applied, what is still sitting in suspense, by day, checked against the
 * ledger; and a comparison of a paybill statement against what Hazina recorded, matched by M-Pesa transaction id.
 *
 * UNVERIFIED against a real Safaricom paybill statement: the CSV is read by header names (see intake/statement.ts) and no
 * real file has been seen. Nothing in the comparison posts anything; it reports differences for a person to act on.
 */
import { PoolClient } from 'pg';
import { z } from 'zod';
import { BadRequestError } from '../domain/errors';
import { CODES } from '../ledger/chart';
import { accountBalance } from '../ledger/service';
import { StatementFormatError, parseStatementCsv } from '../intake/statement';

const day = /^\d{4}-\d{2}-\d{2}$/;

export async function reconciliationReport(client: PoolClient, from: string, to: string) {
  if (!day.test(from) || !day.test(to) || to < from) throw new BadRequestError('Give a period as from and to (YYYY-MM-DD).');
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) throw new BadRequestError('At most a year at a time.');
  const days = (await client.query(
    `SELECT to_char((received_at AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS day,
            count(*)::int AS received_count, COALESCE(sum(amount_cents), 0)::bigint AS received,
            COALESCE(sum(amount_cents) FILTER (WHERE status IN ('applied', 'assigned')), 0)::bigint AS applied,
            COALESCE(sum(amount_cents) FILTER (WHERE status = 'unmatched'), 0)::bigint AS unmatched,
            COALESCE(sum(amount_cents) FILTER (WHERE status = 'ignored'), 0)::bigint AS ignored
       FROM mpesa_payments WHERE (received_at AT TIME ZONE 'Africa/Nairobi')::date BETWEEN $1::date AND $2::date GROUP BY 1 ORDER BY 1`,
    [from, to]
  )).rows.map((r) => ({
    day: r.day as string, count: Number(r.received_count), receivedCents: Number(r.received), appliedCents: Number(r.applied), unmatchedCents: Number(r.unmatched), ignoredCents: Number(r.ignored)
  }));
  const totals = days.reduce((t, d) => ({
    count: t.count + d.count, receivedCents: t.receivedCents + d.receivedCents, appliedCents: t.appliedCents + d.appliedCents, unmatchedCents: t.unmatchedCents + d.unmatchedCents, ignoredCents: t.ignoredCents + d.ignoredCents
  }), { count: 0, receivedCents: 0, appliedCents: 0, unmatchedCents: 0, ignoredCents: 0 });

  // The standing check, over all time: the suspense account in the ledger must equal the payments not yet applied that were
  // booked to it. Anything else means a payment or an entry is missing.
  const open = (await client.query(
    `SELECT COALESCE(sum(amount_cents), 0)::bigint AS n, count(*)::int AS c FROM mpesa_payments WHERE status IN ('unmatched', 'ignored') AND receipt_entry_id IS NOT NULL`
  )).rows[0];
  const legacy = Number((await client.query(`SELECT count(*)::int AS n FROM mpesa_payments WHERE status IN ('unmatched', 'ignored') AND receipt_entry_id IS NULL`)).rows[0].n);
  const ledgerSuspense = await accountBalance(client, CODES.mpesaSuspense);
  return {
    from, to, days, totals,
    suspense: { ledgerCents: ledgerSuspense, paymentsCents: Number(open.n), paymentsCount: Number(open.c), differenceCents: ledgerSuspense - Number(open.n), unmatchedBeforeSuspenseCount: legacy }
  };
}

export const statementSchema = z.object({ contentBase64: z.string().min(8) });
const LIMIT = 20_000;

export async function compareStatement(client: PoolClient, input: z.infer<typeof statementSchema>) {
  const text = Buffer.from(input.contentBase64, 'base64').toString('utf8');
  let txns;
  try {
    txns = parseStatementCsv(text);
  } catch (error) {
    if (error instanceof StatementFormatError) throw new BadRequestError(error.message);
    throw error;
  }
  const receipts = txns.filter((t) => t.paidInCents > 0 && t.receiptNo && (!t.status || /completed/i.test(t.status)));
  if (receipts.length > LIMIT) throw new BadRequestError(`At most ${LIMIT} received payments per statement.`);
  const ids = receipts.map((t) => t.receiptNo!);
  const known = (await client.query('SELECT external_ref, amount_cents, status FROM mpesa_payments WHERE external_ref = ANY($1::text[])', [ids])).rows;
  const byRef = new Map(known.map((r) => [r.external_ref as string, r]));

  const matched: string[] = [];
  const amountDiffers: Array<{ receiptNo: string; statementCents: number; hazinaCents: number }> = [];
  const missingInHazina: Array<{ receiptNo: string; amountCents: number; completedAt: string; details: string }> = [];
  for (const t of receipts) {
    const mine = byRef.get(t.receiptNo!);
    if (!mine) missingInHazina.push({ receiptNo: t.receiptNo!, amountCents: t.paidInCents, completedAt: t.completedAt.toISOString(), details: t.details.slice(0, 120) });
    else if (Number(mine.amount_cents) !== t.paidInCents) amountDiffers.push({ receiptNo: t.receiptNo!, statementCents: t.paidInCents, hazinaCents: Number(mine.amount_cents) });
    else matched.push(t.receiptNo!);
  }
  // payments Hazina has inside the statement's own time span that the statement does not list
  let notInStatement: Array<{ receiptNo: string; amountCents: number; receivedAt: Date }> = [];
  if (receipts.length > 0) {
    const times = receipts.map((t) => t.completedAt.getTime());
    const rows = (await client.query(
      `SELECT external_ref, amount_cents, received_at FROM mpesa_payments WHERE received_at BETWEEN $1 AND $2 AND NOT (external_ref = ANY($3::text[])) ORDER BY received_at LIMIT 500`,
      [new Date(Math.min(...times)), new Date(Math.max(...times)), ids]
    )).rows;
    notInStatement = rows.map((r) => ({ receiptNo: r.external_ref as string, amountCents: Number(r.amount_cents), receivedAt: r.received_at as Date }));
  }
  return {
    statementReceipts: receipts.length,
    matchedCount: matched.length,
    amountDiffers: amountDiffers.slice(0, 500), amountDiffersCount: amountDiffers.length,
    missingInHazina: missingInHazina.slice(0, 500), missingInHazinaCount: missingInHazina.length,
    notInStatement,
    notice: 'Unverified against a real Safaricom statement. Differences are for a person to investigate; nothing was posted.'
  };
}

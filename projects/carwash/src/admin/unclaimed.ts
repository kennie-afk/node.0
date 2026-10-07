/**
 * Operator tools for money that arrived on a till nobody had registered (mpesa_unclaimed). Tenants cannot
 * read that table by design, so everything here runs as the migration role. Assigning is idempotent: the
 * payment insert is unique on the M-Pesa transaction id, and the claim mark is only written after it.
 */
import { withMigrator, withOrg } from '../persistence/pool';
import { ConflictError, NotFoundError } from '../domain/errors';
import { recordTillPayment, IngestOutcome } from '../mpesa/service';
import { cents } from '../domain/money';

export interface UnclaimedRow {
  id: string;
  shortCode: string;
  externalRef: string;
  amountCents: number;
  payerMsisdn: string | null;
  billRef: string | null;
  receivedAt: Date;
}

export async function listUnclaimed(includeClaimed = false): Promise<UnclaimedRow[]> {
  return withMigrator(async (client) => {
    const { rows } = await client.query(
      `SELECT id, short_code, external_ref, amount_cents, payer_msisdn, bill_ref, received_at
         FROM mpesa_unclaimed WHERE ($1 OR claimed_at IS NULL) ORDER BY received_at LIMIT 500`,
      [includeClaimed]
    );
    return rows.map((row) => ({
      id: row.id,
      shortCode: row.short_code,
      externalRef: row.external_ref,
      amountCents: Number(row.amount_cents),
      payerMsisdn: row.payer_msisdn,
      billRef: row.bill_ref,
      receivedAt: row.received_at
    }));
  });
}

export interface AssignResult {
  externalRef: string;
  orgId: string;
  siteId: string;
  paymentId: string;
  matchedJobId: string | null;
  alreadyAssigned: boolean;
}

export async function assignUnclaimed(externalRef: string, orgId: string, siteId?: string): Promise<AssignResult> {
  const row = await withMigrator(async (client) => (await client.query('SELECT * FROM mpesa_unclaimed WHERE external_ref = $1', [externalRef])).rows[0]);
  if (!row) throw new NotFoundError(`no unclaimed payment with reference ${externalRef}`);
  if (row.claimed_at && row.claimed_by_org !== orgId) {
    throw new ConflictError(`${externalRef} was already assigned to organisation ${row.claimed_by_org}`);
  }

  // the site is the one holding the till the money was paid to; failing that the one named; failing that the only one
  const target = await withOrg(orgId, async (client) => {
    if (siteId) return (await client.query('SELECT id FROM sites WHERE id = $1', [siteId])).rows[0];
    const byTill = await client.query('SELECT id FROM sites WHERE till_number = $1', [row.short_code]);
    if (byTill.rows[0]) return byTill.rows[0];
    const all = await client.query('SELECT id FROM sites ORDER BY created_at LIMIT 2');
    return all.rows.length === 1 ? all.rows[0] : undefined;
  });
  if (!target) {
    throw new ConflictError(`organisation ${orgId} has no site with till ${row.short_code}; pass a site id to choose one`);
  }

  const outcome: IngestOutcome = await recordTillPayment(
    { orgId, siteId: target.id },
    {
      externalRef: row.external_ref,
      amountCents: cents(Number(row.amount_cents)),
      payerMsisdn: row.payer_msisdn ?? '',
      receivedAt: row.received_at,
      shortCode: row.short_code,
      reference: row.bill_ref ?? ''
    }
  );
  if (!outcome.paymentId) {
    // the unique key (channel, transaction id) is global: it already exists, but in an organisation we cannot see
    throw new ConflictError(`${externalRef} is already recorded under another organisation`);
  }

  await withMigrator((client) =>
    client.query('UPDATE mpesa_unclaimed SET claimed_by_org = $2, claimed_at = now() WHERE external_ref = $1 AND claimed_at IS NULL', [externalRef, orgId])
  );

  return { externalRef, orgId, siteId: target.id, paymentId: outcome.paymentId, matchedJobId: outcome.matchedJobId, alreadyAssigned: outcome.duplicate };
}

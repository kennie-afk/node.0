/**
 * Operator tools for money that reached a till nobody had registered (mpesa_unclaimed). The application role can only add
 * rows there, so reading and assigning them is done as the migration role, from the operator CLI.
 */
import { withMigrator, withOrg } from '../persistence/pool';
import { applyMpesaConfirmation } from '../sales/service';
import { BadRequestError, ConflictError, NotFoundError } from '../domain/errors';

export interface UnclaimedRow {
  externalRef: string;
  shortCode: string;
  amountCents: number;
  payerMsisdn: string | null;
  billRef: string | null;
  receivedAt: Date;
  claimedByOrg: string | null;
}

export async function listUnclaimed(opts: { includeClaimed?: boolean; limit?: number } = {}): Promise<UnclaimedRow[]> {
  return withMigrator(async (client) => {
    const rows = (
      await client.query(
        `SELECT external_ref, short_code, amount_cents, payer_msisdn, bill_ref, received_at, claimed_by_org FROM mpesa_unclaimed
          WHERE ($1::boolean OR claimed_at IS NULL) ORDER BY received_at DESC LIMIT $2`,
        [opts.includeClaimed === true, Math.min(opts.limit ?? 200, 1000)]
      )
    ).rows;
    return rows.map((r) => ({ externalRef: r.external_ref, shortCode: r.short_code, amountCents: Number(r.amount_cents), payerMsisdn: r.payer_msisdn, billRef: r.bill_ref, receivedAt: r.received_at, claimedByOrg: r.claimed_by_org }));
  });
}

export interface AssignOutcome {
  alreadyAssigned: boolean;
  branchId: string;
  /** matched to a pending sale straight away; otherwise it now waits in that branch's unmatched list for a manager */
  matchedSaleId: string | null;
}

/**
 * Moves one held payment into an organisation's till as a normal confirmation: it is matched to a pending sale if one
 * fits, and otherwise lands in the branch's unmatched list for the manager to assign. Safe to run twice: the M-Pesa
 * transaction id is unique, so the second run changes nothing; and it refuses to give a payment already given to a
 * different organisation.
 */
export async function assignUnclaimed(externalRef: string, orgId: string, branchId?: string): Promise<AssignOutcome> {
  const ref = externalRef.toUpperCase();
  const row = await withMigrator(async (client) => (await client.query('SELECT * FROM mpesa_unclaimed WHERE external_ref = $1', [ref])).rows[0]);
  if (!row) throw new NotFoundError(`no unclaimed payment ${ref}`);
  if (row.claimed_by_org && row.claimed_by_org !== orgId) throw new ConflictError(`that payment was already assigned to a different organisation (${row.claimed_by_org})`);

  const outcome = await withOrg(orgId, async (client) => {
    const branches = (await client.query('SELECT id, till_number FROM branches WHERE NOT archived AND NOT is_demo ORDER BY created_at')).rows;
    if (branches.length === 0) throw new NotFoundError('that organisation has no branch');
    let chosen = branchId ? branches.find((b) => b.id === branchId) : branches.find((b) => b.till_number === row.short_code) ?? (branches.length === 1 ? branches[0] : undefined);
    if (!chosen) throw new BadRequestError(branchId ? 'that branch does not belong to this organisation' : 'this organisation has several branches and none has that till: say which branch id to use');
    const applied = await applyMpesaConfirmation(client, orgId, chosen.id, {
      externalRef: ref,
      amountCents: Number(row.amount_cents),
      payerMsisdn: row.payer_msisdn ?? '',
      receivedAt: row.received_at,
      reference: row.bill_ref ?? ''
    });
    return { branchId: chosen.id as string, ...applied };
  });
  await withMigrator((client) => client.query('UPDATE mpesa_unclaimed SET claimed_by_org = $2, claimed_at = COALESCE(claimed_at, now()) WHERE external_ref = $1', [ref, orgId]));
  return { alreadyAssigned: outcome.duplicate, branchId: outcome.branchId, matchedSaleId: outcome.saleId };
}

/**
 * Counting batches: the offering-plate workflow with dual control. One person opens a batch and
 * records the gifts, counts the cash and declares a total; a DIFFERENT person verifies, and only
 * then do the gifts receive receipt numbers and enter the ledger, as one aggregated entry.
 */
import { Transaction } from 'sequelize';
import { exec, forUpdate, select, selectOne } from '../finance/sql';
import { nextCounter } from '../finance/chain';
import { loadSettings } from '../finance/setup.service';
import { postEntry, PostLine } from '../finance/ledger.service';
import { recordAudit } from '../finance/audit.service';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors';
import { allocateReceiptNo, depositAccountFor, normaliseDate, recordContribution, RecordInput } from './contributions.service';
import { syncPledgeStatus } from './pledges.service';
import { dateOnly, insertReturningId, minorOf } from './shared';

const CENTS = `CAST(ROUND(c.amount * 100) AS BIGINT)`;

async function totals(t: Transaction, churchId: number, batchId: number) {
  const row = await selectOne<any>(
    t,
    `SELECT COUNT(*) AS n, COALESCE(SUM(${CENTS}), 0) AS total FROM contribution c WHERE c.church_id = :churchId AND c.batch_id = :batchId AND c.status <> 'VOID'`,
    { churchId, batchId }
  );
  return { count: toInt(row?.n), totalMinor: toInt(row?.total) };
}

async function dto(t: Transaction, churchId: number, row: any) {
  const { count, totalMinor } = await totals(t, churchId, toInt(row.id));
  const counted = row.counted_total_minor === null ? null : toInt(row.counted_total_minor);
  const nullable = (v: unknown) => (v === null || v === undefined ? null : toInt(v));
  return {
    id: toInt(row.id),
    batchNo: toInt(row.batch_no),
    name: row.name,
    serviceDate: dateOnly(row.service_date),
    status: row.status,
    depositAccountId: toInt(row.deposit_account_id),
    createdBy: toInt(row.created_by),
    countedBy: nullable(row.counted_by),
    verifiedBy: nullable(row.verified_by),
    countedAt: row.counted_at ? new Date(row.counted_at).toISOString() : null,
    postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
    journalEntryId: nullable(row.journal_entry_id),
    itemCount: count,
    itemsTotal: fromMinor(totalMinor),
    itemsTotalMinor: totalMinor,
    countedTotal: counted === null ? null : fromMinor(counted),
    variance: counted === null ? null : fromMinor(counted - totalMinor),
    varianceMinor: counted === null ? null : counted - totalMinor
  };
}

async function load(t: Transaction, churchId: number, id: number, lock = false) {
  const row = await selectOne<any>(t, `SELECT * FROM giving_batches WHERE church_id = :churchId AND id = :id ${lock ? forUpdate() : ''}`, { churchId, id });
  if (!row) throw new NotFoundError(`batch ${id} was not found`);
  return row;
}

export async function createBatch(t: Transaction, churchId: number, actorId: number, input: { name: string; serviceDate: string; depositAccountId?: number | null }) {
  const deposit = await depositAccountFor(t, churchId, 'cash', input.depositAccountId);
  const batchNo = await nextCounter(t, churchId, 'giving_batch');
  const id = await insertReturningId(
    t,
    `INSERT INTO giving_batches (church_id, batch_no, name, service_date, deposit_account_id, created_by, created_at, updated_at)
     VALUES (:churchId, :batchNo, :name, :date, :deposit, :actor, :now, :now)`,
    { churchId, batchNo, name: input.name, date: normaliseDate(input.serviceDate), deposit, actor: actorId, now: new Date() }
  );
  await recordAudit(t, churchId, { action: 'giving_batch.open', entityType: 'giving_batch', entityId: id, actorId, data: { batchNo } });
  return getBatch(t, churchId, id);
}

export async function getBatch(t: Transaction, churchId: number, id: number) {
  return dto(t, churchId, await load(t, churchId, id));
}

export async function listBatches(t: Transaction, churchId: number, filter: { status?: string }, limit: number, cursor?: string) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  const c = decodeCursor<{ id: number }>(cursor);
  if (c) {
    where.push('id < ?');
    params.push(c.id);
  }
  const rows = await select<any>(t, `SELECT * FROM giving_batches WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, limit + 1]);
  const page = toKeysetPage(rows, limit, (r: any) => ({ id: toInt(r.id) }));
  return { data: await Promise.all(page.data.map((r) => dto(t, churchId, r))), nextCursor: page.nextCursor, limit };
}

export async function batchItems(t: Transaction, churchId: number, id: number) {
  await load(t, churchId, id);
  const rows = await select<any>(
    t,
    `SELECT c.id, c.member_id, c.contributor_name, c.amount, c.contribution_type, c.payment_method, c.status, c.receipt_no, m.first_name, m.last_name
       FROM contribution c LEFT JOIN members m ON m.church_id = c.church_id AND m.id = c.member_id
      WHERE c.church_id = :churchId AND c.batch_id = :id ORDER BY c.id`,
    { churchId, id }
  );
  return rows.map((r) => ({
    id: toInt(r.id),
    memberId: r.member_id === null ? null : toInt(r.member_id),
    memberName: r.first_name ? `${r.first_name} ${r.last_name}` : r.contributor_name,
    amount: fromMinor(minorOf(r.amount)),
    contributionType: r.contribution_type,
    paymentMethod: r.payment_method,
    status: r.status,
    receiptNo: r.receipt_no
  }));
}

export async function addItem(t: Transaction, churchId: number, actorId: number, batchId: number, item: Omit<RecordInput, 'date' | 'status' | 'batchId' | 'source' | 'depositAccountId'>) {
  const batch = await load(t, churchId, batchId, true);
  if (batch.status !== 'OPEN') throw new ConflictError('gifts can only be added while the batch is open');
  return recordContribution(t, churchId, actorId, {
    ...item,
    date: dateOnly(batch.service_date),
    status: 'PENDING',
    batchId,
    source: 'BATCH',
    depositAccountId: toInt(batch.deposit_account_id),
    paymentMethod: item.paymentMethod ?? 'Cash'
  });
}

export async function removeItem(t: Transaction, churchId: number, batchId: number, contributionId: number) {
  const batch = await load(t, churchId, batchId, true);
  if (batch.status !== 'OPEN') throw new ConflictError('gifts can only be removed while the batch is open');
  const row = await selectOne<any>(t, `SELECT id FROM contribution WHERE church_id = :churchId AND id = :contributionId AND batch_id = :batchId AND status = 'PENDING'`, { churchId, contributionId, batchId });
  if (!row) throw new NotFoundError('that gift is not a pending item of this batch');
  await exec(t, `DELETE FROM contribution WHERE church_id = :churchId AND id = :contributionId`, { churchId, contributionId });
}

export async function countBatch(t: Transaction, churchId: number, actorId: number, id: number, countedTotalMinor: number) {
  const batch = await load(t, churchId, id, true);
  if (batch.status !== 'OPEN') throw new ConflictError(`batch is ${String(batch.status).toLowerCase()}, not open`);
  const { count } = await totals(t, churchId, id);
  if (count === 0) throw new BadRequestError('the batch has no gifts to count');
  await exec(
    t,
    `UPDATE giving_batches SET status = 'COUNTED', counted_by = :actor, counted_at = :now, counted_total_minor = :total, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { actor: actorId, now: new Date(), total: countedTotalMinor, churchId, id }
  );
  await recordAudit(t, churchId, { action: 'giving_batch.count', entityType: 'giving_batch', entityId: id, actorId, data: { counted: fromMinor(countedTotalMinor) } });
  return getBatch(t, churchId, id);
}

/** A recount: back to open so gifts can be corrected, clearing the declared total. */
export async function reopenBatch(t: Transaction, churchId: number, actorId: number, id: number) {
  const batch = await load(t, churchId, id, true);
  if (batch.status !== 'COUNTED') throw new ConflictError('only a counted batch can be reopened');
  await exec(
    t,
    `UPDATE giving_batches SET status = 'OPEN', counted_by = NULL, counted_at = NULL, counted_total_minor = NULL, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { now: new Date(), churchId, id }
  );
  await recordAudit(t, churchId, { action: 'giving_batch.reopen', entityType: 'giving_batch', entityId: id, actorId, data: {} });
  return getBatch(t, churchId, id);
}

export async function verifyBatch(t: Transaction, churchId: number, actorId: number, id: number) {
  const batch = await load(t, churchId, id, true);
  if (batch.status === 'POSTED') throw new ConflictError('that batch has already been posted');
  if (batch.status !== 'COUNTED') throw new ConflictError('the batch must be counted before it can be verified');

  const settings = await loadSettings(t, churchId);
  if (settings.requireSeparationOfDuties && (actorId === toInt(batch.created_by) || actorId === toInt(batch.counted_by))) {
    throw new ForbiddenError('a batch must be verified by someone other than the people who opened and counted it');
  }
  const { totalMinor } = await totals(t, churchId, id);
  const counted = toInt(batch.counted_total_minor);
  if (totalMinor !== counted) {
    throw new ConflictError(`the counted total ${fromMinor(counted)} does not match the gifts recorded (${fromMinor(totalMinor)}); reopen the batch and reconcile it`);
  }

  const items = await select<any>(
    t,
    `SELECT c.id, c.member_id, c.amount, c.fund_id, c.pledge_id, gt.income_account_id, gt.name AS type_name
       FROM contribution c JOIN giving_types gt ON gt.church_id = c.church_id AND gt.id = c.giving_type_id
      WHERE c.church_id = :churchId AND c.batch_id = :id AND c.status = 'PENDING' ORDER BY c.id`,
    { churchId, id }
  );
  const deposit = toInt(batch.deposit_account_id);
  const debits = new Map<number, number>();
  const credits = new Map<string, { account: number; fund: number; amount: number }>();
  for (const item of items) {
    const minor = minorOf(item.amount);
    const fund = toInt(item.fund_id);
    debits.set(fund, (debits.get(fund) ?? 0) + minor);
    const key = `${toInt(item.income_account_id)}:${fund}`;
    const slot = credits.get(key) ?? { account: toInt(item.income_account_id), fund, amount: 0 };
    slot.amount += minor;
    credits.set(key, slot);
  }
  const lines: PostLine[] = [
    ...[...debits].map(([fundId, amount]) => ({ accountId: deposit, fundId, debit: amount })),
    ...[...credits.values()].map((c) => ({ accountId: c.account, fundId: c.fund, credit: c.amount }))
  ];
  const posted = await postEntry(
    {
      entryDate: dateOnly(batch.service_date),
      memo: `Giving batch #${batch.batch_no}: ${batch.name}`.slice(0, 500),
      sourceType: 'GIVING_BATCH',
      sourceId: id,
      actorId,
      lines
    },
    t,
    churchId
  );

  const pledges = new Set<number>();
  for (const item of items) {
    const receiptNo = await allocateReceiptNo(t, churchId);
    await exec(
      t,
      `UPDATE contribution SET status = 'POSTED', receipt_no = :receiptNo, journal_entry_id = :entry, updated_at = :now WHERE church_id = :churchId AND id = :cid`,
      { receiptNo, entry: posted.id, now: new Date(), churchId, cid: toInt(item.id) }
    );
    if (item.pledge_id) pledges.add(toInt(item.pledge_id));
  }
  for (const pledgeId of pledges) await syncPledgeStatus(t, churchId, pledgeId);

  await exec(
    t,
    `UPDATE giving_batches SET status = 'POSTED', verified_by = :actor, posted_at = :now, journal_entry_id = :entry, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { actor: actorId, now: new Date(), entry: posted.id, churchId, id }
  );
  await recordAudit(t, churchId, { action: 'giving_batch.verify', entityType: 'giving_batch', entityId: id, actorId, data: { total: fromMinor(totalMinor), entryNo: posted.entryNo, gifts: items.length } });
  return getBatch(t, churchId, id);
}

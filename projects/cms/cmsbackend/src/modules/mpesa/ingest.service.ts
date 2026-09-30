/**
 * Turning an M-Pesa receipt into books. Every receipt (C2B paybill/till payment, or the result of
 * an STK push) goes through processReceipt, keyed on the M-Pesa transaction id so a callback that
 * Safaricom retries, or an STK result followed by its C2B twin, is applied exactly once.
 *
 *   member identified  -> contribution posted straight to income   (Dr M-Pesa, Cr income)
 *   member unknown     -> parked in suspense, in the inbox         (Dr M-Pesa, Cr Unallocated Receipts)
 *   allocation         -> suspense cleared into income             (Dr Unallocated Receipts, Cr income)
 */
import { Transaction } from 'sequelize';
import { exec, forUpdate, select, selectOne } from '../finance/sql';
import { accountIdByKey, defaultFundId } from '../finance/setup.service';
import { postEntry } from '../finance/ledger.service';
import { resolvePeriod } from '../finance/periods.service';
import { recordAudit } from '../finance/audit.service';
import { recordContribution } from '../giving/contributions.service';
import { getType, listTypes } from '../giving/types.service';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { normalisePhone } from './phone';
import { insertIgnoringConflict } from '../giving/shared';

export interface ReceiptInput {
  transId: string;
  channel: 'C2B' | 'STK';
  amountMinor: number;
  msisdn?: string | null;
  billRef?: string | null;
  shortcode?: string | null;
  payerName?: string | null;
  transTime?: Date | null;
  transType?: string | null;
  memberId?: number | null;
  givingTypeId?: number | null;
  fundId?: number | null;
  raw?: unknown;
}

export interface ReceiptResult {
  id: number;
  status: 'MATCHED' | 'UNALLOCATED' | 'ALLOCATED' | 'ERROR';
  duplicate: boolean;
  contributionId: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

/** yyyyMMddHHmmss, East Africa Time (UTC+3), as Safaricom sends it. */
export function parseTransTime(value: unknown): Date | null {
  const m = typeof value === 'string' ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/) : null;
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 3, +m[5], +m[6]));
}

function eatDate(at: Date): string {
  return new Date(at.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** The receipt date, unless that period has been closed since, in which case it lands today. */
async function postingDate(t: Transaction, churchId: number, wanted: string): Promise<string> {
  const period = await resolvePeriod(t, churchId, wanted);
  return period.status === 'OPEN' ? wanted : today();
}

async function findMember(t: Transaction, churchId: number, input: ReceiptInput, tokens: string[]): Promise<number | null> {
  if (input.memberId) return input.memberId;
  for (const token of tokens) {
    const m = token.match(/^(?:M|MBR|MEMBER)?(\d{1,9})$/i);
    if (m) {
      const row = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: Number(m[1]) });
      if (row) return Number(m[1]);
    }
  }
  const phone = normalisePhone(input.msisdn);
  if (phone) {
    const rows = await select<any>(t, `SELECT id, phone_number FROM members WHERE church_id = :churchId AND phone_number LIKE :tail`, { churchId, tail: `%${phone.slice(-9)}` });
    const hits = rows.filter((r) => normalisePhone(r.phone_number) === phone);
    if (hits.length === 1) return toInt(hits[0].id);
  }
  return null;
}

async function findType(t: Transaction, churchId: number, input: ReceiptInput, tokens: string[]): Promise<number | null> {
  if (input.givingTypeId) return input.givingTypeId;
  const types = await listTypes(t, churchId);
  for (const token of tokens) {
    const hit = types.find((type) => type.code.toLowerCase() === token.toLowerCase() || type.name.toLowerCase() === token.toLowerCase());
    if (hit) return hit.id;
  }
  return null;
}

export async function processReceipt(
  t: Transaction,
  churchId: number,
  input: ReceiptInput,
  options: { existingRowId?: number } = {}
): Promise<ReceiptResult> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new BadRequestError('amount must be greater than zero');
  const phone = normalisePhone(input.msisdn);
  const at = input.transTime ?? new Date();
  const now = new Date();

  let rowId = options.existingRowId ?? null;
  if (rowId === null) {
    const insertedId = await insertIgnoringConflict(
      t,
      `INSERT INTO mpesa_transactions
         (church_id, trans_id, channel, trans_type, trans_time, amount_minor, msisdn, msisdn_normalised, bill_ref, shortcode, payer_name, status, raw, created_at, updated_at)
       VALUES (:churchId, :transId, :channel, :transType, :at, :amount, :msisdn, :phone, :billRef, :shortcode, :payer, 'UNALLOCATED', :raw, :now, :now)
       ON CONFLICT (church_id, trans_id) DO NOTHING`,
      {
        churchId,
        transId: input.transId,
        channel: input.channel,
        transType: input.transType ?? null,
        at,
        amount: input.amountMinor,
        msisdn: input.msisdn ? String(input.msisdn).slice(0, 80) : null,
        phone,
        billRef: input.billRef ? String(input.billRef).slice(0, 80) : null,
        shortcode: input.shortcode ?? null,
        payer: input.payerName ?? null,
        raw: JSON.stringify(input.raw ?? {}),
        now
      },
      async () => Boolean(await selectOne(t, `SELECT id FROM mpesa_transactions WHERE church_id = :churchId AND trans_id = :transId`, { churchId, transId: input.transId }))
    );
    if (insertedId === null) {
      const existing = await selectOne<any>(t, `SELECT id, status, contribution_id FROM mpesa_transactions WHERE church_id = :churchId AND trans_id = :transId`, { churchId, transId: input.transId });
      return { id: toInt(existing!.id), status: existing!.status, duplicate: true, contributionId: existing!.contribution_id === null ? null : toInt(existing!.contribution_id) };
    }
    rowId = insertedId;
  }

  const tokens = (input.billRef ?? '').split(/[\s\-_#:./]+/).filter(Boolean);
  const memberId = await findMember(t, churchId, input, tokens);
  const typeId = await findType(t, churchId, input, tokens);
  const date = await postingDate(t, churchId, eatDate(at));

  if (memberId) {
    const type = typeId ? await getType(t, churchId, typeId) : null;
    const contribution = await recordContribution(t, churchId, null, {
      memberId,
      amountMinor: input.amountMinor,
      date: eatDate(at),
      givingTypeId: typeId,
      typeName: type ? undefined : 'Offering',
      fundId: input.fundId ?? null,
      paymentMethod: 'M-Pesa',
      transactionId: input.transId,
      source: 'MPESA',
      ledgerDate: date,
      notes: `M-Pesa ${input.transId}${input.billRef ? ` ref ${input.billRef}` : ''}`
    });
    await exec(
      t,
      `UPDATE mpesa_transactions SET status = 'MATCHED', member_id = :memberId, contribution_id = :cid, fund_id = :fundId, receipt_entry_id = :entry, error = NULL, updated_at = :now WHERE church_id = :churchId AND id = :id`,
      { memberId, cid: contribution.id, fundId: contribution.fundId, entry: contribution.journalEntryId, now, churchId, id: rowId }
    );
    return { id: rowId, status: 'MATCHED', duplicate: false, contributionId: contribution.id };
  }

  const fundId = input.fundId ?? (await defaultFundId(t, churchId));
  const posted = await postEntry(
    {
      entryDate: date,
      memo: `M-Pesa ${input.transId} from ${input.payerName ?? phone ?? 'unknown payer'} (unallocated)`.slice(0, 500),
      sourceType: 'MPESA',
      sourceId: rowId,
      lines: [
        { accountId: await accountIdByKey(t, churchId, 'MPESA'), fundId, debit: input.amountMinor },
        { accountId: await accountIdByKey(t, churchId, 'SUSPENSE'), fundId, credit: input.amountMinor }
      ]
    },
    t,
    churchId
  );
  await exec(
    t,
    `UPDATE mpesa_transactions SET status = 'UNALLOCATED', fund_id = :fundId, receipt_entry_id = :entry, error = NULL, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { fundId, entry: posted.id, now, churchId, id: rowId }
  );
  return { id: rowId, status: 'UNALLOCATED', duplicate: false, contributionId: null };
}

/** Stores a receipt that could not be posted so it is never lost; it can be retried from the inbox. */
export async function recordReceiptFailure(t: Transaction, churchId: number, input: ReceiptInput, error: string): Promise<void> {
  const now = new Date();
  await exec(
    t,
    `INSERT INTO mpesa_transactions
       (church_id, trans_id, channel, trans_type, trans_time, amount_minor, msisdn, msisdn_normalised, bill_ref, shortcode, payer_name, status, error, raw, created_at, updated_at)
     VALUES (:churchId, :transId, :channel, :transType, :at, :amount, :msisdn, :phone, :billRef, :shortcode, :payer, 'ERROR', :error, :raw, :now, :now)
     ON CONFLICT (church_id, trans_id) DO NOTHING`,
    {
      churchId,
      transId: input.transId,
      channel: input.channel,
      transType: input.transType ?? null,
      at: input.transTime ?? now,
      amount: input.amountMinor,
      msisdn: input.msisdn ? String(input.msisdn).slice(0, 80) : null,
      phone: normalisePhone(input.msisdn),
      billRef: input.billRef ? String(input.billRef).slice(0, 80) : null,
      shortcode: input.shortcode ?? null,
      payer: input.payerName ?? null,
      error: error.slice(0, 1000),
      raw: JSON.stringify(input.raw ?? {}),
      now
    }
  );
}

export async function retryReceipt(t: Transaction, churchId: number, actorId: number, id: number): Promise<ReceiptResult> {
  const row = await selectOne<any>(t, `SELECT * FROM mpesa_transactions WHERE church_id = :churchId AND id = :id ${forUpdate()}`, { churchId, id });
  if (!row) throw new NotFoundError(`M-Pesa transaction ${id} was not found`);
  if (row.status !== 'ERROR') throw new ConflictError('only a failed receipt can be retried');
  const result = await processReceipt(
    t,
    churchId,
    {
      transId: row.trans_id,
      channel: row.channel,
      amountMinor: toInt(row.amount_minor),
      msisdn: row.msisdn,
      billRef: row.bill_ref,
      shortcode: row.shortcode,
      payerName: row.payer_name,
      transTime: row.trans_time ? new Date(row.trans_time) : null
    },
    { existingRowId: id }
  );
  await recordAudit(t, churchId, { action: 'mpesa.retry', entityType: 'mpesa_transaction', entityId: id, actorId, data: { status: result.status } });
  return result;
}

export async function allocateReceipt(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  input: { memberId?: number | null; givingTypeId: number; fundId?: number | null; contributorName?: string | null }
) {
  const row = await selectOne<any>(t, `SELECT * FROM mpesa_transactions WHERE church_id = :churchId AND id = :id ${forUpdate()}`, { churchId, id });
  if (!row) throw new NotFoundError(`M-Pesa transaction ${id} was not found`);
  if (row.status !== 'UNALLOCATED') throw new ConflictError(`that receipt is ${String(row.status).toLowerCase()}, not waiting to be allocated`);
  const amountMinor = toInt(row.amount_minor);
  const receiptFund = toInt(row.fund_id);

  const contribution = await recordContribution(t, churchId, actorId, {
    memberId: input.memberId ?? null,
    contributorName: input.contributorName ?? row.payer_name,
    amountMinor,
    date: eatDate(row.trans_time ? new Date(row.trans_time) : new Date()),
    givingTypeId: input.givingTypeId,
    fundId: input.fundId ?? receiptFund,
    paymentMethod: 'M-Pesa',
    transactionId: row.trans_id,
    source: 'MPESA',
    notes: `M-Pesa ${row.trans_id} allocated from suspense`,
    customPost: async ({ fundId: targetFund, incomeAccountId, memo }) => {
      const suspense = await accountIdByKey(t, churchId, 'SUSPENSE');
      const mpesa = await accountIdByKey(t, churchId, 'MPESA');
      const lines =
        targetFund === receiptFund
          ? [
              { accountId: suspense, fundId: receiptFund, debit: amountMinor, memberId: input.memberId ?? null },
              { accountId: incomeAccountId, fundId: targetFund, credit: amountMinor, memberId: input.memberId ?? null }
            ]
          : [
              // Cash stays in the M-Pesa account but changes which fund it belongs to.
              { accountId: suspense, fundId: receiptFund, debit: amountMinor },
              { accountId: mpesa, fundId: receiptFund, credit: amountMinor },
              { accountId: mpesa, fundId: targetFund, debit: amountMinor },
              { accountId: incomeAccountId, fundId: targetFund, credit: amountMinor, memberId: input.memberId ?? null }
            ];
      const posted = await postEntry(
        { entryDate: await postingDate(t, churchId, today()), memo: `Allocate ${memo}`.slice(0, 500), sourceType: 'MPESA_ALLOCATION', sourceId: id, actorId, lines },
        t,
        churchId
      );
      await exec(t, `UPDATE mpesa_transactions SET allocation_entry_id = :entry WHERE church_id = :churchId AND id = :id`, { entry: posted.id, churchId, id });
      return posted.id;
    }
  });
  await exec(
    t,
    `UPDATE mpesa_transactions SET status = 'ALLOCATED', member_id = :memberId, contribution_id = :cid, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    { memberId: input.memberId ?? null, cid: contribution.id, now: new Date(), churchId, id }
  );
  await recordAudit(t, churchId, { action: 'mpesa.allocate', entityType: 'mpesa_transaction', entityId: id, actorId, data: { transId: row.trans_id, amount: fromMinor(amountMinor), contributionId: contribution.id } });
  return contribution;
}

// ---- inbox --------------------------------------------------------------------------------

const mapRow = (r: any) => ({
  id: toInt(r.id),
  transId: r.trans_id,
  channel: r.channel,
  amount: fromMinor(r.amount_minor),
  amountMinor: toInt(r.amount_minor),
  msisdn: r.msisdn_normalised ?? r.msisdn,
  billRef: r.bill_ref,
  payerName: r.payer_name,
  transTime: r.trans_time ? new Date(r.trans_time).toISOString() : null,
  status: r.status,
  memberId: r.member_id === null ? null : toInt(r.member_id),
  contributionId: r.contribution_id === null ? null : toInt(r.contribution_id),
  fundId: r.fund_id === null ? null : toInt(r.fund_id),
  error: r.error
});

export async function listReceipts(t: Transaction, churchId: number, filter: { status?: string }, limit: number, cursor?: string) {
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
  const rows = await select<any>(t, `SELECT * FROM mpesa_transactions WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, limit + 1]);
  const page = toKeysetPage(rows, limit, (r: any) => ({ id: toInt(r.id) }));
  return { data: page.data.map(mapRow), nextCursor: page.nextCursor, limit };
}

// ---- STK push -----------------------------------------------------------------------------

export interface StkResult {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  receipt?: string | null;
  amountMinor?: number | null;
  phone?: string | null;
}

export async function applyStkResult(t: Transaction, churchId: number, result: StkResult) {
  const request = await selectOne<any>(
    t,
    `SELECT * FROM mpesa_stk_requests WHERE church_id = :churchId AND checkout_request_id = :id ${forUpdate()}`,
    { churchId, id: result.checkoutRequestId }
  );
  if (!request) throw new NotFoundError('no STK request with that checkout id');
  if (request.status !== 'PENDING') return { requestId: toInt(request.id), status: request.status as string, duplicate: true };

  const now = new Date();
  if (result.resultCode !== 0) {
    const status = result.resultCode === 1032 ? 'CANCELLED' : 'FAILED';
    await exec(
      t,
      `UPDATE mpesa_stk_requests SET status = :status, result_code = :code, result_desc = :desc, completed_at = :now WHERE church_id = :churchId AND id = :id`,
      { status, code: result.resultCode, desc: result.resultDesc.slice(0, 300), now, churchId, id: toInt(request.id) }
    );
    return { requestId: toInt(request.id), status, duplicate: false };
  }
  if (!result.receipt) throw new BadRequestError('a successful STK result must carry the M-Pesa receipt number');
  const receipt = await processReceipt(t, churchId, {
    transId: result.receipt,
    channel: 'STK',
    amountMinor: result.amountMinor ?? toInt(request.amount_minor),
    msisdn: result.phone ?? request.phone,
    billRef: request.account_ref,
    memberId: request.member_id === null ? null : toInt(request.member_id),
    givingTypeId: request.giving_type_id === null ? null : toInt(request.giving_type_id),
    fundId: request.fund_id === null ? null : toInt(request.fund_id),
    raw: { stk: true, checkoutRequestId: result.checkoutRequestId }
  });
  await exec(
    t,
    `UPDATE mpesa_stk_requests SET status = 'SUCCESS', result_code = 0, result_desc = :desc, mpesa_receipt = :receipt, completed_at = :now WHERE church_id = :churchId AND id = :id`,
    { desc: result.resultDesc.slice(0, 300), receipt: result.receipt, now, churchId, id: toInt(request.id) }
  );
  return { requestId: toInt(request.id), status: 'SUCCESS', duplicate: false, receiptId: receipt.id };
}

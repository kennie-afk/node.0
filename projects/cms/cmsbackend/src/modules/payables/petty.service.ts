import { Transaction } from 'sequelize';
import { fromMinor, MAX_MINOR, toInt } from '../../common/money';
import { decodeCursor, toKeysetPage } from '../../common/keyset';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { dateOnly, nextCounter } from '../finance/chain';
import { postEntry, PostLine, reverseEntry } from '../finance/ledger.service';
import { getBankAccount, ledgerBalance, resolveCashAccount } from '../banking/accounts.service';

const today = () => new Date().toISOString().slice(0, 10);

async function pettyAccount(t: Transaction, churchId: number, bankAccountId: number) {
  const account = await getBankAccount(t, churchId, bankAccountId);
  if (account.kind !== 'PETTY_CASH') throw new BadRequestError(`"${account.name}" is not a petty cash account`);
  return account;
}

const mapVoucher = (r: any) => ({
  id: toInt(r.id), voucherNo: toInt(r.voucher_no), pettyAccountId: toInt(r.petty_account_id), date: dateOnly(r.voucher_date), payee: r.payee as string, memo: r.memo as string | null,
  accountId: toInt(r.account_id), fundId: toInt(r.fund_id), ministryId: r.ministry_id === null ? null : toInt(r.ministry_id), amount: fromMinor(r.amount_minor), amountMinor: toInt(r.amount_minor),
  status: r.status as 'POSTED' | 'VOID', journalEntryId: r.journal_entry_id === null ? null : toInt(r.journal_entry_id), replenished: r.replenishment_id !== null, voidReason: r.void_reason as string | null
});

export async function createVoucher(
  t: Transaction,
  churchId: number,
  actorId: number,
  input: { bankAccountId: number; date: string; payee: string; memo?: string | null; accountId: number; fundId: number; ministryId?: number | null; amountMinor: number }
) {
  const petty = await pettyAccount(t, churchId, input.bankAccountId);
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > MAX_MINOR) throw new BadRequestError('the voucher needs a positive amount');
  const account = await selectOne<any>(t, `SELECT type, code FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id: input.accountId });
  if (!account) throw new BadRequestError(`account ${input.accountId} does not exist in this church`);
  if (account.type !== 'EXPENSE') throw new BadRequestError(`account ${account.code} is not an expense account`);
  const balance = await ledgerBalance(t, churchId, petty.glAccountId);
  if (input.amountMinor > balance) throw new ConflictError(`petty cash holds only ${fromMinor(balance)}; replenish it before spending ${fromMinor(input.amountMinor)}`);
  const voucherNo = await nextCounter(t, churchId, 'petty_voucher');
  await exec(
    t,
    `INSERT INTO petty_cash_vouchers (church_id, voucher_no, petty_account_id, voucher_date, payee, memo, account_id, fund_id, ministry_id, amount_minor, created_by)
     VALUES (:churchId, :voucherNo, :petty, :date, :payee, :memo, :accountId, :fundId, :ministryId, :amount, :actorId)`,
    { churchId, voucherNo, petty: petty.glAccountId, date: input.date, payee: input.payee, memo: input.memo ?? null, accountId: input.accountId, fundId: input.fundId, ministryId: input.ministryId ?? null, amount: input.amountMinor, actorId }
  );
  const row = await selectOne<any>(t, `SELECT id FROM petty_cash_vouchers WHERE church_id = :churchId AND voucher_no = :voucherNo`, { churchId, voucherNo });
  const id = toInt(row!.id);
  const posted = await postEntry(
    {
      entryDate: input.date, memo: `Petty cash voucher #${voucherNo} ${input.payee}`.slice(0, 500), sourceType: 'PETTY_CASH', sourceId: id, actorId,
      lines: [{ accountId: input.accountId, fundId: input.fundId, debit: input.amountMinor, ministryId: input.ministryId, memo: input.memo }, { accountId: petty.glAccountId, fundId: input.fundId, credit: input.amountMinor }]
    },
    t,
    churchId
  );
  await exec(t, `UPDATE petty_cash_vouchers SET journal_entry_id = :entry WHERE church_id = :churchId AND id = :id`, { entry: posted.id, churchId, id });
  await recordAudit(t, churchId, { action: 'petty_cash.voucher', entityType: 'petty_cash_voucher', entityId: id, actorId, data: { voucherNo, amount: fromMinor(input.amountMinor) } });
  return getVoucher(t, churchId, id);
}

export async function getVoucher(t: Transaction, churchId: number, id: number) {
  const row = await selectOne<any>(t, `SELECT * FROM petty_cash_vouchers WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`voucher ${id} was not found`);
  return mapVoucher(row);
}

export async function voidVoucher(t: Transaction, churchId: number, actorId: number, id: number, reason: string) {
  const v = await getVoucher(t, churchId, id);
  if (v.status === 'VOID') throw new ConflictError('the voucher is already void');
  if (v.replenished) throw new ConflictError('the voucher has been replenished; correct it with a journal entry instead');
  await reverseEntry(t, churchId, v.journalEntryId!, { reason: `void petty cash voucher ${v.voucherNo}: ${reason}`, date: today(), actorId, allowSourced: true });
  await exec(t, `UPDATE petty_cash_vouchers SET status = 'VOID', void_reason = :reason WHERE church_id = :churchId AND id = :id`, { reason, churchId, id });
  await recordAudit(t, churchId, { action: 'petty_cash.void', entityType: 'petty_cash_voucher', entityId: id, actorId, data: { reason } });
  return getVoucher(t, churchId, id);
}

export async function listVouchers(t: Transaction, churchId: number, f: { bankAccountId?: number; status?: string; limit: number; cursor?: string }) {
  const where = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (f.bankAccountId) {
    const petty = await pettyAccount(t, churchId, f.bankAccountId);
    where.push('petty_account_id = ?');
    params.push(petty.glAccountId);
  }
  if (f.status) { where.push('status = ?'); params.push(f.status); }
  const cursor = decodeCursor<{ id: number }>(f.cursor);
  if (cursor) { where.push('id < ?'); params.push(cursor.id); }
  const rows = await select<any>(t, `SELECT * FROM petty_cash_vouchers WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, [...params, f.limit + 1]);
  return toKeysetPage(rows.map(mapVoucher), f.limit, (v) => ({ id: v.id }));
}

export async function pettyStatus(t: Transaction, churchId: number, bankAccountId: number) {
  const petty = await pettyAccount(t, churchId, bankAccountId);
  const balance = await ledgerBalance(t, churchId, petty.glAccountId);
  const open = await selectOne<any>(t, `SELECT COALESCE(SUM(amount_minor), 0) AS n, COUNT(*) AS c FROM petty_cash_vouchers WHERE church_id = :churchId AND petty_account_id = :gl AND status = 'POSTED' AND replenishment_id IS NULL`, { churchId, gl: petty.glAccountId });
  const float = petty.float === null ? null : Math.round(Number(petty.float) * 100);
  return {
    bankAccount: petty, float: petty.float, balance: fromMinor(balance), unreplenished: fromMinor(open?.n), unreplenishedVouchers: toInt(open?.c),
    shortfallToFloat: float === null ? null : fromMinor(Math.max(float - balance, 0))
  };
}

/**
 * Tops the float back up from another account by exactly what the un-replenished vouchers spent,
 * fund by fund, so each fund's cash line is restored and nothing is rounded or invented.
 */
export async function replenish(t: Transaction, churchId: number, actorId: number, bankAccountId: number, input: { date?: string; sourceBankAccountId?: number; sourceAccountId?: number }) {
  const petty = await pettyAccount(t, churchId, bankAccountId);
  const source = await resolveCashAccount(t, churchId, { bankAccountId: input.sourceBankAccountId, accountId: input.sourceAccountId });
  if (source === petty.glAccountId) throw new BadRequestError('replenish from a different account');
  const vouchers = await select<any>(t, `SELECT id, fund_id, amount_minor FROM petty_cash_vouchers WHERE church_id = :churchId AND petty_account_id = :gl AND status = 'POSTED' AND replenishment_id IS NULL ORDER BY id`, { churchId, gl: petty.glAccountId });
  if (vouchers.length === 0) throw new ConflictError('there is nothing to replenish: no un-replenished vouchers');
  const perFund = new Map<number, number>();
  for (const v of vouchers) perFund.set(toInt(v.fund_id), (perFund.get(toInt(v.fund_id)) ?? 0) + toInt(v.amount_minor));
  const total = [...perFund.values()].reduce((s, n) => s + n, 0);
  const date = input.date ?? today();
  const lines: PostLine[] = [];
  for (const [fundId, amount] of [...perFund].sort((a, b) => a[0] - b[0])) lines.push({ accountId: petty.glAccountId, fundId, debit: amount }, { accountId: source, fundId, credit: amount });
  await exec(t, `INSERT INTO petty_cash_replenishments (church_id, petty_account_id, source_account_id, replenished_on, amount_minor, created_by) VALUES (:churchId, :petty, :source, :date, :total, :actorId)`, { churchId, petty: petty.glAccountId, source, date, total, actorId });
  const rep = await selectOne<any>(t, `SELECT id FROM petty_cash_replenishments WHERE church_id = :churchId AND petty_account_id = :petty ORDER BY id DESC LIMIT 1`, { churchId, petty: petty.glAccountId });
  const id = toInt(rep!.id);
  const posted = await postEntry({ entryDate: date, memo: `Petty cash replenishment #${id}`, sourceType: 'PETTY_CASH', sourceId: `rep-${id}`, actorId, lines }, t, churchId);
  await exec(t, `UPDATE petty_cash_replenishments SET journal_entry_id = :entry WHERE church_id = :churchId AND id = :id`, { entry: posted.id, churchId, id });
  await exec(t, `UPDATE petty_cash_vouchers SET replenishment_id = :id WHERE church_id = :churchId AND petty_account_id = :gl AND status = 'POSTED' AND replenishment_id IS NULL`, { id, churchId, gl: petty.glAccountId });
  await recordAudit(t, churchId, { action: 'petty_cash.replenish', entityType: 'petty_cash_replenishment', entityId: id, actorId, data: { amount: fromMinor(total), vouchers: vouchers.length } });
  return { replenishmentId: id, amount: fromMinor(total), vouchers: vouchers.length, entryId: posted.id, entryNo: posted.entryNo };
}

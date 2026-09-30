import { Transaction } from 'sequelize';
import { fromMinor, toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { exec, select, selectOne } from '../finance/sql';
import { recordAudit } from '../finance/audit.service';
import { createAccount } from '../finance/accounts.service';
import { registerSetupHook } from '../finance/setup.service';

export const KINDS = ['CASH', 'BANK', 'MPESA_PAYBILL', 'MPESA_TILL', 'PETTY_CASH'] as const;
export type BankKind = (typeof KINDS)[number];

const bool = (v: unknown) => v === true || v === 1;

export interface BankAccountDto {
  id: number;
  name: string;
  kind: BankKind;
  glAccountId: number;
  accountNumber: string | null;
  currency: string;
  float: string | null;
  isActive: boolean;
}

function map(row: any): BankAccountDto {
  return {
    id: toInt(row.id),
    name: row.name,
    kind: row.kind,
    glAccountId: toInt(row.gl_account_id),
    accountNumber: row.account_number,
    currency: String(row.currency).trim(),
    float: row.float_minor === null ? null : fromMinor(row.float_minor),
    isActive: bool(row.is_active)
  };
}

const DEFAULTS: Array<{ key: string; name: string; kind: BankKind }> = [
  { key: 'CASH', name: 'Cash on Hand', kind: 'CASH' },
  { key: 'PETTY_CASH', name: 'Petty Cash', kind: 'PETTY_CASH' },
  { key: 'BANK_MAIN', name: 'Main Bank Account', kind: 'BANK' },
  { key: 'MPESA', name: 'M-Pesa Paybill', kind: 'MPESA_PAYBILL' }
];

/**
 * A church that has the standard cash accounts in its chart gets a bank/cash account record for
 * each, so payments and reconciliation have something to point at from day one. Runs as part of
 * finance setup for new churches and lazily for churches that predate banking.
 */
export async function ensureBankAccounts(t: Transaction, churchId: number): Promise<void> {
  const existing = await selectOne(t, `SELECT id FROM bank_accounts WHERE church_id = :churchId LIMIT 1`, { churchId });
  if (existing) return;
  for (const d of DEFAULTS) {
    const account = await selectOne<any>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND system_key = :key`, { churchId, key: d.key });
    if (!account) continue;
    await exec(t, `INSERT INTO bank_accounts (church_id, name, kind, gl_account_id) VALUES (:churchId, :name, :kind, :gl) ON CONFLICT DO NOTHING`, {
      churchId, name: d.name, kind: d.kind, gl: toInt(account.id)
    });
  }
}
registerSetupHook(ensureBankAccounts);

export async function ledgerBalance(t: Transaction, churchId: number, glAccountId: number): Promise<number> {
  const row = await selectOne<any>(t, `SELECT COALESCE(SUM(debit_minor - credit_minor), 0) AS n FROM ledger_balances WHERE church_id = :churchId AND account_id = :glAccountId`, { churchId, glAccountId });
  return toInt(row?.n);
}

export async function listBankAccounts(t: Transaction, churchId: number, includeInactive = false) {
  const rows = await select<any>(t, `SELECT * FROM bank_accounts WHERE church_id = ? ${includeInactive ? '' : 'AND is_active = ?'} ORDER BY name`, includeInactive ? [churchId] : [churchId, true]);
  const result = [];
  for (const row of rows) {
    const dto = map(row);
    result.push({ ...dto, ledgerBalance: fromMinor(await ledgerBalance(t, churchId, dto.glAccountId)) });
  }
  return result;
}

export async function getBankAccount(t: Transaction, churchId: number, id: number): Promise<BankAccountDto> {
  const row = await selectOne<any>(t, `SELECT * FROM bank_accounts WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`bank account ${id} was not found`);
  return map(row);
}

export async function createBankAccount(
  t: Transaction,
  churchId: number,
  actorId: number,
  input: { name: string; kind: BankKind; glAccountId?: number; newAccount?: { code: string; name?: string }; accountNumber?: string | null; floatMinor?: number | null }
): Promise<BankAccountDto> {
  let glAccountId = input.glAccountId;
  if (!glAccountId) {
    if (!input.newAccount) throw new BadRequestError('give glAccountId, or newAccount to create the ledger account');
    const parent = await selectOne<any>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND code = '1000'`, { churchId });
    const created = await createAccount(t, churchId, actorId, { code: input.newAccount.code, name: input.newAccount.name ?? input.name, type: 'ASSET', parentId: parent ? toInt(parent.id) : null });
    glAccountId = created.id;
  }
  const gl = await selectOne<any>(t, `SELECT id, type, is_postable FROM accounts WHERE church_id = :churchId AND id = :glAccountId`, { churchId, glAccountId });
  if (!gl) throw new BadRequestError(`account ${glAccountId} does not exist in this church`);
  if (gl.type !== 'ASSET' || !bool(gl.is_postable)) throw new BadRequestError('a bank or cash account must be linked to a postable asset account');
  if (await selectOne(t, `SELECT id FROM bank_accounts WHERE church_id = :churchId AND gl_account_id = :glAccountId`, { churchId, glAccountId })) {
    throw new ConflictError('that ledger account is already linked to another bank account');
  }
  if (await selectOne(t, `SELECT id FROM bank_accounts WHERE church_id = :churchId AND name = :name`, { churchId, name: input.name })) {
    throw new ConflictError(`a bank account called "${input.name}" already exists`);
  }
  if (input.floatMinor != null && input.kind !== 'PETTY_CASH') throw new BadRequestError('only petty cash accounts have a float');
  await exec(t, `INSERT INTO bank_accounts (church_id, name, kind, gl_account_id, account_number, float_minor) VALUES (:churchId, :name, :kind, :glAccountId, :accountNumber, :floatMinor)`, {
    churchId, name: input.name, kind: input.kind, glAccountId, accountNumber: input.accountNumber ?? null, floatMinor: input.floatMinor ?? null
  });
  const row = await selectOne<any>(t, `SELECT * FROM bank_accounts WHERE church_id = :churchId AND gl_account_id = :glAccountId`, { churchId, glAccountId });
  await recordAudit(t, churchId, { action: 'bank_account.create', entityType: 'bank_account', entityId: toInt(row!.id), actorId, data: { name: input.name, kind: input.kind } });
  return map(row);
}

export async function updateBankAccount(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { name?: string; accountNumber?: string | null; floatMinor?: number | null; isActive?: boolean }
): Promise<BankAccountDto> {
  const current = await getBankAccount(t, churchId, id);
  if (changes.floatMinor != null && current.kind !== 'PETTY_CASH') throw new BadRequestError('only petty cash accounts have a float');
  if (changes.isActive === false && current.isActive) {
    const balance = await ledgerBalance(t, churchId, current.glAccountId);
    if (balance !== 0) throw new ConflictError(`the account still holds ${fromMinor(balance)}; move it out before deactivating`);
  }
  await exec(t, `UPDATE bank_accounts SET name = :name, account_number = :accountNumber, float_minor = :floatMinor, is_active = :isActive, updated_at = :now WHERE church_id = :churchId AND id = :id`, {
    name: changes.name ?? current.name,
    accountNumber: changes.accountNumber === undefined ? current.accountNumber : changes.accountNumber,
    floatMinor: changes.floatMinor === undefined ? (current.float === null ? null : Math.round(Number(current.float) * 100)) : changes.floatMinor,
    isActive: changes.isActive ?? current.isActive,
    now: new Date(), churchId, id
  });
  await recordAudit(t, churchId, { action: 'bank_account.update', entityType: 'bank_account', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  return getBankAccount(t, churchId, id);
}

/**
 * The ledger account a payment leaves from. Either a registered bank/cash account, or (for power
 * users) any postable asset account directly.
 */
export async function resolveCashAccount(t: Transaction, churchId: number, input: { bankAccountId?: number; accountId?: number }): Promise<number> {
  if (input.bankAccountId) {
    const account = await getBankAccount(t, churchId, input.bankAccountId);
    if (!account.isActive) throw new BadRequestError(`bank account "${account.name}" is inactive`);
    return account.glAccountId;
  }
  if (!input.accountId) throw new BadRequestError('say which bank or cash account the money leaves from');
  const gl = await selectOne<any>(t, `SELECT id, type, is_postable, is_active FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id: input.accountId });
  if (!gl) throw new BadRequestError(`account ${input.accountId} does not exist in this church`);
  if (gl.type !== 'ASSET' || !bool(gl.is_postable) || !bool(gl.is_active)) throw new BadRequestError('payments can only leave from an active, postable asset account');
  return toInt(gl.id);
}

export async function bankAccountByGl(t: Transaction, churchId: number, glAccountId: number) {
  const row = await selectOne<any>(t, `SELECT * FROM bank_accounts WHERE church_id = :churchId AND gl_account_id = :glAccountId`, { churchId, glAccountId });
  return row ? map(row) : null;
}

import { Transaction } from 'sequelize';
import { exec, select, selectOne } from './sql';
import { toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from './audit.service';

export interface AccountDto {
  id: number;
  code: string;
  name: string;
  type: string;
  parentId: number | null;
  isPostable: boolean;
  isActive: boolean;
  systemKey: string | null;
  description: string | null;
}

const bool = (v: unknown) => v === true || v === 1;

function map(row: any): AccountDto {
  return {
    id: toInt(row.id),
    code: row.code,
    name: row.name,
    type: row.type,
    parentId: row.parent_id === null ? null : toInt(row.parent_id),
    isPostable: bool(row.is_postable),
    isActive: bool(row.is_active),
    systemKey: row.system_key,
    description: row.description
  };
}

export async function listAccounts(t: Transaction, churchId: number, filter: { type?: string; includeInactive?: boolean; postableOnly?: boolean } = {}): Promise<AccountDto[]> {
  const clauses = ['church_id = ?'];
  const params: unknown[] = [churchId];
  if (filter.type) {
    clauses.push('type = ?');
    params.push(filter.type);
  }
  if (!filter.includeInactive) {
    clauses.push('is_active = ?');
    params.push(true);
  }
  if (filter.postableOnly) {
    clauses.push('is_postable = ?');
    params.push(true);
  }
  return (await select<any>(t, `SELECT * FROM accounts WHERE ${clauses.join(' AND ')} ORDER BY code`, params)).map(map);
}

export async function getAccount(t: Transaction, churchId: number, id: number): Promise<AccountDto> {
  const row = await selectOne<any>(t, `SELECT * FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`account ${id} was not found`);
  return map(row);
}

async function hasPostings(t: Transaction, churchId: number, id: number): Promise<boolean> {
  return Boolean(await selectOne(t, `SELECT 1 AS x FROM journal_lines WHERE church_id = :churchId AND account_id = :id LIMIT 1`, { churchId, id }));
}

export async function createAccount(
  t: Transaction,
  churchId: number,
  actorId: number,
  input: { code: string; name: string; type: string; parentId?: number | null; isPostable?: boolean; description?: string | null }
): Promise<AccountDto> {
  const dup = await selectOne(t, `SELECT id FROM accounts WHERE church_id = :churchId AND code = :code`, { churchId, code: input.code });
  if (dup) throw new ConflictError(`account code ${input.code} is already used`);
  if (input.parentId) {
    const parent = await getAccount(t, churchId, input.parentId);
    if (parent.type !== input.type) throw new BadRequestError('an account must have the same type as its parent');
    if (parent.isPostable && (await hasPostings(t, churchId, parent.id))) {
      throw new BadRequestError('the parent already has postings; it cannot become a heading');
    }
  }
  await exec(
    t,
    `INSERT INTO accounts (church_id, code, name, type, parent_id, is_postable, description) VALUES (:churchId, :code, :name, :type, :parentId, :postable, :description)`,
    { churchId, code: input.code, name: input.name, type: input.type, parentId: input.parentId ?? null, postable: input.isPostable ?? true, description: input.description ?? null }
  );
  const row = await selectOne<any>(t, `SELECT * FROM accounts WHERE church_id = :churchId AND code = :code`, { churchId, code: input.code });
  await recordAudit(t, churchId, { action: 'account.create', entityType: 'account', entityId: toInt(row!.id), actorId, data: { code: input.code, type: input.type } });
  return map(row);
}

export async function updateAccount(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { name?: string; description?: string | null; isActive?: boolean; isPostable?: boolean }
): Promise<AccountDto> {
  const current = await getAccount(t, churchId, id);
  if (changes.isActive === false && current.systemKey) {
    throw new ConflictError(`account ${current.code} is used by automation (${current.systemKey}) and cannot be deactivated`);
  }
  if (changes.isPostable === false && current.isPostable && (await hasPostings(t, churchId, id))) {
    throw new BadRequestError('the account has postings and cannot become a heading');
  }
  await exec(
    t,
    `UPDATE accounts SET name = :name, description = :description, is_active = :isActive, is_postable = :postable, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    {
      name: changes.name ?? current.name,
      description: changes.description === undefined ? current.description : changes.description,
      isActive: changes.isActive ?? current.isActive,
      postable: changes.isPostable ?? current.isPostable,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'account.update', entityType: 'account', entityId: id, actorId, data: changes as Record<string, unknown> });
  return getAccount(t, churchId, id);
}

export async function deleteAccount(t: Transaction, churchId: number, actorId: number, id: number): Promise<void> {
  const current = await getAccount(t, churchId, id);
  if (current.systemKey) throw new ConflictError(`account ${current.code} is used by automation and cannot be deleted`);
  if (await hasPostings(t, churchId, id)) throw new ConflictError('the account has postings; deactivate it instead');
  const child = await selectOne(t, `SELECT id FROM accounts WHERE church_id = :churchId AND parent_id = :id LIMIT 1`, { churchId, id });
  if (child) throw new ConflictError('the account has sub-accounts');
  await exec(t, `DELETE FROM accounts WHERE church_id = :churchId AND id = :id`, { churchId, id });
  await recordAudit(t, churchId, { action: 'account.delete', entityType: 'account', entityId: id, actorId, data: { code: current.code } });
}

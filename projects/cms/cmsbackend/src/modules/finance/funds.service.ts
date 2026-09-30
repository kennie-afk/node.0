import { Transaction } from 'sequelize';
import { exec, select, selectOne } from './sql';
import { toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { recordAudit } from './audit.service';
import { fundPosition } from './ledger.service';

export interface FundDto {
  id: number;
  code: string;
  name: string;
  description: string | null;
  restriction: string;
  isActive: boolean;
}

function map(row: any): FundDto {
  return {
    id: toInt(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    restriction: row.restriction,
    isActive: row.is_active === true || row.is_active === 1
  };
}

export async function listFunds(t: Transaction, churchId: number, includeInactive = false): Promise<Array<FundDto & { position: number }>> {
  const rows = await select<any>(t, `SELECT * FROM funds WHERE church_id = ? ${includeInactive ? '' : 'AND is_active = ?'} ORDER BY code`, includeInactive ? [churchId] : [churchId, true]);
  const positions = await select<any>(
    t,
    `SELECT b.fund_id, SUM(b.credit_minor - b.debit_minor) AS net
       FROM ledger_balances b JOIN accounts a ON a.church_id = b.church_id AND a.id = b.account_id
      WHERE b.church_id = :churchId AND a.type IN ('INCOME','EXPENSE','EQUITY') GROUP BY b.fund_id`,
    { churchId }
  );
  const byFund = new Map(positions.map((p) => [toInt(p.fund_id), toInt(p.net)]));
  return rows.map((row) => ({ ...map(row), position: byFund.get(toInt(row.id)) ?? 0 }));
}

export async function getFund(t: Transaction, churchId: number, id: number): Promise<FundDto> {
  const row = await selectOne<any>(t, `SELECT * FROM funds WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`fund ${id} was not found`);
  return map(row);
}

export async function createFund(t: Transaction, churchId: number, actorId: number, input: { code: string; name: string; description?: string | null; restriction: string }) {
  const code = input.code.toUpperCase();
  const dup = await selectOne(t, `SELECT id FROM funds WHERE church_id = :churchId AND code = :code`, { churchId, code });
  if (dup) throw new ConflictError(`a fund with code ${code} already exists`);
  await exec(t, `INSERT INTO funds (church_id, code, name, description, restriction) VALUES (:churchId, :code, :name, :description, :restriction)`, {
    churchId,
    code,
    name: input.name,
    description: input.description ?? null,
    restriction: input.restriction
  });
  const row = await selectOne<any>(t, `SELECT * FROM funds WHERE church_id = :churchId AND code = :code`, { churchId, code });
  await recordAudit(t, churchId, { action: 'fund.create', entityType: 'fund', entityId: toInt(row!.id), actorId, data: { code, restriction: input.restriction } });
  return map(row);
}

export async function updateFund(t: Transaction, churchId: number, actorId: number, id: number, changes: { name?: string; description?: string | null; restriction?: string; isActive?: boolean }) {
  const current = await getFund(t, churchId, id);
  if (changes.isActive === false && current.isActive) {
    const position = await fundPosition(t, churchId, id);
    if (position !== 0) throw new ConflictError(`fund ${current.code} still holds ${(position / 100).toFixed(2)}; transfer it out before deactivating`);
  }
  if (changes.restriction && changes.restriction !== current.restriction) {
    const used = await selectOne(t, `SELECT 1 AS x FROM ledger_balances WHERE church_id = :churchId AND fund_id = :id LIMIT 1`, { churchId, id });
    if (used) throw new BadRequestError('a fund that already has postings cannot change its restriction; create a new fund and transfer into it');
  }
  await exec(
    t,
    `UPDATE funds SET name = :name, description = :description, restriction = :restriction, is_active = :isActive, updated_at = :now WHERE church_id = :churchId AND id = :id`,
    {
      name: changes.name ?? current.name,
      description: changes.description === undefined ? current.description : changes.description,
      restriction: changes.restriction ?? current.restriction,
      isActive: changes.isActive ?? current.isActive,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'fund.update', entityType: 'fund', entityId: id, actorId, data: changes as Record<string, unknown> });
  return getFund(t, churchId, id);
}

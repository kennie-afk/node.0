import { Transaction } from 'sequelize';
import { exec, select, selectOne } from '../finance/sql';
import { accountIdByKey, defaultFundId, ensureFinanceSetup, registerSetupHook } from '../finance/setup.service';
import { recordAudit } from '../finance/audit.service';
import { toInt } from '../../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors';
import { bool } from './shared';

export interface GivingTypeDto {
  id: number;
  code: string;
  name: string;
  incomeAccountId: number;
  defaultFundId: number | null;
  taxDeductible: boolean;
  isActive: boolean;
}

/**
 * Starting giving types. The tax-deductible flags are a PROVISIONAL default (only gifts to a
 * registered charity are deductible in Kenya, and only some designations qualify); each church
 * should confirm them for its own status.
 */
const DEFAULTS = [
  { code: 'TITHE', name: 'Tithe', account: 'INCOME_TITHES', fund: 'GEN', deductible: false },
  { code: 'OFFERING', name: 'Offering', account: 'INCOME_OFFERINGS', fund: 'GEN', deductible: false },
  { code: 'THANKS', name: 'Thanksgiving', account: 'INCOME_THANKSGIVING', fund: 'GEN', deductible: false },
  { code: 'BUILDING', name: 'Building Fund', account: 'INCOME_BUILDING', fund: 'BLD', deductible: true },
  { code: 'MISSIONS', name: 'Missions', account: 'INCOME_MISSIONS', fund: 'MIS', deductible: true },
  { code: 'BENEVOLENCE', name: 'Benevolence', account: 'INCOME_OFFERINGS', fund: 'BEN', deductible: true },
  { code: 'SEED', name: 'Special Seed', account: 'INCOME_SPECIAL', fund: 'GEN', deductible: false },
  { code: 'OTHER', name: 'Other Gift', account: 'INCOME_OTHER', fund: 'GEN', deductible: false }
];

export async function seedGivingTypes(t: Transaction, churchId: number): Promise<void> {
  for (const def of DEFAULTS) {
    const exists = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId AND code = :code`, { churchId, code: def.code });
    if (exists) continue;
    const fund = await selectOne<any>(t, `SELECT id FROM funds WHERE church_id = :churchId AND code = :code`, { churchId, code: def.fund });
    await exec(
      t,
      `INSERT INTO giving_types (church_id, code, name, income_account_id, default_fund_id, tax_deductible, created_at, updated_at)
       VALUES (:churchId, :code, :name, :account, :fund, :deductible, :now, :now)`,
      {
        churchId,
        code: def.code,
        name: def.name,
        account: await accountIdByKey(t, churchId, def.account),
        fund: fund ? toInt(fund.id) : null,
        deductible: def.deductible,
        now: new Date()
      }
    );
  }
}

registerSetupHook(seedGivingTypes);

const ready = new Set<number>();
export function forgetGivingSetup(): void {
  ready.clear();
}

/** Churches that predate giving (or finance) get their types on first use. */
export async function ensureGivingSetup(t: Transaction, churchId: number): Promise<void> {
  if (ready.has(churchId)) return;
  await ensureFinanceSetup(t, churchId);
  const any = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId LIMIT 1`, { churchId });
  if (!any) await seedGivingTypes(t, churchId);
  ready.add(churchId);
}

function map(row: any): GivingTypeDto {
  return {
    id: toInt(row.id),
    code: row.code,
    name: row.name,
    incomeAccountId: toInt(row.income_account_id),
    defaultFundId: row.default_fund_id === null ? null : toInt(row.default_fund_id),
    taxDeductible: bool(row.tax_deductible),
    isActive: bool(row.is_active)
  };
}

export async function listTypes(t: Transaction, churchId: number, includeInactive = false): Promise<GivingTypeDto[]> {
  const rows = await select<any>(
    t,
    `SELECT * FROM giving_types WHERE church_id = ? ${includeInactive ? '' : 'AND is_active = ?'} ORDER BY name`,
    includeInactive ? [churchId] : [churchId, true]
  );
  return rows.map(map);
}

export async function getType(t: Transaction, churchId: number, id: number): Promise<GivingTypeDto> {
  const row = await selectOne<any>(t, `SELECT * FROM giving_types WHERE church_id = :churchId AND id = :id`, { churchId, id });
  if (!row) throw new NotFoundError(`giving type ${id} was not found`);
  return map(row);
}

/** By id, else by name/code (case-insensitive), else the church's "Offering" type. */
export async function resolveType(t: Transaction, churchId: number, ref: { givingTypeId?: number | null; name?: string | null }): Promise<GivingTypeDto> {
  if (ref.givingTypeId) {
    const type = await getType(t, churchId, ref.givingTypeId).catch(() => null);
    if (!type) throw new BadRequestError('givingTypeId does not refer to a giving type in this church');
    if (!type.isActive) throw new BadRequestError(`giving type ${type.name} is inactive`);
    return type;
  }
  const wanted = (ref.name ?? 'Offering').trim().toLowerCase();
  const row = await selectOne<any>(
    t,
    `SELECT * FROM giving_types WHERE church_id = :churchId AND (LOWER(name) = :wanted OR LOWER(code) = :wanted)`,
    { churchId, wanted }
  );
  if (!row) throw new BadRequestError(`"${ref.name}" is not a giving type in this church; see GET /giving/types`);
  const type = map(row);
  if (!type.isActive) throw new BadRequestError(`giving type ${type.name} is inactive`);
  return type;
}

export async function createType(
  t: Transaction,
  churchId: number,
  actorId: number,
  input: { code: string; name: string; incomeAccountId: number; defaultFundId?: number | null; taxDeductible?: boolean }
): Promise<GivingTypeDto> {
  const code = input.code.toUpperCase();
  const dup = await selectOne(t, `SELECT id FROM giving_types WHERE church_id = :churchId AND (code = :code OR LOWER(name) = :name)`, { churchId, code, name: input.name.toLowerCase() });
  if (dup) throw new ConflictError('a giving type with that code or name already exists');
  await assertIncomeAccount(t, churchId, input.incomeAccountId);
  if (input.defaultFundId) await assertFund(t, churchId, input.defaultFundId);
  await exec(
    t,
    `INSERT INTO giving_types (church_id, code, name, income_account_id, default_fund_id, tax_deductible, created_at, updated_at)
     VALUES (:churchId, :code, :name, :account, :fund, :deductible, :now, :now)`,
    { churchId, code, name: input.name, account: input.incomeAccountId, fund: input.defaultFundId ?? null, deductible: input.taxDeductible ?? false, now: new Date() }
  );
  const row = await selectOne<any>(t, `SELECT * FROM giving_types WHERE church_id = :churchId AND code = :code`, { churchId, code });
  await recordAudit(t, churchId, { action: 'giving_type.create', entityType: 'giving_type', entityId: toInt(row!.id), actorId, data: { code } });
  return map(row);
}

export async function updateType(
  t: Transaction,
  churchId: number,
  actorId: number,
  id: number,
  changes: { name?: string; incomeAccountId?: number; defaultFundId?: number | null; taxDeductible?: boolean; isActive?: boolean }
): Promise<GivingTypeDto> {
  const current = await getType(t, churchId, id);
  if (changes.incomeAccountId) await assertIncomeAccount(t, churchId, changes.incomeAccountId);
  if (changes.defaultFundId) await assertFund(t, churchId, changes.defaultFundId);
  await exec(
    t,
    `UPDATE giving_types SET name = :name, income_account_id = :account, default_fund_id = :fund, tax_deductible = :deductible, is_active = :active, updated_at = :now
      WHERE church_id = :churchId AND id = :id`,
    {
      name: changes.name ?? current.name,
      account: changes.incomeAccountId ?? current.incomeAccountId,
      fund: changes.defaultFundId === undefined ? current.defaultFundId : changes.defaultFundId,
      deductible: changes.taxDeductible ?? current.taxDeductible,
      active: changes.isActive ?? current.isActive,
      now: new Date(),
      churchId,
      id
    }
  );
  await recordAudit(t, churchId, { action: 'giving_type.update', entityType: 'giving_type', entityId: id, actorId, data: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, String(v)])) });
  return getType(t, churchId, id);
}

async function assertIncomeAccount(t: Transaction, churchId: number, accountId: number): Promise<void> {
  const row = await selectOne<any>(t, `SELECT type, is_postable FROM accounts WHERE church_id = :churchId AND id = :accountId`, { churchId, accountId });
  if (!row || row.type !== 'INCOME' || !bool(row.is_postable)) {
    throw new BadRequestError('incomeAccountId must be a postable income account in this church');
  }
}

export async function assertFund(t: Transaction, churchId: number, fundId: number): Promise<void> {
  const row = await selectOne(t, `SELECT id FROM funds WHERE church_id = :churchId AND id = :fundId`, { churchId, fundId });
  if (!row) throw new BadRequestError('fundId does not refer to a fund in this church');
}

export async function fallbackFund(t: Transaction, churchId: number): Promise<number> {
  return defaultFundId(t, churchId);
}

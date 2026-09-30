import { Transaction } from 'sequelize';
import db from '@models';
import { exec, select, selectOne } from './sql';
import { CHART_TEMPLATE, FUND_TEMPLATE } from './chart-template';
import { recordAudit } from './audit.service';
import { ensureFiscalYearFor } from './periods.service';
import { toInt } from '../../common/money';

type SetupHook = (t: Transaction, churchId: number) => Promise<void>;
const hooks: SetupHook[] = [];

/**
 * Other modules register what a brand-new church needs from them (giving types, cash accounts,
 * leave types...). Hooks run, in registration order, inside the same transaction that creates
 * the finance books.
 */
export function registerSetupHook(hook: SetupHook): void {
  hooks.push(hook);
}

const ready = new Set<number>();

export function forgetSetupCache(): void {
  ready.clear();
}

/**
 * Creates the books for a church on first use: settings, funds, chart of accounts, the current
 * fiscal year and its periods. Idempotent, and safe for churches that existed before finance did.
 */
export async function ensureFinanceSetup(t: Transaction, churchId: number): Promise<void> {
  if (ready.has(churchId)) return;
  const existing = await selectOne(t, `SELECT church_id FROM finance_settings WHERE church_id = :churchId`, { churchId });
  if (existing) {
    ready.add(churchId);
    return;
  }

  await exec(t, `INSERT INTO finance_settings (church_id) VALUES (:churchId) ON CONFLICT (church_id) DO NOTHING`, { churchId });
  await exec(t, `INSERT INTO finance_chain (church_id) VALUES (:churchId) ON CONFLICT (church_id) DO NOTHING`, { churchId });

  for (const fund of FUND_TEMPLATE) {
    await exec(
      t,
      `INSERT INTO funds (church_id, code, name, description, restriction) VALUES (:churchId, :code, :name, :description, :restriction)
       ON CONFLICT (church_id, code) DO NOTHING`,
      { churchId, ...fund }
    );
  }

  const idByCode = new Map<string, number>();
  for (const account of CHART_TEMPLATE) {
    const parentId = account.parent ? idByCode.get(account.parent) ?? null : null;
    await exec(
      t,
      `INSERT INTO accounts (church_id, code, name, type, parent_id, is_postable, system_key)
       VALUES (:churchId, :code, :name, :type, :parentId, :postable, :key)
       ON CONFLICT (church_id, code) DO NOTHING`,
      {
        churchId,
        code: account.code,
        name: account.name,
        type: account.type,
        parentId,
        postable: account.postable !== false,
        key: account.key ?? null
      }
    );
    const row = await selectOne<{ id: number }>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND code = :code`, {
      churchId,
      code: account.code
    });
    idByCode.set(account.code, toInt(row!.id));
  }

  await ensureFiscalYearFor(t, churchId, new Date().toISOString().slice(0, 10));

  for (const hook of hooks) {
    await hook(t, churchId);
  }

  await recordAudit(t, churchId, { action: 'finance.setup', entityType: 'church', entityId: churchId, data: { funds: FUND_TEMPLATE.length, accounts: CHART_TEMPLATE.length } });
  ready.add(churchId);
}

export interface FinanceSettingsRow {
  baseCurrency: string;
  fiscalYearStartMonth: number;
  approvalThresholdMinor: number;
  dualApprovalThresholdMinor: number;
  requireSeparationOfDuties: boolean;
  allowRestrictedOverspend: boolean;
  receiptPrefix: string;
}

export async function loadSettings(t: Transaction, churchId: number): Promise<FinanceSettingsRow> {
  const row = await selectOne<any>(t, `SELECT * FROM finance_settings WHERE church_id = :churchId`, { churchId });
  if (!row) {
    throw new Error('finance is not set up for this church');
  }
  return {
    baseCurrency: String(row.base_currency).trim(),
    fiscalYearStartMonth: toInt(row.fiscal_year_start_month),
    approvalThresholdMinor: toInt(row.approval_threshold_minor),
    dualApprovalThresholdMinor: toInt(row.dual_approval_threshold_minor),
    requireSeparationOfDuties: row.require_separation_of_duties === true || row.require_separation_of_duties === 1,
    allowRestrictedOverspend: row.allow_restricted_overspend === true || row.allow_restricted_overspend === 1,
    receiptPrefix: row.receipt_prefix
  };
}

/** Looks up the account other modules post to by role. Throws if the church has deleted it. */
export async function accountIdByKey(t: Transaction, churchId: number, key: string): Promise<number> {
  const row = await selectOne<{ id: number }>(t, `SELECT id FROM accounts WHERE church_id = :churchId AND system_key = :key`, { churchId, key });
  if (!row) {
    throw new Error(`no account carries the system role ${key}; restore it in the chart of accounts`);
  }
  return toInt(row.id);
}

export async function defaultFundId(t: Transaction, churchId: number): Promise<number> {
  const rows = await select<{ id: number }>(t, `SELECT id FROM funds WHERE church_id = :churchId AND is_active = :active ORDER BY (restriction = 'UNRESTRICTED') DESC, id LIMIT 1`, { churchId, active: true });
  if (!rows[0]) {
    throw new Error('no active fund exists');
  }
  return toInt(rows[0].id);
}

export { db };

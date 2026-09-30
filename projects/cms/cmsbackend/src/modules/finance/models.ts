import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class Fund extends BaseModel<any> {}
class Account extends BaseModel<any> {}
class FiscalYear extends BaseModel<any> {}
class FiscalPeriod extends BaseModel<any> {}
class JournalEntry extends BaseModel<any> {}
class JournalLine extends BaseModel<any> {}
class LedgerBalance extends BaseModel<any> {}
class AuditEvent extends BaseModel<any> {}
class FinanceSettings extends BaseModel<any> {}
class FinanceChain extends BaseModel<any> {}
class FinanceCounter extends BaseModel<any> {}
class IdempotencyKey extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
const minor = (defaultValue?: number) => ({ type: DataTypes.BIGINT, allowNull: false, defaultValue });

/**
 * These definitions mirror the tables created by migration 20260930100100-finance-core. In
 * production the migration is the source of truth (it adds partitioning, triggers and row-level
 * security); the models exist for typed access and so the in-memory test database can be built.
 * Ledger lines are written with bulk SQL, never through `JournalLine.create`.
 */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const common = { underscored: true, timestamps: false };

  Fund.initModel(
    {
      id,
      churchId,
      code: { type: DataTypes.STRING(20), allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: true },
      restriction: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'UNRESTRICTED' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'funds', modelName: 'Fund', timestamps: true, indexes: [{ unique: true, fields: ['church_id', 'code'] }] },
    sequelize
  );

  Account.initModel(
    {
      id,
      churchId,
      code: { type: DataTypes.STRING(12), allowNull: false },
      name: { type: DataTypes.STRING(150), allowNull: false },
      type: { type: DataTypes.STRING(10), allowNull: false },
      parentId: { type: DataTypes.INTEGER, allowNull: true },
      isPostable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      systemKey: { type: DataTypes.STRING(40), allowNull: true },
      description: { type: DataTypes.STRING(500), allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'accounts', modelName: 'Account', timestamps: true, indexes: [{ unique: true, fields: ['church_id', 'code'] }] },
    sequelize
  );

  FiscalYear.initModel(
    {
      id,
      churchId,
      name: { type: DataTypes.STRING(40), allowNull: false },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      closedBy: { type: DataTypes.INTEGER, allowNull: true },
      closingEntryId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'fiscal_years', modelName: 'FiscalYear', timestamps: true, indexes: [{ unique: true, fields: ['church_id', 'start_date'] }] },
    sequelize
  );

  FiscalPeriod.initModel(
    {
      id,
      churchId,
      fiscalYearId: { type: DataTypes.INTEGER, allowNull: false },
      number: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(40), allowNull: false },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' },
      closedAt: { type: DataTypes.DATE, allowNull: true },
      closedBy: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'fiscal_periods', modelName: 'FiscalPeriod', timestamps: true, indexes: [{ unique: true, fields: ['church_id', 'fiscal_year_id', 'number'] }] },
    sequelize
  );

  JournalEntry.initModel(
    {
      id,
      churchId,
      entryNo: { type: DataTypes.BIGINT, allowNull: false },
      entryDate: { type: DataTypes.DATEONLY, allowNull: false },
      periodId: { type: DataTypes.INTEGER, allowNull: false },
      memo: { type: DataTypes.STRING(500), allowNull: false },
      sourceType: { type: DataTypes.STRING(30), allowNull: false },
      sourceId: { type: DataTypes.STRING(40), allowNull: true },
      reversesEntryId: { type: DataTypes.INTEGER, allowNull: true },
      reversedByEntryId: { type: DataTypes.INTEGER, allowNull: true },
      totalMinor: minor(),
      createdBy: { type: DataTypes.INTEGER, allowNull: true },
      postedAt: { type: DataTypes.DATE, allowNull: false },
      idempotencyKey: { type: DataTypes.STRING(80), allowNull: true },
      prevHash: { type: DataTypes.CHAR(64), allowNull: false },
      hash: { type: DataTypes.CHAR(64), allowNull: false }
    },
    {
      ...common,
      tableName: 'journal_entries',
      modelName: 'JournalEntry',
      indexes: [
        { unique: true, fields: ['church_id', 'entry_no'] },
        { unique: true, fields: ['church_id', 'idempotency_key'] },
        { fields: ['church_id', 'entry_date', 'id'] }
      ]
    },
    sequelize
  );

  JournalLine.initModel(
    {
      id,
      churchId,
      entryId: { type: DataTypes.INTEGER, allowNull: false },
      lineNo: { type: DataTypes.INTEGER, allowNull: false },
      accountId: { type: DataTypes.INTEGER, allowNull: false },
      fundId: { type: DataTypes.INTEGER, allowNull: false },
      debitMinor: minor(0),
      creditMinor: minor(0),
      memberId: { type: DataTypes.INTEGER, allowNull: true },
      ministryId: { type: DataTypes.INTEGER, allowNull: true },
      memo: { type: DataTypes.STRING(255), allowNull: true },
      entryDate: { type: DataTypes.DATEONLY, allowNull: false },
      periodId: { type: DataTypes.INTEGER, allowNull: false }
    },
    {
      ...common,
      tableName: 'journal_lines',
      modelName: 'JournalLine',
      indexes: [
        { fields: ['church_id', 'account_id', 'entry_date', 'id'] },
        { fields: ['church_id', 'entry_id'] }
      ]
    },
    sequelize
  );

  LedgerBalance.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      periodId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      accountId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      fundId: { type: DataTypes.INTEGER, allowNull: false, primaryKey: true },
      debitMinor: minor(0),
      creditMinor: minor(0)
    },
    { ...common, tableName: 'ledger_balances', modelName: 'LedgerBalance' },
    sequelize
  );

  AuditEvent.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      seq: { type: DataTypes.BIGINT, allowNull: false, primaryKey: true },
      actorId: { type: DataTypes.INTEGER, allowNull: true },
      action: { type: DataTypes.STRING(60), allowNull: false },
      entityType: { type: DataTypes.STRING(40), allowNull: false },
      entityId: { type: DataTypes.STRING(40), allowNull: true },
      data: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
      occurredAt: { type: DataTypes.DATE, allowNull: false },
      prevHash: { type: DataTypes.CHAR(64), allowNull: false },
      hash: { type: DataTypes.CHAR(64), allowNull: false }
    },
    { ...common, tableName: 'audit_events', modelName: 'AuditEvent' },
    sequelize
  );

  FinanceSettings.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      baseCurrency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'KES' },
      fiscalYearStartMonth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      approvalThresholdMinor: minor(0),
      dualApprovalThresholdMinor: minor(10000000),
      requireSeparationOfDuties: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      allowRestrictedOverspend: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      receiptPrefix: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'RCT' },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'finance_settings', modelName: 'FinanceSettings', timestamps: true },
    sequelize
  );

  FinanceChain.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      nextEntryNo: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 },
      lastEntryHash: { type: DataTypes.CHAR(64), allowNull: false, defaultValue: '0'.repeat(64) },
      nextAuditSeq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 1 },
      lastAuditHash: { type: DataTypes.CHAR(64), allowNull: false, defaultValue: '0'.repeat(64) },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'finance_chain', modelName: 'FinanceChain' },
    sequelize
  );

  FinanceCounter.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      name: { type: DataTypes.STRING(40), allowNull: false, primaryKey: true },
      value: minor(0)
    },
    { ...common, tableName: 'finance_counters', modelName: 'FinanceCounter' },
    sequelize
  );

  IdempotencyKey.initModel(
    {
      churchId: { ...churchId, primaryKey: true },
      key: { type: DataTypes.STRING(80), allowNull: false, primaryKey: true },
      method: { type: DataTypes.STRING(10), allowNull: false },
      path: { type: DataTypes.STRING(200), allowNull: false },
      requestHash: { type: DataTypes.CHAR(64), allowNull: false },
      statusCode: { type: DataTypes.INTEGER, allowNull: false },
      response: { type: DataTypes.JSON, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { ...common, tableName: 'idempotency_keys', modelName: 'IdempotencyKey' },
    sequelize
  );

  return {
    Fund,
    Account,
    FiscalYear,
    FiscalPeriod,
    JournalEntry,
    JournalLine,
    LedgerBalance,
    AuditEvent,
    FinanceSettings,
    FinanceChain,
    FinanceCounter,
    IdempotencyKey
  };
};

export default factory;

import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class BankAccount extends BaseModel<any> {}
class BankStatement extends BaseModel<any> {}
class BankStatementLine extends BaseModel<any> {}
class Reconciliation extends BaseModel<any> {}
class BankMatch extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
const int = (allowNull = true) => ({ type: DataTypes.INTEGER, allowNull });
const big = (allowNull = true) => ({ type: DataTypes.BIGINT, allowNull });
const str = (n: number, allowNull = true, defaultValue?: string) => ({ type: DataTypes.STRING(n), allowNull, ...(defaultValue ? { defaultValue } : {}) });
// A fresh object per attribute: Sequelize writes the column name onto the definition it is given.
const ts = () => ({ type: DataTypes.DATE, defaultValue: DataTypes.NOW });

/** Mirrors migration 20260930140000-banking. */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const base = { underscored: true, timestamps: false };
  BankAccount.initModel(
    {
      id, churchId, name: str(120, false), kind: str(14, false), glAccountId: int(false), accountNumber: str(40), currency: str(3, false, 'KES'),
      floatMinor: big(), isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, createdAt: ts(), updatedAt: ts()
    },
    { ...base, tableName: 'bank_accounts', modelName: 'BankAccount', indexes: [{ unique: true, fields: ['church_id', 'gl_account_id'] }, { unique: true, fields: ['church_id', 'name'] }] },
    sequelize
  );
  BankStatement.initModel(
    {
      id, churchId, bankAccountId: int(false), label: str(120), periodStart: { type: DataTypes.DATEONLY, allowNull: true },
      periodEnd: { type: DataTypes.DATEONLY, allowNull: true }, openingBalanceMinor: big(), closingBalanceMinor: big(), source: str(8, false, 'JSON'),
      lineCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, importedBy: int(), importedAt: ts()
    },
    { ...base, tableName: 'bank_statements', modelName: 'BankStatement' },
    sequelize
  );
  Reconciliation.initModel(
    {
      id, churchId, bankAccountId: int(false), statementDate: { type: DataTypes.DATEONLY, allowNull: false }, statementBalanceMinor: big(false),
      openingBalanceMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, status: str(10, false, 'OPEN'), clearedBalanceMinor: big(),
      differenceMinor: big(), createdBy: int(), finalizedBy: int(), finalizedAt: { type: DataTypes.DATE, allowNull: true }, createdAt: ts()
    },
    { ...base, tableName: 'reconciliations', modelName: 'Reconciliation' },
    sequelize
  );
  BankStatementLine.initModel(
    {
      id, churchId, statementId: int(false), bankAccountId: int(false), txnDate: { type: DataTypes.DATEONLY, allowNull: false },
      description: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' }, reference: str(80), amountMinor: big(false), balanceMinor: big(),
      dedupeKey: str(90, false), status: str(10, false, 'UNMATCHED'), ignoreReason: str(300), reconciliationId: int(), createdAt: ts()
    },
    { ...base, tableName: 'bank_statement_lines', modelName: 'BankStatementLine', indexes: [{ unique: true, fields: ['church_id', 'bank_account_id', 'dedupe_key'] }] },
    sequelize
  );
  BankMatch.initModel(
    {
      id, churchId, statementLineId: int(false), journalLineId: int(false), amountMinor: big(false), reconciliationId: int(), matchedBy: int(), matchedAt: ts()
    },
    { ...base, tableName: 'bank_matches', modelName: 'BankMatch', indexes: [{ unique: true, fields: ['church_id', 'journal_line_id'] }] },
    sequelize
  );
  return { BankAccount, BankStatement, BankStatementLine, Reconciliation, BankMatch };
};

export default factory;

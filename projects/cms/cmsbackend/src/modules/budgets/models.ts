import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class Budget extends BaseModel<any> {}
class BudgetLine extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
// A fresh object per attribute: Sequelize writes the column name onto the definition it is given.
const ts = () => ({ type: DataTypes.DATE, defaultValue: DataTypes.NOW });

/** Mirrors migration 20260930150000-budgets. */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const base = { underscored: true, timestamps: false };
  Budget.initModel(
    {
      id, churchId, fiscalYearId: { type: DataTypes.INTEGER, allowNull: false }, name: { type: DataTypes.STRING(120), allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'DRAFT' }, notes: { type: DataTypes.STRING(500), allowNull: true },
      createdBy: { type: DataTypes.INTEGER, allowNull: true }, approvedBy: { type: DataTypes.INTEGER, allowNull: true },
      approvedAt: { type: DataTypes.DATE, allowNull: true }, activatedAt: { type: DataTypes.DATE, allowNull: true }, createdAt: ts(), updatedAt: ts()
    },
    { ...base, tableName: 'budgets', modelName: 'Budget', indexes: [{ unique: true, fields: ['church_id', 'fiscal_year_id', 'name'] }] },
    sequelize
  );
  BudgetLine.initModel(
    {
      id, churchId, budgetId: { type: DataTypes.INTEGER, allowNull: false }, accountId: { type: DataTypes.INTEGER, allowNull: false },
      fundId: { type: DataTypes.INTEGER, allowNull: false }, ministryId: { type: DataTypes.INTEGER, allowNull: true },
      ministryKey: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, month: { type: DataTypes.INTEGER, allowNull: false },
      amountMinor: { type: DataTypes.BIGINT, allowNull: false }
    },
    {
      ...base, tableName: 'budget_lines', modelName: 'BudgetLine',
      indexes: [{ unique: true, fields: ['church_id', 'budget_id', 'account_id', 'fund_id', 'ministry_key', 'month'] }]
    },
    sequelize
  );
  return { Budget, BudgetLine };
};

export default factory;

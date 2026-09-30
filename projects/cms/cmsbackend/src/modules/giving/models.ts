import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class GivingType extends BaseModel<any> {}
class GivingBatch extends BaseModel<any> {}
class GivingCampaign extends BaseModel<any> {}
class Pledge extends BaseModel<any> {}
class RecurringGift extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
// A function: Sequelize writes the resolved column name into the attribute object it is given.
const minor = () => ({ type: DataTypes.BIGINT, allowNull: false });
const stamps = {
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
};

/**
 * Mirrors migration 20260930110000-giving (the migration is the source of truth in production;
 * these definitions exist for typed access and so the in-memory test database can be built).
 * Rows are written with SQL through the services, not through these models.
 */
const factory: ModelFactory = (sequelize: Sequelize) => {
  const common = { underscored: true, timestamps: true };

  GivingType.initModel(
    {
      id,
      churchId,
      code: { type: DataTypes.STRING(20), allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      incomeAccountId: { type: DataTypes.INTEGER, allowNull: false },
      defaultFundId: { type: DataTypes.INTEGER, allowNull: true },
      taxDeductible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      ...stamps
    },
    { ...common, tableName: 'giving_types', modelName: 'GivingType', indexes: [{ unique: true, fields: ['church_id', 'code'] }, { unique: true, fields: ['church_id', 'name'] }] },
    sequelize
  );

  GivingBatch.initModel(
    {
      id,
      churchId,
      batchNo: minor(),
      name: { type: DataTypes.STRING(150), allowNull: false },
      serviceDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'OPEN' },
      depositAccountId: { type: DataTypes.INTEGER, allowNull: false },
      createdBy: { type: DataTypes.INTEGER, allowNull: false },
      countedBy: { type: DataTypes.INTEGER, allowNull: true },
      countedAt: { type: DataTypes.DATE, allowNull: true },
      countedTotalMinor: { type: DataTypes.BIGINT, allowNull: true },
      verifiedBy: { type: DataTypes.INTEGER, allowNull: true },
      postedAt: { type: DataTypes.DATE, allowNull: true },
      journalEntryId: { type: DataTypes.INTEGER, allowNull: true },
      ...stamps
    },
    { ...common, tableName: 'giving_batches', modelName: 'GivingBatch', indexes: [{ unique: true, fields: ['church_id', 'batch_no'] }] },
    sequelize
  );

  GivingCampaign.initModel(
    {
      id,
      churchId,
      name: { type: DataTypes.STRING(150), allowNull: false },
      description: { type: DataTypes.STRING(1000), allowNull: true },
      goalMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      fundId: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      ...stamps
    },
    { ...common, tableName: 'giving_campaigns', modelName: 'GivingCampaign', indexes: [{ unique: true, fields: ['church_id', 'name'] }] },
    sequelize
  );

  Pledge.initModel(
    {
      id,
      churchId,
      memberId: { type: DataTypes.INTEGER, allowNull: false },
      campaignId: { type: DataTypes.INTEGER, allowNull: true },
      givingTypeId: { type: DataTypes.INTEGER, allowNull: true },
      amountMinor: minor(),
      installmentMinor: { type: DataTypes.BIGINT, allowNull: true },
      frequency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ONE_TIME' },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      notes: { type: DataTypes.STRING(500), allowNull: true },
      ...stamps
    },
    { ...common, tableName: 'pledges', modelName: 'Pledge' },
    sequelize
  );

  RecurringGift.initModel(
    {
      id,
      churchId,
      memberId: { type: DataTypes.INTEGER, allowNull: false },
      givingTypeId: { type: DataTypes.INTEGER, allowNull: false },
      fundId: { type: DataTypes.INTEGER, allowNull: true },
      amountMinor: minor(),
      frequency: { type: DataTypes.STRING(10), allowNull: false },
      paymentMethod: { type: DataTypes.STRING(100), allowNull: true },
      depositAccountId: { type: DataTypes.INTEGER, allowNull: true },
      pledgeId: { type: DataTypes.INTEGER, allowNull: true },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: true },
      nextDueDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'ACTIVE' },
      lastGeneratedDate: { type: DataTypes.DATEONLY, allowNull: true },
      ...stamps
    },
    { ...common, tableName: 'recurring_gifts', modelName: 'RecurringGift' },
    sequelize
  );

  return { GivingType, GivingBatch, GivingCampaign, Pledge, RecurringGift };
};

export default factory;

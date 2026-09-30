import { DataTypes, Sequelize } from 'sequelize';
import BaseModel from '../../common/base.model';
import type { ModelFactory } from '../types';

class MpesaTransaction extends BaseModel<any> {}
class MpesaStkRequest extends BaseModel<any> {}

const id = { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true };
const churchId = { type: DataTypes.INTEGER, allowNull: false };
const stamps = {
  createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
};

/** Mirrors migration 20260930120100-mpesa; see the note in giving/models.ts. */
const factory: ModelFactory = (sequelize: Sequelize) => {
  MpesaTransaction.initModel(
    {
      id,
      churchId,
      transId: { type: DataTypes.STRING(40), allowNull: false },
      channel: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'C2B' },
      transType: { type: DataTypes.STRING(40), allowNull: true },
      transTime: { type: DataTypes.DATE, allowNull: true },
      amountMinor: { type: DataTypes.BIGINT, allowNull: false },
      msisdn: { type: DataTypes.STRING(80), allowNull: true },
      msisdnNormalised: { type: DataTypes.STRING(15), allowNull: true },
      billRef: { type: DataTypes.STRING(80), allowNull: true },
      shortcode: { type: DataTypes.STRING(20), allowNull: true },
      payerName: { type: DataTypes.STRING(200), allowNull: true },
      status: { type: DataTypes.STRING(12), allowNull: false },
      memberId: { type: DataTypes.INTEGER, allowNull: true },
      contributionId: { type: DataTypes.INTEGER, allowNull: true },
      fundId: { type: DataTypes.INTEGER, allowNull: true },
      receiptEntryId: { type: DataTypes.INTEGER, allowNull: true },
      allocationEntryId: { type: DataTypes.INTEGER, allowNull: true },
      error: { type: DataTypes.TEXT, allowNull: true },
      raw: { type: DataTypes.JSON, allowNull: true },
      ...stamps
    },
    { underscored: true, timestamps: true, tableName: 'mpesa_transactions', modelName: 'MpesaTransaction', indexes: [{ unique: true, fields: ['church_id', 'trans_id'] }] },
    sequelize
  );

  MpesaStkRequest.initModel(
    {
      id,
      churchId,
      memberId: { type: DataTypes.INTEGER, allowNull: true },
      phone: { type: DataTypes.STRING(15), allowNull: false },
      amountMinor: { type: DataTypes.BIGINT, allowNull: false },
      accountRef: { type: DataTypes.STRING(40), allowNull: false },
      givingTypeId: { type: DataTypes.INTEGER, allowNull: true },
      fundId: { type: DataTypes.INTEGER, allowNull: true },
      status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PENDING' },
      checkoutRequestId: { type: DataTypes.STRING(80), allowNull: true },
      merchantRequestId: { type: DataTypes.STRING(80), allowNull: true },
      resultCode: { type: DataTypes.INTEGER, allowNull: true },
      resultDesc: { type: DataTypes.STRING(300), allowNull: true },
      mpesaReceipt: { type: DataTypes.STRING(40), allowNull: true },
      requestedBy: { type: DataTypes.INTEGER, allowNull: true },
      completedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
    },
    { underscored: true, timestamps: false, tableName: 'mpesa_stk_requests', modelName: 'MpesaStkRequest' },
    sequelize
  );

  return { MpesaTransaction, MpesaStkRequest };
};

export default factory;

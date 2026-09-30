import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface ContributionAttributes {
  churchId: number;
  id: number;
  memberId?: number | null;
  contributorName?: string | null;
  amount: number;  
  date: Date;
  contributionType: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
  notes?: string | null;
  fundId?: number | null;
  givingTypeId?: number | null;
  journalEntryId?: number | null;
  receiptNo?: string | null;
  status?: string;
  voidReason?: string | null;
  voidedAt?: Date | null;
  voidedBy?: number | null;
  depositAccountId?: number | null;
  batchId?: number | null;
  pledgeId?: number | null;
  campaignId?: number | null;
  source?: string;
  isAnonymous?: boolean;
  taxDeductible?: boolean;
  recordedBy?: number | null;
}

export interface ContributionCreationAttributes extends Optional<ContributionAttributes, 
  'id' | 'memberId' | 'contributorName' | 'paymentMethod' | 'transactionId' | 'notes' | 'fundId' | 'givingTypeId' | 'journalEntryId' | 'receiptNo' | 'status' | 'voidReason' | 'voidedAt' | 'voidedBy' | 'depositAccountId' | 'batchId' | 'pledgeId' | 'campaignId' | 'source' | 'isAnonymous' | 'taxDeductible' | 'recordedBy'> {}

export class Contribution extends BaseModel<ContributionAttributes, ContributionCreationAttributes> implements ContributionAttributes {
  public churchId!: number;
  public id!: number;
  public memberId!: number | null;
  public contributorName!: string | null;
  public amount!: number;
  public date!: Date;
  public contributionType!: string;
  public paymentMethod!: string | null;
  public transactionId!: string | null;
  public notes!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Contribution.belongsTo(models.Member, { 
      foreignKey: 'memberId', 
      as: 'member'
    });
  }
}

export default (sequelize: Sequelize) => {
  return Contribution.initModel({
    churchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    memberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    contributorName: { type: DataTypes.STRING(255), allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
    date: {
      type: DataTypes.DATE,
      field: 'contribution_date',
      allowNull: false
    },
    contributionType: { 
      type: DataTypes.STRING(100), 
      allowNull: false,
      defaultValue: 'Offering'
    },
    paymentMethod: { type: DataTypes.STRING(100), allowNull: true },
    transactionId: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    fundId: { type: DataTypes.INTEGER, allowNull: true },
    givingTypeId: { type: DataTypes.INTEGER, allowNull: true },
    journalEntryId: { type: DataTypes.INTEGER, allowNull: true },
    receiptNo: { type: DataTypes.STRING(30), allowNull: true },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'POSTED' },
    voidReason: { type: DataTypes.STRING(300), allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedBy: { type: DataTypes.INTEGER, allowNull: true },
    depositAccountId: { type: DataTypes.INTEGER, allowNull: true },
    batchId: { type: DataTypes.INTEGER, allowNull: true },
    pledgeId: { type: DataTypes.INTEGER, allowNull: true },
    campaignId: { type: DataTypes.INTEGER, allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MANUAL' },
    isAnonymous: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    taxDeductible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recordedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'contribution',
    timestamps: true,
    underscored: true,
    modelName: 'Contribution',
    indexes: [
      { unique: true, fields: ['church_id', 'transaction_id'], name: 'contribution_church_transaction_id_unique' },
      { unique: true, fields: ['church_id', 'receipt_no'], name: 'contribution_church_receipt_no_unique' },
    ],
  }, sequelize);
};
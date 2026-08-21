import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface ContributionAttributes {
  id: number;
  memberId?: number | null;
  contributorName?: string | null;
  amount: number;  
  date: Date;
  contributionType: string;
  paymentMethod?: string | null;
  transactionId?: string | null;
  notes?: string | null;
}

export interface ContributionCreationAttributes extends Optional<ContributionAttributes, 
  'id' | 'memberId' | 'contributorName' | 'paymentMethod' | 'transactionId' | 'notes'> {}

export class Contribution extends BaseModel<ContributionAttributes, ContributionCreationAttributes> implements ContributionAttributes {
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
      as: 'member'                    // ← Changed to 'member' for consistency with frontend
    });
  }
}

export default (sequelize: Sequelize) => {
  return Contribution.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    memberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    contributorName: { type: DataTypes.STRING(255), allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    date: { 
      type: DataTypes.DATE, 
      allowNull: false 
    },
    contributionType: { 
      type: DataTypes.STRING(100), 
      allowNull: false 
    },
    paymentMethod: { type: DataTypes.STRING(100), allowNull: true },
    transactionId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'contribution',
    timestamps: true,
    underscored: true,
    modelName: 'Contribution',
  }, sequelize);
};
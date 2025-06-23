'use strict';

import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { Member } from '../members/member.model';

interface ContributionAttributes {
  id: number;
  memberId?: number | null;
  contributorName?: string | null;
  amount: number;
  contributionDate: Date;
  contributionType: string;
  paymentMethod?: string;
  transactionId?: string;
  notes?: string;
}

interface ContributionCreationAttributes extends Optional<ContributionAttributes,
  'id' | 'memberId' | 'contributorName' | 'paymentMethod' | 'transactionId' | 'notes'
> {}

export class Contribution extends Model<ContributionAttributes, ContributionCreationAttributes> implements ContributionAttributes {
  public id!: number;
  public memberId?: number | null;
  public contributorName?: string | null;
  public amount!: number;
  public contributionDate!: Date;
  public contributionType!: string;
  public paymentMethod?: string;
  public transactionId?: string;
  public notes?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Contribution.belongsTo(models.Member, {
      foreignKey: 'memberId',
      as: 'contributorMember'
    });
  }
}

export function initContribution(sequelize: Sequelize) {
  Contribution.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    memberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    contributorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    contributionDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    contributionType: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'contribution',
    timestamps: true,
    underscored: true,
    modelName: 'Contribution',
  });
}
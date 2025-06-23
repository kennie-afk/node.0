import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

interface MinistryMemberAttributes {
  ministryId: number;
  memberId: number;
  role?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

interface MinistryMemberCreationAttributes extends Optional<MinistryMemberAttributes, 'role' | 'startDate' | 'endDate'> {}

export class MinistryMember extends Model<MinistryMemberAttributes, MinistryMemberCreationAttributes> implements MinistryMemberAttributes {
  public ministryId!: number;
  public memberId!: number;
  public role?: string | null;
  public startDate?: Date | null;
  public endDate?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {}
}

export function initMinistryMember(sequelize: Sequelize) {
  MinistryMember.init({
    ministryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'ministries',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    memberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'members',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    role: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'Member',
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'ministry_members',
    timestamps: true,
    underscored: true,
    modelName: 'MinistryMember',
  });
}
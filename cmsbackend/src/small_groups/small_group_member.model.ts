import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

interface SmallGroupMemberAttributes {
  smallGroupId: number;
  memberId: number;
  role?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}

interface SmallGroupMemberCreationAttributes extends Optional<SmallGroupMemberAttributes, 'role' | 'startDate' | 'endDate'> {}

export class SmallGroupMember extends Model<SmallGroupMemberAttributes, SmallGroupMemberCreationAttributes> implements SmallGroupMemberAttributes {
  public smallGroupId!: number;
  public memberId!: number;
  public role?: string | null;
  public startDate?: Date | null;
  public endDate?: Date | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {}
}

export function initSmallGroupMember(sequelize: Sequelize) {
  SmallGroupMember.init({
    smallGroupId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'small_groups',
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
    tableName: 'small_group_members',
    timestamps: true,
    underscored: true,
    modelName: 'SmallGroupMember',
  });
}
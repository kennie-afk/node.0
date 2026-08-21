import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface SmallGroupAttributes {
  id: number;
  name: string;
  description?: string | null;
  ministryId: number;
  leaderId?: number | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  isActive: boolean;
}

export interface SmallGroupCreationAttributes extends Optional<SmallGroupAttributes, 'id' | 'description' | 'leaderId' | 'meetingDay' | 'meetingTime' | 'meetingLocation' | 'isActive'> {}

export class SmallGroup extends BaseModel<SmallGroupAttributes, SmallGroupCreationAttributes> implements SmallGroupAttributes {
  public id!: number;
  public name!: string;
  public description!: string | null;
  public ministryId!: number;
  public leaderId!: number | null;
  public meetingDay!: string | null;
  public meetingTime!: string | null;
  public meetingLocation!: string | null;
  public isActive!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    SmallGroup.belongsTo(models.Ministry, { foreignKey: 'ministryId', as: 'parentMinistry' });
    SmallGroup.belongsTo(models.Member, { foreignKey: 'leaderId', as: 'leader' });
    SmallGroup.belongsToMany(models.Member, { through: models.SmallGroupMember, foreignKey: 'smallGroupId', as: 'members' });
  }
}

export default (sequelize: Sequelize) => {
  return SmallGroup.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    ministryId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    leaderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    meetingDay: { type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), allowNull: true },
    meetingTime: { type: DataTypes.STRING(5), allowNull: true },
    meetingLocation: { type: DataTypes.STRING(255), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'small_groups',
    timestamps: true,
    underscored: true,
    modelName: 'SmallGroup',
  }, sequelize);
};
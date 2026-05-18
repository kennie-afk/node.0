import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface MinistryAttributes {
  id: number;
  name: string;
  description?: string | null;
  leaderId?: number | null;
  isActive: boolean;
}

export interface MinistryCreationAttributes extends Optional<MinistryAttributes, 'id' | 'description' | 'leaderId' | 'isActive'> {}

export class Ministry extends BaseModel<MinistryAttributes, MinistryCreationAttributes> implements MinistryAttributes {
  public id!: number;
  public name!: string;
  public description!: string | null;
  public leaderId!: number | null;
  public isActive!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Ministry.belongsTo(models.Member, { foreignKey: 'leaderId', as: 'leader' });
    Ministry.belongsToMany(models.Member, { through: models.MinistryMember, foreignKey: 'ministryId', as: 'members' });
    Ministry.hasMany(models.SmallGroup, { foreignKey: 'ministryId', as: 'smallGroups' });
  }
}

export default (sequelize: Sequelize) => {
  return Ministry.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    leaderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, {
    tableName: 'ministries',
    timestamps: true,
    underscored: true,
    modelName: 'Ministry',
  }, sequelize);
};
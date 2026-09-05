import { DataTypes, Optional, Sequelize } from 'sequelize';
import BaseModel from '../common/base.model';

export interface ChurchAttributes {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  isActive: boolean;
}

export interface ChurchCreationAttributes
  extends Optional<ChurchAttributes, 'id' | 'timezone' | 'isActive'> {}

export class Church
  extends BaseModel<ChurchAttributes, ChurchCreationAttributes>
  implements ChurchAttributes
{
  public id!: number;
  public name!: string;
  public slug!: string;
  public timezone!: string;
  public isActive!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Church.hasMany(models.User, { foreignKey: 'churchId', as: 'users' });
    Church.hasMany(models.Member, { foreignKey: 'churchId', as: 'members' });
    Church.hasMany(models.Family, { foreignKey: 'churchId', as: 'families' });
  }
}

export default (sequelize: Sequelize) => {
  return Church.initModel(
    {
      id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
      name: { type: DataTypes.STRING(150), allowNull: false },
      slug: {
        type: DataTypes.STRING(80),
        allowNull: false,
        unique: true,
        validate: { is: /^[a-z0-9-]+$/ }
      },
      timezone: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Africa/Nairobi' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    },
    {
      tableName: 'churches',
      timestamps: true,
      underscored: true,
      modelName: 'Church'
    },
    sequelize
  );
};

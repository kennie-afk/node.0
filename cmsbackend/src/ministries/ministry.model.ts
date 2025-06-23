import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { Member } from '../members/member.model';
import { SmallGroup } from '../small_groups/small_group.model';
import { MinistryMember } from './ministry_member.model';

interface MinistryAttributes {
  id: number;
  name: string;
  description?: string | null;
  leaderId?: number | null;
  isActive: boolean;
  members?: Member[];
}

interface MinistryCreationAttributes extends Optional<MinistryAttributes, 'id' | 'description' | 'leaderId' | 'isActive'> {}

export class Ministry extends Model<MinistryAttributes, MinistryCreationAttributes> implements MinistryAttributes {
  public id!: number;
  public name!: string;
  public description?: string | null;
  public leaderId?: number | null;
  public isActive!: boolean;
  public members?: Member[];

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Ministry.belongsTo(models.Member, {
      foreignKey: 'leaderId',
      as: 'leader'
    });
    models.Ministry.belongsToMany(models.Member, {
      through: models.MinistryMember,
      foreignKey: 'ministryId',
      as: 'members'
    });
    models.Ministry.hasMany(models.SmallGroup, {
      foreignKey: 'ministryId',
      as: 'smallGroups'
    });
  }
}

export function initMinistry(sequelize: Sequelize) {
  Ministry.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    leaderId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    sequelize,
    tableName: 'ministries',
    timestamps: true,
    underscored: true,
    modelName: 'Ministry',
  });
}
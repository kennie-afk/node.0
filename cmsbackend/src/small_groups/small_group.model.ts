import { DataTypes, Model, Optional, Sequelize } from 'sequelize';
import { Ministry } from '../ministries/ministry.model';
import { Member } from '../members/member.model';
import { SmallGroupMember } from './small_group_member.model';

interface SmallGroupAttributes {
  id: number;
  name: string;
  description?: string | null;
  ministryId: number;
  leaderId?: number | null;
  meetingDay?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | null;
  meetingTime?: string | null;
  meetingLocation?: string | null;
  isActive: boolean;
  members?: Member[];
}

interface SmallGroupCreationAttributes extends Optional<SmallGroupAttributes, 'id' | 'description' | 'leaderId' | 'meetingDay' | 'meetingTime' | 'meetingLocation' | 'isActive'> {}

export class SmallGroup extends Model<SmallGroupAttributes, SmallGroupCreationAttributes> implements SmallGroupAttributes {
  public id!: number;
  public name!: string;
  public description?: string | null;
  public ministryId!: number;
  public leaderId?: number | null;
  public meetingDay?: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday' | null;
  public meetingTime?: string | null;
  public meetingLocation?: string | null;
  public isActive!: boolean;
  public members?: Member[];

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.SmallGroup.belongsTo(models.Ministry, {
      foreignKey: 'ministryId',
      as: 'parentMinistry'
    });
    models.SmallGroup.belongsTo(models.Member, {
      foreignKey: 'leaderId',
      as: 'leader'
    });
    models.SmallGroup.belongsToMany(models.Member, {
      through: models.SmallGroupMember,
      foreignKey: 'smallGroupId',
      as: 'members'
    });
  }
}

export function initSmallGroup(sequelize: Sequelize) {
  SmallGroup.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ministryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    leaderId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    meetingDay: {
      type: DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
      allowNull: true,
    },
    meetingTime: {
      type: DataTypes.STRING(5),
      allowNull: true,
    },
    meetingLocation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  }, {
    sequelize,
    tableName: 'small_groups',
    timestamps: true,
    underscored: true,
    modelName: 'SmallGroup',
    indexes: [
      {
        unique: true,
        fields: ['name', 'ministry_id'],
      }
    ]
  });
}
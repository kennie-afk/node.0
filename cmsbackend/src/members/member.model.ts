import { DataTypes, Model, Optional } from 'sequelize';
import { Sequelize } from 'sequelize';
import { Family } from '../families/family.model';
import { Sermon } from '../sermons/sermon.model';
import { Ministry } from '../ministries/ministry.model';
import { MinistryMember } from '../ministries/ministry_member.model';
import { SmallGroup } from '../small_groups/small_group.model';
import { SmallGroupMember } from '../small_groups/small_group_member.model';
import { Contribution } from '../contributions/contribution.model';


interface MemberAttributes {
  id: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: Date;
  email?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  status?: 'Active' | 'Inactive' | 'New Convert' | 'Deceased' | 'Guest';
  baptismDate?: Date;
  membershipDate?: Date;
  familyId?: number;
  profilePictureUrl?: string;
  notes?: string;
}

interface MemberCreationAttributes extends Optional<MemberAttributes, 'id' | 'familyId' | 'status' | 'baptismDate'> {}

export class Member extends Model<MemberAttributes, MemberCreationAttributes> implements MemberAttributes {
  public id!: number;
  public firstName!: string;
  public lastName!: string;
  public middleName?: string;
  public gender?: 'Male' | 'Female' | 'Other';
  public dateOfBirth?: Date;
  public email?: string;
  public phoneNumber?: string;
  public address?: string;
  public city?: string;
  public county?: string;
  public postalCode?: string;
  public status?: 'Active' | 'Inactive' | 'New Convert' | 'Deceased' | 'Guest';
  public baptismDate?: Date;
  public membershipDate!: Date;
  public familyId?: number;
  public profilePictureUrl?: string;
  public notes?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Member.belongsTo(models.Family, {
      foreignKey: 'familyId',
      as: 'family'
    });

    models.Member.hasMany(models.Sermon, {
      foreignKey: 'speakerMemberId',
      as: 'sermons'
    });

    models.Member.belongsToMany(models.Ministry, {
      through: models.MinistryMember,
      foreignKey: 'memberId',
      as: 'ministries'
    });

    models.Member.belongsToMany(models.SmallGroup, {
      through: models.SmallGroupMember,
      foreignKey: 'memberId',
      as: 'smallGroups'
    });

    models.Member.hasMany(models.Ministry, {
      foreignKey: 'leaderId',
      as: 'ledMinistries'
    });

    models.Member.hasMany(models.Contribution, {
      foreignKey: 'memberId',
      as: 'contributions'
    });
  }
}

export function initMember(sequelize: Sequelize) {
  Member.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    middleName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM('Male', 'Female', 'Other'),
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    county: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    postalCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'),
      allowNull: false,
      defaultValue: 'Active',
    },
    baptismDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    membershipDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    familyId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    profilePictureUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'members',
    timestamps: true,
    underscored: true,
    modelName: 'Member',
  });
}
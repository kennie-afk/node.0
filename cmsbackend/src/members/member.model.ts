import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface MemberAttributes {
  id: number;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  gender?: 'Male' | 'Female' | 'Other';
  dateOfBirth?: Date | null;
  email?: string | null;
  phoneNumber?: string | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  postalCode?: string | null;
  status: string;
  baptismDate?: Date | null;
  membershipDate: Date;
  familyId?: number | null;
  profilePictureUrl?: string | null;
  notes?: string | null;
}

export interface MemberCreationAttributes extends Optional<MemberAttributes, 'id' | 'middleName' | 'gender' | 'dateOfBirth' | 'email' | 'phoneNumber' | 'address' | 'city' | 'county' | 'postalCode' | 'baptismDate' | 'familyId' | 'profilePictureUrl' | 'notes'> {}

export class Member extends BaseModel<MemberAttributes, MemberCreationAttributes> implements MemberAttributes {
  public id!: number;
  public firstName!: string;
  public lastName!: string;
  public middleName!: string | null;
  public gender!: 'Male' | 'Female' | 'Other';
  public dateOfBirth!: Date | null;
  public email!: string | null;
  public phoneNumber!: string | null;
  public address!: string | null;
  public city!: string | null;
  public county!: string | null;
  public postalCode!: string | null;
  public status!: string;
  public baptismDate!: Date | null;
  public membershipDate!: Date;
  public familyId!: number | null;
  public profilePictureUrl!: string | null;
  public notes!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Member.belongsTo(models.Family, { foreignKey: 'familyId', as: 'family' });
    Member.hasMany(models.Sermon, { foreignKey: 'speakerMemberId', as: 'sermons' });
    Member.belongsToMany(models.Ministry, { through: models.MinistryMember, foreignKey: 'memberId', as: 'ministries' });
    Member.belongsToMany(models.SmallGroup, { through: models.SmallGroupMember, foreignKey: 'memberId', as: 'smallGroups' });
    Member.hasMany(models.Ministry, { foreignKey: 'leaderId', as: 'ledMinistries' });
    Member.hasMany(models.Contribution, { foreignKey: 'memberId', as: 'contributions' });
  }
}

export default (sequelize: Sequelize) => {
  return Member.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    firstName: { type: DataTypes.STRING(100), allowNull: false },
    lastName: { type: DataTypes.STRING(100), allowNull: false },
    middleName: { type: DataTypes.STRING(100), allowNull: true },
    gender: { type: DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: true },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: true },
    email: { type: DataTypes.STRING(100), allowNull: true, unique: true, validate: { isEmail: true } },
    phoneNumber: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    county: { type: DataTypes.STRING(100), allowNull: true },
    postalCode: { type: DataTypes.STRING(20), allowNull: true },
    status: { type: DataTypes.ENUM('Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'), allowNull: false, defaultValue: 'Active' },
    baptismDate: { type: DataTypes.DATEONLY, allowNull: true },
    membershipDate: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    familyId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    profilePictureUrl: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'members',
    timestamps: true,
    underscored: true,
    modelName: 'Member',
  }, sequelize);
};
import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface FamilyAttributes {
  id: number;
  familyName: string;
  headOfFamilyMemberId?: number | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface FamilyCreationAttributes extends Optional<FamilyAttributes, 'id' | 'headOfFamilyMemberId'> {}

export class Family extends BaseModel<FamilyAttributes, FamilyCreationAttributes> implements FamilyAttributes {
  public id!: number;
  public familyName!: string;
  public headOfFamilyMemberId!: number | null;
  public address!: string | null;
  public city!: string | null;
  public county!: string | null;
  public postalCode!: string | null;
  public phoneNumber!: string | null;
  public email!: string | null;
  public notes!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Family.hasMany(models.Member, { foreignKey: 'familyId', as: 'members' });
    Family.belongsTo(models.Member, { foreignKey: 'headOfFamilyMemberId', as: 'headOfFamily' });
  }
}

export default (sequelize: Sequelize) => {
  return Family.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    familyName: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    headOfFamilyMemberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    address: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    county: { type: DataTypes.STRING(100), allowNull: true },
    postalCode: { type: DataTypes.STRING(20), allowNull: true },
    phoneNumber: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: true, unique: true, validate: { isEmail: true } },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'families',
    timestamps: true,
    underscored: true,
    modelName: 'Family',
  }, sequelize);
};
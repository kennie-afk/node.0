import { DataTypes, Model, Optional } from 'sequelize';
import { Sequelize } from 'sequelize';
import { Member } from '../members/member.model'; 

interface FamilyAttributes {
  id: number;
  familyName: string;
  headOfFamilyMemberId?: number;
  address?: string;
  city?: string;
  county?: string;
  postalCode?: string;
  phoneNumber?: string;
  email?: string;
  notes?: string;
}

interface FamilyCreationAttributes extends Optional<FamilyAttributes, 'id' | 'headOfFamilyMemberId'> {}

export class Family extends Model<FamilyAttributes, FamilyCreationAttributes> implements FamilyAttributes {
  public id!: number;
  public familyName!: string;
  public headOfFamilyMemberId?: number;
  public address?: string;
  public city?: string;
  public county?: string;
  public postalCode?: string;
  public phoneNumber?: string;
  public email?: string;
  public notes?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Family.hasMany(models.Member, {
      foreignKey: 'familyId',
      as: 'members'
    });

    models.Family.belongsTo(models.Member, {
      foreignKey: 'headOfFamilyMemberId',
      as: 'headOfFamily'
    });
  }
}

export function initFamily(sequelize: Sequelize) {
  Family.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    familyName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    headOfFamilyMemberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
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
    phoneNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'families',
    timestamps: true,
    underscored: true,
    modelName: 'Family',
  });
}
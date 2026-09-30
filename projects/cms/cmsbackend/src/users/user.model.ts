import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface UserAttributes {
  churchId: number;
  id: number;
  username: string;
  email: string;
  password_hash: string;
  isAdmin: boolean;
  role: string;
  memberId?: number | null;
}

export interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'isAdmin' | 'role' | 'memberId'> {}

export class User extends BaseModel<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public churchId!: number;
  public id!: number;
  public username!: string;
  public email!: string;
  public password_hash!: string;
  public isAdmin!: boolean;
  public role!: string;
  public memberId!: number | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    User.hasMany(models.Event, { foreignKey: 'organizerUserId', as: 'organizedEvents' });
    User.hasMany(models.Announcement, { foreignKey: 'authorUserId', as: 'authoredAnnouncements' });
  }
}

export default (sequelize: Sequelize) => {
  return User.initModel({
    churchId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(50), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true, validate: { isEmail: true } },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    role: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'MEMBER' },
    memberId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    modelName: 'User',
    indexes: [
    { unique: true, fields: ['church_id', 'username'], name: 'users_church_username_unique' }
    ],
  }, sequelize);
};
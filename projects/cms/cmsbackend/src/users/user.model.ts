import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface UserAttributes {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  isAdmin: boolean;
}

export interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'isAdmin'> {}

export class User extends BaseModel<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public username!: string;
  public email!: string;
  public password_hash!: string;
  public isAdmin!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    User.hasMany(models.Event, { foreignKey: 'organizerUserId', as: 'organizedEvents' });
    User.hasMany(models.Announcement, { foreignKey: 'authorUserId', as: 'authoredAnnouncements' });
  }
}

export default (sequelize: Sequelize) => {
  return User.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true, validate: { isEmail: true } },
    password_hash: { type: DataTypes.STRING(255), allowNull: false },
    isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  }, {
    tableName: 'users',
    timestamps: true,
    underscored: true,
    modelName: 'User',
  }, sequelize);
};
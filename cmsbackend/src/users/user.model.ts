import { DataTypes, Model, Optional } from "sequelize";
import { Sequelize } from "sequelize";

export interface UserAttributes {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  isAdmin: boolean;
}

export interface UserCreationAttributes extends Optional <UserAttributes, 'id' | 'isAdmin'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public username!: string;
  public email!: string;
  public password_hash!: string;
  public isAdmin!: boolean;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    console.log('DEBUG: In User.associate method');
    console.log('DEBUG: models.Event:', models.Event);
    console.log('DEBUG: models.Announcement:', models.Announcement);
    console.log('DEBUG: Is models.Event a Sequelize Model subclass?', models.Event && models.Event.prototype instanceof Model);
    console.log('DEBUG: Is models.Announcement a Sequelize Model subclass?', models.Announcement && models.Announcement.prototype instanceof Model);
    models.User.hasMany(models.Event, {
      foreignKey: 'organizerUserId',
      as: 'organizedEvents'
    });

    models.User.hasMany(models.Announcement, {
      foreignKey: 'authorUserId',
      as: 'authoredAnnouncements'
    });
  }
}

export function initUser (sequelize: Sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: true
        }
      },
      password_hash: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      isAdmin: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    }, {
      sequelize,
      tableName: 'users',
      timestamps: true,
      underscored: true,
      modelName: 'User',
    }
  );
}
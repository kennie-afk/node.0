"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
exports.initUser = initUser;
const sequelize_1 = require("sequelize");
class User extends sequelize_1.Model {
    static associate(models) {
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
exports.User = User;
function initUser(sequelize) {
    User.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        username: {
            type: sequelize_1.DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        email: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        password_hash: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        isAdmin: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        tableName: 'users',
        timestamps: true,
        underscored: true,
        modelName: 'User',
    });
}

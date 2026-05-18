"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class User extends base_model_1.default {
    static associate(models) {
        User.hasMany(models.Event, { foreignKey: 'organizerUserId', as: 'organizedEvents' });
        User.hasMany(models.Announcement, { foreignKey: 'authorUserId', as: 'authoredAnnouncements' });
    }
}
exports.User = User;
exports.default = (sequelize) => {
    return User.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        username: { type: sequelize_1.DataTypes.STRING(50), allowNull: false, unique: true },
        email: { type: sequelize_1.DataTypes.STRING(100), allowNull: false, unique: true, validate: { isEmail: true } },
        password_hash: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        isAdmin: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    }, {
        tableName: 'users',
        timestamps: true,
        underscored: true,
        modelName: 'User',
    }, sequelize);
};

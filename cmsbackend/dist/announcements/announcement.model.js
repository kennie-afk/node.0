"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Announcement = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Announcement extends base_model_1.default {
    static associate(models) {
        Announcement.belongsTo(models.User, { foreignKey: 'authorUserId', as: 'author' });
    }
}
exports.Announcement = Announcement;
exports.default = (sequelize) => {
    return Announcement.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        title: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        content: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
        authorUserId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: false },
        publicationDate: { type: sequelize_1.DataTypes.DATE, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
        expiryDate: { type: sequelize_1.DataTypes.DATE, allowNull: true },
        isPublished: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        targetAudience: { type: sequelize_1.DataTypes.ENUM('All', 'Members', 'Leaders', 'Specific Group'), allowNull: true, defaultValue: 'All' },
    }, {
        tableName: 'announcements',
        timestamps: true,
        underscored: true,
        modelName: 'Announcement',
    }, sequelize);
};

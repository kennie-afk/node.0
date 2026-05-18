"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ministry = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Ministry extends base_model_1.default {
    static associate(models) {
        Ministry.belongsTo(models.Member, { foreignKey: 'leaderId', as: 'leader' });
        Ministry.belongsToMany(models.Member, { through: models.MinistryMember, foreignKey: 'ministryId', as: 'members' });
        Ministry.hasMany(models.SmallGroup, { foreignKey: 'ministryId', as: 'smallGroups' });
    }
}
exports.Ministry = Ministry;
exports.default = (sequelize) => {
    return Ministry.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false, unique: true },
        description: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
        leaderId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        isActive: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    }, {
        tableName: 'ministries',
        timestamps: true,
        underscored: true,
        modelName: 'Ministry',
    }, sequelize);
};

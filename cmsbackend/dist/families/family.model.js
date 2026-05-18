"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Family = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Family extends base_model_1.default {
    static associate(models) {
        Family.hasMany(models.Member, { foreignKey: 'familyId', as: 'members' });
        Family.belongsTo(models.Member, { foreignKey: 'headOfFamilyMemberId', as: 'headOfFamily' });
    }
}
exports.Family = Family;
exports.default = (sequelize) => {
    return Family.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        familyName: { type: sequelize_1.DataTypes.STRING(100), allowNull: false, unique: true },
        headOfFamilyMemberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        address: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        city: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        county: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        postalCode: { type: sequelize_1.DataTypes.STRING(20), allowNull: true },
        phoneNumber: { type: sequelize_1.DataTypes.STRING(20), allowNull: true, unique: true },
        email: { type: sequelize_1.DataTypes.STRING(100), allowNull: true, unique: true, validate: { isEmail: true } },
        notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'families',
        timestamps: true,
        underscored: true,
        modelName: 'Family',
    }, sequelize);
};

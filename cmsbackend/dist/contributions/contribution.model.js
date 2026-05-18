"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contribution = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Contribution extends base_model_1.default {
    static associate(models) {
        Contribution.belongsTo(models.Member, {
            foreignKey: 'memberId',
            as: 'member' // ← Changed to 'member' for consistency with frontend
        });
    }
}
exports.Contribution = Contribution;
exports.default = (sequelize) => {
    return Contribution.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        memberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        contributorName: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        amount: { type: sequelize_1.DataTypes.DECIMAL(10, 2), allowNull: false },
        date: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false
        },
        contributionType: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false
        },
        paymentMethod: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        transactionId: { type: sequelize_1.DataTypes.STRING(255), allowNull: true, unique: true },
        notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'contribution',
        timestamps: true,
        underscored: true,
        modelName: 'Contribution',
    }, sequelize);
};

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallGroup = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class SmallGroup extends base_model_1.default {
    static associate(models) {
        SmallGroup.belongsTo(models.Ministry, { foreignKey: 'ministryId', as: 'parentMinistry' });
        SmallGroup.belongsTo(models.Member, { foreignKey: 'leaderId', as: 'leader' });
        SmallGroup.belongsToMany(models.Member, { through: models.SmallGroupMember, foreignKey: 'smallGroupId', as: 'members' });
    }
}
exports.SmallGroup = SmallGroup;
exports.default = (sequelize) => {
    return SmallGroup.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        description: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
        ministryId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: false },
        leaderId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        meetingDay: { type: sequelize_1.DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'), allowNull: true },
        meetingTime: { type: sequelize_1.DataTypes.STRING(5), allowNull: true },
        meetingLocation: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        isActive: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    }, {
        tableName: 'small_groups',
        timestamps: true,
        underscored: true,
        modelName: 'SmallGroup',
    }, sequelize);
};

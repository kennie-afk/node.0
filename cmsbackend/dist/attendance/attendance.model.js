"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attendance = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Attendance extends base_model_1.default {
    static associate(models) {
        Attendance.belongsTo(models.Member, { foreignKey: 'memberId', as: 'attendeeMember' });
        Attendance.belongsTo(models.Event, { foreignKey: 'eventId', as: 'attendedEvent' });
        Attendance.belongsTo(models.Sermon, { foreignKey: 'sermonId', as: 'attendedSermon' });
    }
}
exports.Attendance = Attendance;
exports.default = (sequelize) => {
    return Attendance.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        memberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        guestName: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        attendanceDate: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
        eventId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        sermonId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        attendanceType: { type: sequelize_1.DataTypes.ENUM('In-person', 'Online', 'Other'), allowNull: false, defaultValue: 'In-person' },
        notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'attendance',
        timestamps: true,
        underscored: true,
        modelName: 'Attendance',
    }, sequelize);
};

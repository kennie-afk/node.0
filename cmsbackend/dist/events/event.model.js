"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Event extends base_model_1.default {
    static associate(models) {
        Event.belongsTo(models.User, { foreignKey: 'organizerUserId', as: 'organizer' });
        Event.hasOne(models.Sermon, { foreignKey: 'eventId', as: 'sermon' });
    }
}
exports.Event = Event;
exports.default = (sequelize) => {
    return Event.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        name: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        description: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
        type: { type: sequelize_1.DataTypes.ENUM('Service', 'Meeting', 'Outreach', 'Conference', 'Other'), allowNull: true, defaultValue: 'Service' },
        startTime: { type: sequelize_1.DataTypes.DATE, allowNull: false },
        endTime: { type: sequelize_1.DataTypes.DATE, allowNull: true },
        location: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        organizerUserId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        isRecurring: { type: sequelize_1.DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        recurrencePattern: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
    }, {
        tableName: 'events',
        timestamps: true,
        underscored: true,
        modelName: 'Event',
    }, sequelize);
};

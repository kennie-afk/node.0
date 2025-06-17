"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
exports.initEvent = initEvent;
const sequelize_1 = require("sequelize");
class Event extends sequelize_1.Model {
    static associate(models) {
        models.Event.belongsTo(models.User, {
            foreignKey: 'organizerUserId',
            as: 'organizer'
        });
        models.Event.hasOne(models.Sermon, {
            foreignKey: 'eventId',
            as: 'sermon'
        });
    }
}
exports.Event = Event;
function initEvent(sequelize) {
    Event.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
        type: {
            type: sequelize_1.DataTypes.ENUM('Service', 'Meeting', 'Outreach', 'Conference', 'Other'),
            allowNull: true,
            defaultValue: 'Service',
        },
        startTime: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
        },
        endTime: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true,
        },
        location: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        organizerUserId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        isRecurring: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        recurrencePattern: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'events',
        timestamps: true,
        underscored: true,
        modelName: 'Event',
    });
}

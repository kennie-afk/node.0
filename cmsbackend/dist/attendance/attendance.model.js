'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Attendance = void 0;
exports.initAttendance = initAttendance;
const sequelize_1 = require("sequelize");
class Attendance extends sequelize_1.Model {
    static associate(models) {
        models.Attendance.belongsTo(models.Member, {
            foreignKey: 'memberId',
            as: 'attendeeMember'
        });
        models.Attendance.belongsTo(models.Event, {
            foreignKey: 'eventId',
            as: 'attendedEvent'
        });
        models.Attendance.belongsTo(models.Sermon, {
            foreignKey: 'sermonId',
            as: 'attendedSermon'
        });
    }
}
exports.Attendance = Attendance;
function initAttendance(sequelize) {
    Attendance.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        memberId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        guestName: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        attendanceDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: false,
        },
        eventId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        sermonId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        attendanceType: {
            type: sequelize_1.DataTypes.ENUM('In-person', 'Online', 'Other'),
            allowNull: false,
            defaultValue: 'In-person',
        },
        notes: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'attendance',
        timestamps: true,
        underscored: true,
        modelName: 'Attendance',
        indexes: [
            {
                unique: true,
                fields: ['member_id', 'event_id', 'attendance_date'],
                where: {
                    member_id: {
                        [sequelize_1.Op.ne]: null
                    }
                }
            },
            {
                unique: true,
                fields: ['guest_name', 'event_id', 'attendance_date'],
                where: {
                    guest_name: {
                        [sequelize_1.Op.ne]: null
                    }
                }
            },
            {
                unique: true,
                fields: ['member_id', 'sermon_id', 'attendance_date'],
                where: {
                    member_id: {
                        [sequelize_1.Op.ne]: null
                    }
                }
            },
            {
                unique: true,
                fields: ['guest_name', 'sermon_id', 'attendance_date'],
                where: {
                    guest_name: {
                        [sequelize_1.Op.ne]: null
                    }
                }
            }
        ]
    });
}

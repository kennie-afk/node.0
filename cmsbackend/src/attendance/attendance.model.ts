'use strict';

import { DataTypes, Model, Optional, Sequelize, Op } from 'sequelize';
import { Member } from '../members/member.model';
import { Event } from '../events/event.model';
import { Sermon } from '../sermons/sermon.model';

interface AttendanceAttributes {
  id: number;
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate: Date;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType: 'In-person' | 'Online' | 'Other';
  notes?: string | null;
}

interface AttendanceCreationAttributes extends Optional<AttendanceAttributes,
  'id' | 'memberId' | 'guestName' | 'eventId' | 'sermonId' | 'notes'
> {}

export class Attendance extends Model<AttendanceAttributes, AttendanceCreationAttributes> implements AttendanceAttributes {
  public id!: number;
  public memberId?: number | null;
  public guestName?: string | null;
  public attendanceDate!: Date;
  public eventId?: number | null;
  public sermonId?: number | null;
  public attendanceType!: 'In-person' | 'Online' | 'Other';
  public notes?: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
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

export function initAttendance(sequelize: Sequelize) {
  Attendance.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    memberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    guestName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    attendanceDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    eventId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    sermonId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    attendanceType: {
      type: DataTypes.ENUM('In-person', 'Online', 'Other'),
      allowNull: false,
      defaultValue: 'In-person',
    },
    notes: {
      type: DataTypes.TEXT,
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
            [Op.ne]: null
          }
        }
      },
      {
        unique: true,
        fields: ['guest_name', 'event_id', 'attendance_date'],
        where: {
          guest_name: {
            [Op.ne]: null
          }
        }
      },
      {
        unique: true,
        fields: ['member_id', 'sermon_id', 'attendance_date'],
        where: {
          member_id: {
            [Op.ne]: null
          }
        }
      },
      {
        unique: true,
        fields: ['guest_name', 'sermon_id', 'attendance_date'],
        where: {
          guest_name: {
            [Op.ne]: null
          }
        }
      }
    ]
  });
}
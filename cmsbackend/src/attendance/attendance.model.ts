import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface AttendanceAttributes {
  id: number;
  memberId?: number | null;
  guestName?: string | null;
  attendanceDate: Date;
  eventId?: number | null;
  sermonId?: number | null;
  attendanceType: string;
  notes?: string | null;
}

export interface AttendanceCreationAttributes extends Optional<AttendanceAttributes, 'id' | 'memberId' | 'guestName' | 'eventId' | 'sermonId' | 'notes'> {}

export class Attendance extends BaseModel<AttendanceAttributes, AttendanceCreationAttributes> implements AttendanceAttributes {
  public id!: number;
  public memberId!: number | null;
  public guestName!: string | null;
  public attendanceDate!: Date;
  public eventId!: number | null;
  public sermonId!: number | null;
  public attendanceType!: string;
  public notes!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Attendance.belongsTo(models.Member, { foreignKey: 'memberId', as: 'attendeeMember' });
    Attendance.belongsTo(models.Event, { foreignKey: 'eventId', as: 'attendedEvent' });
    Attendance.belongsTo(models.Sermon, { foreignKey: 'sermonId', as: 'attendedSermon' });
  }
}

export default (sequelize: Sequelize) => {
  return Attendance.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    memberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    guestName: { type: DataTypes.STRING(255), allowNull: true },
    attendanceDate: { type: DataTypes.DATEONLY, allowNull: false },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    sermonId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    attendanceType: { type: DataTypes.ENUM('In-person', 'Online', 'Other'), allowNull: false, defaultValue: 'In-person' },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'attendance',
    timestamps: true,
    underscored: true,
    modelName: 'Attendance',
  }, sequelize);
};
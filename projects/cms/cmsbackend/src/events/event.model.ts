import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface EventAttributes {
  id: number;
  name: string;
  description?: string | null;
  type?: string;
  startTime: Date;
  endTime?: Date | null;
  location?: string | null;
  organizerUserId?: number | null;
  isRecurring: boolean;
  recurrencePattern?: string | null;
}

export interface EventCreationAttributes extends Optional<EventAttributes, 'id' | 'description' | 'endTime' | 'location' | 'organizerUserId' | 'recurrencePattern'> {}

export class Event extends BaseModel<EventAttributes, EventCreationAttributes> implements EventAttributes {
  public id!: number;
  public name!: string;
  public description!: string | null;
  public type!: string;
  public startTime!: Date;
  public endTime!: Date | null;
  public location!: string | null;
  public organizerUserId!: number | null;
  public isRecurring!: boolean;
  public recurrencePattern!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Event.belongsTo(models.User, { foreignKey: 'organizerUserId', as: 'organizer' });
    Event.hasOne(models.Sermon, { foreignKey: 'eventId', as: 'sermon' });
  }
}

export default (sequelize: Sequelize) => {
  return Event.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    type: { type: DataTypes.ENUM('Service', 'Meeting', 'Outreach', 'Conference', 'Other'), allowNull: true, defaultValue: 'Service' },
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: { type: DataTypes.DATE, allowNull: true },
    location: { type: DataTypes.STRING(255), allowNull: true },
    organizerUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    isRecurring: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    recurrencePattern: { type: DataTypes.STRING(255), allowNull: true },
  }, {
    tableName: 'events',
    timestamps: true,
    underscored: true,
    modelName: 'Event',
  }, sequelize);
};
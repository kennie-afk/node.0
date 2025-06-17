import { DataTypes, Model, Optional } from 'sequelize';
import { Sequelize } from 'sequelize';
import { User } from '../users/user.model'; 
import { Sermon } from '../sermons/sermon.model'; 

interface EventAttributes {
  id: number;
  name: string;
  description?: string;
  type?: 'Service' | 'Meeting' | 'Outreach' | 'Conference' | 'Other';
  startTime: Date;
  endTime?: Date;
  location?: string;
  organizerUserId?: number;
  isRecurring?: boolean;
  recurrencePattern?: string;
}

interface EventCreationAttributes extends Optional<EventAttributes, 'id' | 'description' | 'type' | 'endTime' | 'location' | 'organizerUserId' | 'isRecurring' | 'recurrencePattern'> {}

export class Event extends Model<EventAttributes, EventCreationAttributes> implements EventAttributes {
  public id!: number;
  public name!: string;
  public description?: string;
  public type?: 'Service' | 'Meeting' | 'Outreach' | 'Conference' | 'Other';
  public startTime!: Date;
  public endTime?: Date;
  public location?: string;
  public organizerUserId?: number;
  public isRecurring?: boolean;
  public recurrencePattern?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
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

export function initEvent(sequelize: Sequelize) {
  Event.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('Service', 'Meeting', 'Outreach', 'Conference', 'Other'),
      allowNull: true,
      defaultValue: 'Service',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    location: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    organizerUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    isRecurring: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    recurrencePattern: {
      type: DataTypes.STRING(255),
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
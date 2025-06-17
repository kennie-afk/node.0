import { DataTypes, Model, Optional } from 'sequelize';
import { Sequelize } from 'sequelize';
import { Member } from '../members/member.model';
import { Event } from '../events/event.model';

interface SermonAttributes {
  id: number;
  title: string;
  speakerMemberId?: number;
  eventId?: number | null; 
  datePreached: Date;
  passageReference?: string;
  summary?: string;
  audioUrl?: string;
  videoUrl?: string;
  notes?: string;
}

interface SermonCreationAttributes extends Optional<SermonAttributes, 'id' | 'speakerMemberId' | 'eventId' | 'passageReference' | 'summary' | 'audioUrl' | 'videoUrl' | 'notes'> {}

export class Sermon extends Model<SermonAttributes, SermonCreationAttributes> implements SermonAttributes {
  public id!: number;
  public title!: string;
  public speakerMemberId?: number;
  public eventId?: number | null; 
  public datePreached!: Date;
  public passageReference?: string;
  public summary?: string;
  public audioUrl?: string;
  public videoUrl?: string;
  public notes?: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Sermon.belongsTo(models.Member, {
      foreignKey: 'speakerMemberId',
      as: 'speaker'
    });

    models.Sermon.belongsTo(models.Event, {
      foreignKey: 'eventId',
      as: 'event'
    });
  }
}

export function initSermon(sequelize: Sequelize) {
  Sermon.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    speakerMemberId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
    },
    eventId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true, 
    },
    datePreached: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    passageReference: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    audioUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    videoUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  }, {
    sequelize,
    tableName: 'sermons',
    timestamps: true,
    underscored: true,
    modelName: 'Sermon',
  });
}
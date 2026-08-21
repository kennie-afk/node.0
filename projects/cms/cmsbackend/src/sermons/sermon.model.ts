import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface SermonAttributes {
  id: number;
  title: string;
  speakerMemberId?: number | null;
  eventId?: number | null;
  datePreached: Date;
  passageReference?: string | null;
  summary?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  notes?: string | null;
}

export interface SermonCreationAttributes extends Optional<SermonAttributes, 'id' | 'speakerMemberId' | 'eventId' | 'passageReference' | 'summary' | 'audioUrl' | 'videoUrl' | 'notes'> {}

export class Sermon extends BaseModel<SermonAttributes, SermonCreationAttributes> implements SermonAttributes {
  public id!: number;
  public title!: string;
  public speakerMemberId!: number | null;
  public eventId!: number | null;
  public datePreached!: Date;
  public passageReference!: string | null;
  public summary!: string | null;
  public audioUrl!: string | null;
  public videoUrl!: string | null;
  public notes!: string | null;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Sermon.belongsTo(models.Member, { foreignKey: 'speakerMemberId', as: 'speaker' });
    Sermon.belongsTo(models.Event, { foreignKey: 'eventId', as: 'event' });
  }
}

export default (sequelize: Sequelize) => {
  return Sermon.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    speakerMemberId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    eventId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    datePreached: { type: DataTypes.DATEONLY, allowNull: false },
    passageReference: { type: DataTypes.STRING(100), allowNull: true },
    summary: { type: DataTypes.TEXT, allowNull: true },
    audioUrl: { type: DataTypes.STRING(255), allowNull: true },
    videoUrl: { type: DataTypes.STRING(255), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  }, {
    tableName: 'sermons',
    timestamps: true,
    underscored: true,
    modelName: 'Sermon',
  }, sequelize);
};
import { DataTypes, Sequelize, Optional } from 'sequelize';
import BaseModel from '../common/base.model';

export interface AnnouncementAttributes {
  id: number;
  title: string;
  content: string;
  authorUserId: number;
  publicationDate: Date;
  expiryDate?: Date | null;
  isPublished: boolean;
  targetAudience?: string;
}

export interface AnnouncementCreationAttributes extends Optional<AnnouncementAttributes, 'id' | 'publicationDate' | 'isPublished'> {}

export class Announcement extends BaseModel<AnnouncementAttributes, AnnouncementCreationAttributes> implements AnnouncementAttributes {
  public id!: number;
  public title!: string;
  public content!: string;
  public authorUserId!: number;
  public publicationDate!: Date;
  public expiryDate!: Date | null;
  public isPublished!: boolean;
  public targetAudience!: string;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    Announcement.belongsTo(models.User, { foreignKey: 'authorUserId', as: 'author' });
  }
}

export default (sequelize: Sequelize) => {
  return Announcement.initModel({
    id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    authorUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    publicationDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    expiryDate: { type: DataTypes.DATE, allowNull: true },
    isPublished: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    targetAudience: { type: DataTypes.ENUM('All', 'Members', 'Leaders', 'Specific Group'), allowNull: true, defaultValue: 'All' },
  }, {
    tableName: 'announcements',
    timestamps: true,
    underscored: true,
    modelName: 'Announcement',
  }, sequelize);
};
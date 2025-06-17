import { DataTypes, Model, Optional } from 'sequelize';
import { Sequelize } from 'sequelize';
import { User } from '../users/user.model';

interface AnnouncementAttributes {
  id: number;
  title: string;
  content: string;
  authorUserId: number;
  publicationDate: Date;
  expiryDate?: Date;
  isPublished?: boolean;
  targetAudience?: 'All' | 'Members' | 'Leaders' | 'Specific Group';
}

interface AnnouncementCreationAttributes extends Optional<AnnouncementAttributes, 'id' | 'expiryDate' | 'isPublished' | 'targetAudience' | 'publicationDate'> {}

export class Announcement extends Model<AnnouncementAttributes, AnnouncementCreationAttributes> implements AnnouncementAttributes {
  public id!: number;
  public title!: string;
  public content!: string;
  public authorUserId!: number;
  public publicationDate!: Date;
  public expiryDate?: Date;
  public isPublished?: boolean;
  public targetAudience?: 'All' | 'Members' | 'Leaders' | 'Specific Group';

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  static associate(models: any) {
    models.Announcement.belongsTo(models.User, {
      foreignKey: 'authorUserId',
      as: 'author'
    });
  }
}

export function initAnnouncement(sequelize: Sequelize) {
  Announcement.init({
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    authorUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
    },
    publicationDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    targetAudience: {
      type: DataTypes.ENUM('All', 'Members', 'Leaders', 'Specific Group'),
      allowNull: true,
      defaultValue: 'All',
    },
  }, {
    sequelize,
    tableName: 'announcements',
    timestamps: true,
    underscored: true,
    modelName: 'Announcement',
  });
}
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Announcement = void 0;
exports.initAnnouncement = initAnnouncement;
const sequelize_1 = require("sequelize");
class Announcement extends sequelize_1.Model {
    static associate(models) {
        models.Announcement.belongsTo(models.User, {
            foreignKey: 'authorUserId',
            as: 'author'
        });
    }
}
exports.Announcement = Announcement;
function initAnnouncement(sequelize) {
    Announcement.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        content: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: false,
        },
        authorUserId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        publicationDate: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW,
        },
        expiryDate: {
            type: sequelize_1.DataTypes.DATE,
            allowNull: true,
        },
        isPublished: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
        targetAudience: {
            type: sequelize_1.DataTypes.ENUM('All', 'Members', 'Leaders', 'Specific Group'),
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

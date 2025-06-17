"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sermon = void 0;
exports.initSermon = initSermon;
const sequelize_1 = require("sequelize");
class Sermon extends sequelize_1.Model {
    static associate(models) {
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
exports.Sermon = Sermon;
function initSermon(sequelize) {
    Sermon.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        title: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        speakerMemberId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        eventId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        datePreached: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: false,
        },
        passageReference: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
        },
        summary: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
        audioUrl: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        videoUrl: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        notes: {
            type: sequelize_1.DataTypes.TEXT,
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

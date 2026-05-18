"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sermon = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Sermon extends base_model_1.default {
    static associate(models) {
        Sermon.belongsTo(models.Member, { foreignKey: 'speakerMemberId', as: 'speaker' });
        Sermon.belongsTo(models.Event, { foreignKey: 'eventId', as: 'event' });
    }
}
exports.Sermon = Sermon;
exports.default = (sequelize) => {
    return Sermon.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        title: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        speakerMemberId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        eventId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        datePreached: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false },
        passageReference: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        summary: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
        audioUrl: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        videoUrl: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'sermons',
        timestamps: true,
        underscored: true,
        modelName: 'Sermon',
    }, sequelize);
};

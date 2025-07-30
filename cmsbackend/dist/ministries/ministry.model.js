"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ministry = void 0;
exports.initMinistry = initMinistry;
const sequelize_1 = require("sequelize");
class Ministry extends sequelize_1.Model {
    static associate(models) {
        models.Ministry.belongsTo(models.Member, {
            foreignKey: 'leaderId',
            as: 'leader'
        });
        models.Ministry.belongsToMany(models.Member, {
            through: models.MinistryMember,
            foreignKey: 'ministryId',
            as: 'members'
        });
        models.Ministry.hasMany(models.SmallGroup, {
            foreignKey: 'ministryId',
            as: 'smallGroups'
        });
    }
}
exports.Ministry = Ministry;
function initMinistry(sequelize) {
    Ministry.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
        leaderId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        isActive: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        tableName: 'ministries',
        timestamps: true,
        underscored: true,
        modelName: 'Ministry',
    });
}

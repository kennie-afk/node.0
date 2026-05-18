"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinistryMember = void 0;
const sequelize_1 = require("sequelize");
class MinistryMember extends sequelize_1.Model {
    static associate(models) { }
}
exports.MinistryMember = MinistryMember;
exports.default = (sequelize, DataTypes) => {
    MinistryMember.init({
        ministryId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            primaryKey: true,
            references: {
                model: 'ministries',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
        },
        memberId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            primaryKey: true,
            references: {
                model: 'members',
                key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'CASCADE',
        },
        role: {
            type: DataTypes.STRING(100),
            allowNull: true,
            defaultValue: 'Member',
        },
        startDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: DataTypes.NOW,
        },
        endDate: {
            type: DataTypes.DATEONLY,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'ministry_members',
        timestamps: true,
        underscored: true,
        modelName: 'MinistryMember',
    });
    return MinistryMember;
};

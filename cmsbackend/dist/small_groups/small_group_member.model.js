"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallGroupMember = void 0;
const sequelize_1 = require("sequelize");
class SmallGroupMember extends sequelize_1.Model {
    static associate(models) { }
}
exports.SmallGroupMember = SmallGroupMember;
exports.default = (sequelize, DataTypes) => {
    SmallGroupMember.init({
        smallGroupId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            primaryKey: true,
            references: {
                model: 'small_groups',
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
        tableName: 'small_group_members',
        timestamps: true,
        underscored: true,
        modelName: 'SmallGroupMember',
    });
    return SmallGroupMember;
};

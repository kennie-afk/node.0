"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallGroupMember = void 0;
exports.initSmallGroupMember = initSmallGroupMember;
const sequelize_1 = require("sequelize");
class SmallGroupMember extends sequelize_1.Model {
    static associate(models) { }
}
exports.SmallGroupMember = SmallGroupMember;
function initSmallGroupMember(sequelize) {
    SmallGroupMember.init({
        smallGroupId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
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
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
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
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
            defaultValue: 'Member',
        },
        startDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: sequelize_1.DataTypes.NOW,
        },
        endDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'small_group_members',
        timestamps: true,
        underscored: true,
        modelName: 'SmallGroupMember',
    });
}

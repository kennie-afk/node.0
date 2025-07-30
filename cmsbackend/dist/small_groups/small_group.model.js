"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallGroup = void 0;
exports.initSmallGroup = initSmallGroup;
const sequelize_1 = require("sequelize");
class SmallGroup extends sequelize_1.Model {
    static associate(models) {
        models.SmallGroup.belongsTo(models.Ministry, {
            foreignKey: 'ministryId',
            as: 'parentMinistry'
        });
        models.SmallGroup.belongsTo(models.Member, {
            foreignKey: 'leaderId',
            as: 'leader'
        });
        models.SmallGroup.belongsToMany(models.Member, {
            through: models.SmallGroupMember,
            foreignKey: 'smallGroupId',
            as: 'members'
        });
    }
}
exports.SmallGroup = SmallGroup;
function initSmallGroup(sequelize) {
    SmallGroup.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: false,
        },
        description: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
        ministryId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
        },
        leaderId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        meetingDay: {
            type: sequelize_1.DataTypes.ENUM('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'),
            allowNull: true,
        },
        meetingTime: {
            type: sequelize_1.DataTypes.STRING(5),
            allowNull: true,
        },
        meetingLocation: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        isActive: {
            type: sequelize_1.DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        },
    }, {
        sequelize,
        tableName: 'small_groups',
        timestamps: true,
        underscored: true,
        modelName: 'SmallGroup',
        indexes: [
            {
                unique: true,
                fields: ['name', 'ministry_id'],
            }
        ]
    });
}

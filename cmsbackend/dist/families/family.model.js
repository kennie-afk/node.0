"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Family = void 0;
exports.initFamily = initFamily;
const sequelize_1 = require("sequelize");
class Family extends sequelize_1.Model {
    static associate(models) {
        models.Family.hasMany(models.Member, {
            foreignKey: 'familyId',
            as: 'members'
        });
        models.Family.belongsTo(models.Member, {
            foreignKey: 'headOfFamilyMemberId',
            as: 'headOfFamily'
        });
    }
}
exports.Family = Family;
function initFamily(sequelize) {
    Family.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        familyName: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
            unique: true,
        },
        headOfFamilyMemberId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        address: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        city: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
        },
        county: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
        },
        postalCode: {
            type: sequelize_1.DataTypes.STRING(20),
            allowNull: true,
        },
        phoneNumber: {
            type: sequelize_1.DataTypes.STRING(20),
            allowNull: true,
            unique: true,
        },
        email: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        notes: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'families',
        timestamps: true,
        underscored: true,
        modelName: 'Family',
    });
}

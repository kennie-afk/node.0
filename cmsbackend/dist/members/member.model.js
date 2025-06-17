"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Member = void 0;
exports.initMember = initMember;
const sequelize_1 = require("sequelize");
class Member extends sequelize_1.Model {
    static associate(models) {
        models.Member.belongsTo(models.Family, {
            foreignKey: 'familyId',
            as: 'family'
        });
        models.Member.hasMany(models.Sermon, {
            foreignKey: 'speakerMemberId',
            as: 'sermons'
        });
    }
}
exports.Member = Member;
function initMember(sequelize) {
    Member.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        firstName: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
        },
        lastName: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
        },
        middleName: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
        },
        gender: {
            type: sequelize_1.DataTypes.ENUM('Male', 'Female', 'Other'),
            allowNull: true,
        },
        dateOfBirth: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: true,
        },
        email: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
            unique: true,
            validate: {
                isEmail: true,
            },
        },
        phoneNumber: {
            type: sequelize_1.DataTypes.STRING(20),
            allowNull: true,
            unique: true,
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
        status: {
            type: sequelize_1.DataTypes.ENUM('Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'),
            allowNull: false,
            defaultValue: 'Active',
        },
        baptismDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: true,
        },
        membershipDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: false,
            defaultValue: sequelize_1.DataTypes.NOW,
        },
        familyId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        profilePictureUrl: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        notes: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'members',
        timestamps: true,
        underscored: true,
        modelName: 'Member',
    });
}

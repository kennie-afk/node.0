"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Member = void 0;
const sequelize_1 = require("sequelize");
const base_model_1 = __importDefault(require("../common/base.model"));
class Member extends base_model_1.default {
    static associate(models) {
        Member.belongsTo(models.Family, { foreignKey: 'familyId', as: 'family' });
        Member.hasMany(models.Sermon, { foreignKey: 'speakerMemberId', as: 'sermons' });
        Member.belongsToMany(models.Ministry, { through: models.MinistryMember, foreignKey: 'memberId', as: 'ministries' });
        Member.belongsToMany(models.SmallGroup, { through: models.SmallGroupMember, foreignKey: 'memberId', as: 'smallGroups' });
        Member.hasMany(models.Ministry, { foreignKey: 'leaderId', as: 'ledMinistries' });
        Member.hasMany(models.Contribution, { foreignKey: 'memberId', as: 'contributions' });
    }
}
exports.Member = Member;
exports.default = (sequelize) => {
    return Member.initModel({
        id: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        firstName: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
        lastName: { type: sequelize_1.DataTypes.STRING(100), allowNull: false },
        middleName: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        gender: { type: sequelize_1.DataTypes.ENUM('Male', 'Female', 'Other'), allowNull: true },
        dateOfBirth: { type: sequelize_1.DataTypes.DATEONLY, allowNull: true },
        email: { type: sequelize_1.DataTypes.STRING(100), allowNull: true, unique: true, validate: { isEmail: true } },
        phoneNumber: { type: sequelize_1.DataTypes.STRING(20), allowNull: true, unique: true },
        address: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        city: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        county: { type: sequelize_1.DataTypes.STRING(100), allowNull: true },
        postalCode: { type: sequelize_1.DataTypes.STRING(20), allowNull: true },
        status: { type: sequelize_1.DataTypes.ENUM('Active', 'Inactive', 'New Convert', 'Deceased', 'Guest'), allowNull: false, defaultValue: 'Active' },
        baptismDate: { type: sequelize_1.DataTypes.DATEONLY, allowNull: true },
        membershipDate: { type: sequelize_1.DataTypes.DATEONLY, allowNull: false, defaultValue: sequelize_1.DataTypes.NOW },
        familyId: { type: sequelize_1.DataTypes.INTEGER.UNSIGNED, allowNull: true },
        profilePictureUrl: { type: sequelize_1.DataTypes.STRING(255), allowNull: true },
        notes: { type: sequelize_1.DataTypes.TEXT, allowNull: true },
    }, {
        tableName: 'members',
        timestamps: true,
        underscored: true,
        modelName: 'Member',
    }, sequelize);
};

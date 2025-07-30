'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.Contribution = void 0;
exports.initContribution = initContribution;
const sequelize_1 = require("sequelize");
class Contribution extends sequelize_1.Model {
    static associate(models) {
        models.Contribution.belongsTo(models.Member, {
            foreignKey: 'memberId',
            as: 'contributorMember'
        });
    }
}
exports.Contribution = Contribution;
function initContribution(sequelize) {
    Contribution.init({
        id: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true,
        },
        memberId: {
            type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
        },
        contributorName: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
        },
        amount: {
            type: sequelize_1.DataTypes.DECIMAL(10, 2),
            allowNull: false,
        },
        contributionDate: {
            type: sequelize_1.DataTypes.DATEONLY,
            allowNull: false,
        },
        contributionType: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: false,
        },
        paymentMethod: {
            type: sequelize_1.DataTypes.STRING(100),
            allowNull: true,
        },
        transactionId: {
            type: sequelize_1.DataTypes.STRING(255),
            allowNull: true,
            unique: true
        },
        notes: {
            type: sequelize_1.DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        sequelize,
        tableName: 'contribution',
        timestamps: true,
        underscored: true,
        modelName: 'Contribution',
    });
}

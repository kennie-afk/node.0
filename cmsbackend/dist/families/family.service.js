"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFamily = exports.updateFamily = exports.getFamilyById = exports.getAllFamilies = exports.createFamily = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const FamilyDbModel = _models_1.default.Family;
const MemberDbModel = _models_1.default.Member;
const createFamily = async (familyData) => {
    try {
        const { familyName, headOfFamilyMemberId, ...rest } = familyData;
        if (!familyName) {
            throw new Error('Family name is required.');
        }
        if (headOfFamilyMemberId) {
            const memberExists = await MemberDbModel.findByPk(headOfFamilyMemberId);
            if (!memberExists) {
                throw new Error(`Head of family member with ID ${headOfFamilyMemberId} not found.`);
            }
        }
        const newFamily = await FamilyDbModel.create({
            familyName,
            headOfFamilyMemberId,
            ...rest,
        });
        return newFamily;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: Family with this ${field} already exists.`);
        }
        throw new Error(`Service error creating family: ${error.message}`);
    }
};
exports.createFamily = createFamily;
const getAllFamilies = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [];
        if (filters.familyName) {
            where.familyName = { [sequelize_1.Op.like]: `%${filters.familyName}%` };
        }
        if (filters.city) {
            where.city = { [sequelize_1.Op.like]: `%${filters.city}%` };
        }
        if (filters.county) {
            where.county = { [sequelize_1.Op.like]: `%${filters.county}%` };
        }
        if (filters.headOfFamilyMemberId) {
            where.headOfFamilyMemberId = filters.headOfFamilyMemberId;
            include.push({
                model: MemberDbModel,
                as: 'headOfFamily',
                attributes: ['id', 'firstName', 'lastName'],
                required: false
            });
        }
        if (filters.email) {
            where.email = { [sequelize_1.Op.like]: `%${filters.email}%` };
        }
        if (filters.phoneNumber) {
            where.phoneNumber = { [sequelize_1.Op.like]: `%${filters.phoneNumber}%` };
        }
        const { count, rows } = await FamilyDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['familyName', 'ASC']],
            include: include,
        });
        return { families: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all families: ${error.message}`);
    }
};
exports.getAllFamilies = getAllFamilies;
const getFamilyById = async (id) => {
    try {
        const family = await FamilyDbModel.findByPk(id, {
            include: [{
                    model: MemberDbModel,
                    as: 'headOfFamily',
                    attributes: ['id', 'firstName', 'lastName'],
                    required: false
                }]
        });
        return family;
    }
    catch (error) {
        throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
    }
};
exports.getFamilyById = getFamilyById;
const updateFamily = async (id, familyData) => {
    try {
        const { headOfFamilyMemberId, ...rest } = familyData;
        if (headOfFamilyMemberId !== undefined && headOfFamilyMemberId !== null) {
            const memberExists = await MemberDbModel.findByPk(headOfFamilyMemberId);
            if (!memberExists) {
                throw new Error(`Head of family member with ID ${headOfFamilyMemberId} not found for update.`);
            }
        }
        const [updatedRowsCount] = await FamilyDbModel.update({ headOfFamilyMemberId, ...rest }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedFamily = await FamilyDbModel.findByPk(id, {
            include: [{
                    model: MemberDbModel,
                    as: 'headOfFamily',
                    attributes: ['id', 'firstName', 'lastName'],
                    required: false
                }]
        });
        return updatedFamily;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: Family with this ${field} already exists.`);
        }
        throw new Error(`Service error updating family with ID ${id}: ${error.message}`);
    }
};
exports.updateFamily = updateFamily;
const deleteFamily = async (id) => {
    try {
        const deletedRowCount = await FamilyDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting family with ID ${id}: ${error.message}`);
    }
};
exports.deleteFamily = deleteFamily;

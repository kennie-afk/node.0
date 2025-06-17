"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFamily = exports.updateFamily = exports.getFamilyById = exports.getAllFamilies = exports.createFamily = void 0;
const _models_1 = __importDefault(require("@models"));
const FamilyDbModel = _models_1.default.Family;
const MemberDbModel = _models_1.default.Member;
/**
 * @param familyData
 * @returns
 * @throws {Error}
 */
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
/**
 * @returns
 */
const getAllFamilies = async () => {
    try {
        const families = await FamilyDbModel.findAll();
        return families;
    }
    catch (error) {
        throw new Error(`Service error fetching all families: ${error.message}`);
    }
};
exports.getAllFamilies = getAllFamilies;
/**
 * @param id
 * @returns
 */
const getFamilyById = async (id) => {
    try {
        const family = await FamilyDbModel.findByPk(id);
        return family;
    }
    catch (error) {
        throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
    }
};
exports.getFamilyById = getFamilyById;
/**
 * @param id
 * @param familyData
 */
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
        const updatedFamily = await FamilyDbModel.findByPk(id);
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
/**
 * @param id
 * @returns
 */
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

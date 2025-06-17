"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMember = exports.updateMember = exports.getMemberById = exports.getAllMembers = exports.createMember = void 0;
const _models_1 = __importDefault(require("@models"));
const MemberDbModel = _models_1.default.Member;
const FamilyDbModel = _models_1.default.Family;
/**
 * @param memberData
 * @returns
 * @throws {Error}
 */
const createMember = async (memberData) => {
    try {
        const { firstName, lastName, membershipDate, familyId, ...rest } = memberData;
        if (!firstName || !lastName || !membershipDate) {
            throw new Error('First name, last name, and membership date are required.');
        }
        if (familyId) {
            const familyExists = await FamilyDbModel.findByPk(familyId);
            if (!familyExists) {
                throw new Error(`Family with ID ${familyId} not found.`);
            }
        }
        const newMember = await MemberDbModel.create({
            firstName, lastName, membershipDate, familyId,
            ...rest
        });
        return newMember;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: Member with this ${field} already exists.`);
        }
        throw new Error(`Service error creating member: ${error.message}`);
    }
};
exports.createMember = createMember;
/**
 * @returns
 */
const getAllMembers = async () => {
    try {
        const members = await MemberDbModel.findAll({
            include: [{ model: _models_1.default.Family, as: 'family' }]
        });
        return members;
    }
    catch (error) {
        throw new Error(`Service error fetching all members: ${error.message}`);
    }
};
exports.getAllMembers = getAllMembers;
/**
 * @param id
 * @returns
 */
const getMemberById = async (id) => {
    try {
        const member = await MemberDbModel.findByPk(id, {
            include: [{ model: _models_1.default.Family, as: 'family' }]
        });
        return member;
    }
    catch (error) {
        throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
    }
};
exports.getMemberById = getMemberById;
/**
 * @param id
 * @param memberData
 * @returns
 */
const updateMember = async (id, memberData) => {
    try {
        const { familyId, ...rest } = memberData;
        if (familyId !== undefined && familyId !== null) {
            const familyExists = await FamilyDbModel.findByPk(familyId);
            if (!familyExists) {
                throw new Error(`Family with ID ${familyId} not found for update.`);
            }
        }
        const [updatedRowsCount] = await MemberDbModel.update({ familyId, ...rest }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedMember = await MemberDbModel.findByPk(id, {
            include: [{ model: _models_1.default.Family, as: 'family' }]
        });
        return updatedMember;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: Member with this ${field} already exists.`);
        }
        throw new Error(`Service error updating member with ID ${id}: ${error.message}`);
    }
};
exports.updateMember = updateMember;
/**
 * @param id
 * @returns
 */
const deleteMember = async (id) => {
    try {
        const deletedRowCount = await MemberDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting member with ID ${id}: ${error.message}`);
    }
};
exports.deleteMember = deleteMember;

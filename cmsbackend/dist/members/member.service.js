"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMember = exports.updateMember = exports.getMemberById = exports.getAllMembers = exports.createMember = void 0;
const _models_1 = __importDefault(require("@models"));
const errors_1 = require("../utils/errors");
const MemberDbModel = _models_1.default.Member;
const FamilyDbModel = _models_1.default.Family;
const createMember = async (memberData) => {
    try {
        const newMember = await MemberDbModel.create(memberData);
        return newMember;
    }
    catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            throw new errors_1.BadRequestError('Family ID does not exist.');
        }
        throw new Error(`Service error creating member: ${error.message}`);
    }
};
exports.createMember = createMember;
const getAllMembers = async () => {
    try {
        const members = await MemberDbModel.findAll({
            include: [
                {
                    model: FamilyDbModel,
                    as: 'family', // ← Must match the alias defined in the model
                    attributes: ['id', 'familyName', 'address']
                }
            ],
            order: [['firstName', 'ASC']]
        });
        return members;
    }
    catch (error) {
        throw new Error(`Service error fetching all members: ${error.message}`);
    }
};
exports.getAllMembers = getAllMembers;
const getMemberById = async (id) => {
    try {
        const member = await MemberDbModel.findByPk(id, {
            include: [
                {
                    model: FamilyDbModel,
                    as: 'family',
                    attributes: ['id', 'familyName', 'address']
                }
            ]
        });
        return member;
    }
    catch (error) {
        throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
    }
};
exports.getMemberById = getMemberById;
const updateMember = async (id, memberData) => {
    try {
        const [updatedRowsCount] = await MemberDbModel.update(memberData, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedMember = await MemberDbModel.findByPk(id, {
            include: [
                {
                    model: FamilyDbModel,
                    as: 'family',
                    attributes: ['id', 'familyName', 'address']
                }
            ]
        });
        return updatedMember;
    }
    catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') {
            throw new errors_1.BadRequestError('Family ID does not exist.');
        }
        throw new Error(`Service error updating member with ID ${id}: ${error.message}`);
    }
};
exports.updateMember = updateMember;
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

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMembersOfMinistry = exports.removeMemberFromMinistry = exports.addMemberToMinistry = exports.deleteMinistry = exports.updateMinistry = exports.getMinistryById = exports.getAllMinistries = exports.createMinistry = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const MinistryDbModel = _models_1.default.Ministry;
const MemberDbModel = _models_1.default.Member;
const MinistryMemberDbModel = _models_1.default.MinistryMember;
const createMinistry = async (data) => {
    try {
        const { leaderId, ...rest } = data;
        if (leaderId) {
            const leader = await MemberDbModel.findByPk(leaderId);
            if (!leader) {
                throw new Error(`Leader with ID ${leaderId} not found.`);
            }
        }
        const newMinistry = await MinistryDbModel.create({
            leaderId,
            ...rest,
        });
        const createdMinistry = await MinistryDbModel.findByPk(newMinistry.id, {
            include: [
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
            ]
        });
        if (leaderId) {
            await MinistryMemberDbModel.findOrCreate({
                where: { ministryId: newMinistry.id, memberId: leaderId },
                defaults: { ministryId: newMinistry.id, memberId: leaderId, role: 'Leader', startDate: new Date() }
            });
        }
        return createdMinistry;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error(`Ministry with name '${data.name}' already exists.`);
        }
        throw new Error(`Service error creating ministry: ${error.message}`);
    }
};
exports.createMinistry = createMinistry;
const getAllMinistries = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [
            { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'], required: false },
            { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] }, required: false }
        ];
        if (filters.name) {
            where.name = { [sequelize_1.Op.like]: `%${filters.name}%` };
        }
        if (filters.leaderId) {
            where.leaderId = filters.leaderId;
        }
        if (filters.isActive !== undefined) {
            where.isActive = filters.isActive;
        }
        const { count, rows } = await MinistryDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['name', 'ASC']],
            include: include,
        });
        return { ministries: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all ministries: ${error.message}`);
    }
};
exports.getAllMinistries = getAllMinistries;
const getMinistryById = async (id) => {
    try {
        const ministry = await MinistryDbModel.findByPk(id, {
            include: [
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] },
                { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] } }
            ]
        });
        return ministry;
    }
    catch (error) {
        throw new Error(`Service error fetching ministry by ID ${id}: ${error.message}`);
    }
};
exports.getMinistryById = getMinistryById;
const updateMinistry = async (id, ministryData) => {
    try {
        const ministry = await MinistryDbModel.findByPk(id);
        if (!ministry) {
            return null;
        }
        const { leaderId, ...rest } = ministryData;
        if (leaderId !== undefined && leaderId !== null && leaderId !== ministry.leaderId) {
            const leader = await MemberDbModel.findByPk(leaderId);
            if (!leader) {
                throw new Error(`Leader with ID ${leaderId} not found.`);
            }
            const ministryMember = await MinistryMemberDbModel.findOne({
                where: { ministryId: id, memberId: leaderId }
            });
            if (!ministryMember) {
                throw new Error(`Member with ID ${leaderId} must be a member of this ministry before being assigned as leader.`);
            }
            if (ministryMember.role !== 'Leader') {
                await ministryMember.update({ role: 'Leader' });
            }
        }
        else if (leaderId === null && ministry.leaderId !== null) {
        }
        const [updatedRowsCount] = await MinistryDbModel.update({
            leaderId,
            ...rest,
        }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedMinistry = await MinistryDbModel.findByPk(id, {
            include: [
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
            ]
        });
        return updatedMinistry;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error(`Ministry with name '${ministryData.name}' already exists.`);
        }
        throw new Error(`Service error updating ministry with ID ${id}: ${error.message}`);
    }
};
exports.updateMinistry = updateMinistry;
const deleteMinistry = async (id) => {
    try {
        const deletedRowCount = await MinistryDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting ministry with ID ${id}: ${error.message}`);
    }
};
exports.deleteMinistry = deleteMinistry;
const addMemberToMinistry = async (ministryId, memberId, role) => {
    try {
        const ministry = await MinistryDbModel.findByPk(ministryId);
        if (!ministry) {
            throw new Error('Ministry not found.');
        }
        const member = await MemberDbModel.findByPk(memberId);
        if (!member) {
            throw new Error('Member not found.');
        }
        let effectiveRole = role || 'Member';
        if (ministry.leaderId === memberId) {
            effectiveRole = 'Leader';
        }
        const [ministryMember, created] = await MinistryMemberDbModel.findOrCreate({
            where: { ministryId, memberId },
            defaults: { ministryId, memberId, role: effectiveRole, startDate: new Date() }
        });
        if (!created) {
            if (ministryMember.role !== effectiveRole) {
                await ministryMember.update({ role: effectiveRole });
                return ministryMember;
            }
            throw new Error('Member is already part of this ministry.');
        }
        return ministryMember;
    }
    catch (error) {
        throw new Error(`Service error adding member to ministry: ${error.message}`);
    }
};
exports.addMemberToMinistry = addMemberToMinistry;
const removeMemberFromMinistry = async (ministryId, memberId) => {
    try {
        const ministry = await MinistryDbModel.findByPk(ministryId);
        if (ministry && ministry.leaderId === memberId) {
            throw new Error('Cannot remove member from ministry: Member is currently the leader. Please assign a new leader first or set leader to null.');
        }
        const deletedCount = await MinistryMemberDbModel.destroy({
            where: { ministryId, memberId }
        });
        return deletedCount;
    }
    catch (error) {
        throw new Error(`Service error removing member from ministry: ${error.message}`);
    }
};
exports.removeMemberFromMinistry = removeMemberFromMinistry;
const getMembersOfMinistry = async (ministryId) => {
    try {
        const ministry = await MinistryDbModel.findByPk(ministryId, {
            include: [{
                    model: MemberDbModel,
                    as: 'members',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    through: { attributes: ['role', 'startDate', 'endDate'] }
                }]
        });
        if (!ministry) {
            throw new Error('Ministry not found.');
        }
        return ministry.members;
    }
    catch (error) {
        throw new Error(`Service error fetching members of ministry: ${error.message}`);
    }
};
exports.getMembersOfMinistry = getMembersOfMinistry;

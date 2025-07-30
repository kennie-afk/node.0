"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMembersOfSmallGroup = exports.removeMemberFromSmallGroup = exports.addMemberToSmallGroup = exports.deleteSmallGroup = exports.updateSmallGroup = exports.getSmallGroupById = exports.getAllSmallGroups = exports.createSmallGroup = void 0;
const _models_1 = __importDefault(require("@models"));
const SmallGroupDbModel = _models_1.default.SmallGroup;
const MinistryDbModel = _models_1.default.Ministry;
const MemberDbModel = _models_1.default.Member;
const SmallGroupMemberDbModel = _models_1.default.SmallGroupMember;
const createSmallGroup = async (data) => {
    try {
        const { ministryId, leaderId, ...rest } = data;
        const parentMinistry = await MinistryDbModel.findByPk(ministryId);
        if (!parentMinistry) {
            throw new Error(`Ministry with ID ${ministryId} not found.`);
        }
        if (leaderId) {
            const leader = await MemberDbModel.findByPk(leaderId);
            if (!leader) {
                throw new Error(`Leader with ID ${leaderId} not found.`);
            }
        }
        const newSmallGroup = await SmallGroupDbModel.create({
            ministryId,
            leaderId,
            ...rest,
        });
        const createdSmallGroup = await SmallGroupDbModel.findByPk(newSmallGroup.id, {
            include: [
                { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
            ]
        });
        return createdSmallGroup;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error(`Small Group with name '${data.name}' already exists under ministry ID ${data.ministryId}.`);
        }
        throw new Error(`Service error creating small group: ${error.message}`);
    }
};
exports.createSmallGroup = createSmallGroup;
const getAllSmallGroups = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [
            { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'], required: false },
            { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'], required: false },
            { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] }, required: false }
        ];
        if (filters.ministryId) {
            where.ministryId = filters.ministryId;
        }
        if (filters.leaderId) {
            where.leaderId = filters.leaderId;
        }
        if (filters.meetingDay) {
            where.meetingDay = filters.meetingDay;
        }
        if (filters.meetingTime) {
            where.meetingTime = filters.meetingTime;
        }
        if (filters.isActive !== undefined) {
            where.isActive = filters.isActive;
        }
        const { count, rows } = await SmallGroupDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['name', 'ASC']],
            include: include,
        });
        return { smallGroups: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all small groups: ${error.message}`);
    }
};
exports.getAllSmallGroups = getAllSmallGroups;
const getSmallGroupById = async (id) => {
    try {
        const smallGroup = await SmallGroupDbModel.findByPk(id, {
            include: [
                { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] },
                { model: MemberDbModel, as: 'members', attributes: ['id', 'firstName', 'lastName'], through: { attributes: ['role', 'startDate', 'endDate'] } }
            ]
        });
        return smallGroup;
    }
    catch (error) {
        throw new Error(`Service error fetching small group by ID ${id}: ${error.message}`);
    }
};
exports.getSmallGroupById = getSmallGroupById;
const updateSmallGroup = async (id, smallGroupData) => {
    try {
        const smallGroup = await SmallGroupDbModel.findByPk(id);
        if (!smallGroup) {
            return null;
        }
        const { ministryId, leaderId, ...rest } = smallGroupData;
        if (ministryId !== undefined && ministryId !== null) {
            const parentMinistry = await MinistryDbModel.findByPk(ministryId);
            if (!parentMinistry) {
                throw new Error(`Ministry with ID ${ministryId} not found.`);
            }
        }
        if (leaderId !== undefined && leaderId !== null) {
            const leader = await MemberDbModel.findByPk(leaderId);
            if (!leader) {
                throw new Error(`Leader with ID ${leaderId} not found.`);
            }
        }
        const [updatedRowsCount] = await SmallGroupDbModel.update({
            ministryId,
            leaderId,
            ...rest,
        }, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedSmallGroup = await SmallGroupDbModel.findByPk(id, {
            include: [
                { model: MinistryDbModel, as: 'parentMinistry', attributes: ['id', 'name'] },
                { model: MemberDbModel, as: 'leader', attributes: ['id', 'firstName', 'lastName'] }
            ]
        });
        return updatedSmallGroup;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new Error(`Small Group with name '${smallGroupData.name}' already exists under ministry ID ${smallGroupData.ministryId}.`);
        }
        throw new Error(`Service error updating small group with ID ${id}: ${error.message}`);
    }
};
exports.updateSmallGroup = updateSmallGroup;
const deleteSmallGroup = async (id) => {
    try {
        const deletedRowCount = await SmallGroupDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting small group with ID ${id}: ${error.message}`);
    }
};
exports.deleteSmallGroup = deleteSmallGroup;
const addMemberToSmallGroup = async (smallGroupId, memberId, role) => {
    try {
        const smallGroup = await SmallGroupDbModel.findByPk(smallGroupId);
        if (!smallGroup) {
            throw new Error('Small Group not found.');
        }
        const member = await MemberDbModel.findByPk(memberId);
        if (!member) {
            throw new Error('Member not found.');
        }
        const [smallGroupMember, created] = await SmallGroupMemberDbModel.findOrCreate({
            where: { smallGroupId, memberId },
            defaults: { smallGroupId, memberId, role: role || 'Member', startDate: new Date() }
        });
        if (!created) {
            throw new Error('Member is already part of this small group.');
        }
        return smallGroupMember;
    }
    catch (error) {
        throw new Error(`Service error adding member to small group: ${error.message}`);
    }
};
exports.addMemberToSmallGroup = addMemberToSmallGroup;
const removeMemberFromSmallGroup = async (smallGroupId, memberId) => {
    try {
        const deletedCount = await SmallGroupMemberDbModel.destroy({
            where: { smallGroupId, memberId }
        });
        return deletedCount;
    }
    catch (error) {
        throw new Error(`Service error removing member from small group: ${error.message}`);
    }
};
exports.removeMemberFromSmallGroup = removeMemberFromSmallGroup;
const getMembersOfSmallGroup = async (smallGroupId) => {
    try {
        const smallGroup = await SmallGroupDbModel.findByPk(smallGroupId, {
            include: [{
                    model: MemberDbModel,
                    as: 'members',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    through: { attributes: ['role', 'startDate', 'endDate'] }
                }]
        });
        if (!smallGroup) {
            throw new Error('Small Group not found.');
        }
        return smallGroup.members;
    }
    catch (error) {
        throw new Error(`Service error fetching members of small group: ${error.message}`);
    }
};
exports.getMembersOfSmallGroup = getMembersOfSmallGroup;

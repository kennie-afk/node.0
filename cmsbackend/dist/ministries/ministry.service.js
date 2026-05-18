"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMembersOfMinistry = exports.removeMemberFromMinistry = exports.addMemberToMinistry = exports.deleteMinistry = exports.updateMinistry = exports.getMinistryById = exports.getAllMinistries = exports.createMinistry = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const errors_1 = require("../utils/errors");
const MinistryDbModel = _models_1.default.Ministry;
const MemberDbModel = _models_1.default.Member;
const MinistryMemberDbModel = _models_1.default.MinistryMember;
const createMinistry = async (data) => {
    const { leaderId, ...rest } = data;
    if (leaderId) {
        const leader = await MemberDbModel.findByPk(leaderId);
        if (!leader)
            throw new errors_1.NotFoundError(`Leader with ID ${leaderId} not found.`);
    }
    const newMinistry = await MinistryDbModel.create({ leaderId, ...rest });
    return await MinistryDbModel.findByPk(newMinistry.id, {
        include: [{ model: MemberDbModel, as: 'leader' }]
    });
};
exports.createMinistry = createMinistry;
const getAllMinistries = async (filters, limit, offset) => {
    const where = {};
    if (filters.name)
        where.name = { [sequelize_1.Op.like]: `%${filters.name}%` };
    if (filters.leaderId)
        where.leaderId = filters.leaderId;
    if (filters.isActive !== undefined)
        where.isActive = filters.isActive;
    const { count, rows } = await MinistryDbModel.findAndCountAll({
        where,
        limit,
        offset,
        include: [{ model: MemberDbModel, as: 'leader' }]
    });
    return { ministries: rows, totalCount: count };
};
exports.getAllMinistries = getAllMinistries;
const getMinistryById = async (id) => {
    return await MinistryDbModel.findByPk(id, {
        include: [{ model: MemberDbModel, as: 'leader' }]
    });
};
exports.getMinistryById = getMinistryById;
const updateMinistry = async (id, data) => {
    const [updatedRows] = await MinistryDbModel.update(data, { where: { id } });
    if (updatedRows === 0)
        return null;
    return await MinistryDbModel.findByPk(id);
};
exports.updateMinistry = updateMinistry;
const deleteMinistry = async (id) => {
    return await MinistryDbModel.destroy({ where: { id } });
};
exports.deleteMinistry = deleteMinistry;
const addMemberToMinistry = async (ministryId, memberId, role) => {
    const ministry = await MinistryDbModel.findByPk(ministryId);
    if (!ministry)
        throw new errors_1.NotFoundError('Ministry not found.');
    const member = await MemberDbModel.findByPk(memberId);
    if (!member)
        throw new errors_1.NotFoundError('Member not found.');
    const effectiveRole = role || 'Member';
    const [ministryMember] = await MinistryMemberDbModel.findOrCreate({
        where: { ministryId, memberId },
        defaults: { ministryId, memberId, role: effectiveRole, startDate: new Date() }
    });
    return ministryMember;
};
exports.addMemberToMinistry = addMemberToMinistry;
const removeMemberFromMinistry = async (ministryId, memberId) => {
    return await MinistryMemberDbModel.destroy({ where: { ministryId, memberId } });
};
exports.removeMemberFromMinistry = removeMemberFromMinistry;
const getMembersOfMinistry = async (ministryId) => {
    const ministry = await MinistryDbModel.findByPk(ministryId, {
        include: [{
                model: MemberDbModel,
                as: 'members',
                through: { attributes: ['role', 'startDate'] }
            }]
    });
    if (!ministry)
        throw new errors_1.NotFoundError('Ministry not found.');
    return ministry.members || [];
};
exports.getMembersOfMinistry = getMembersOfMinistry;

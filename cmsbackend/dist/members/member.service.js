"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteMember = exports.updateMember = exports.getMemberById = exports.getAllMembers = exports.createMember = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const MemberDbModel = _models_1.default.Member;
const FamilyDbModel = _models_1.default.Family;
const MinistryDbModel = _models_1.default.Ministry;
const MinistryMemberDbModel = _models_1.default.MinistryMember;
const SmallGroupDbModel = _models_1.default.SmallGroup;
const SmallGroupMemberDbModel = _models_1.default.SmallGroupMember;
const ContributionDbModel = _models_1.default.Contribution;
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
const getAllMembers = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [];
        if (filters.firstName) {
            where.firstName = { [sequelize_1.Op.like]: `%${filters.firstName}%` };
        }
        if (filters.lastName) {
            where.lastName = { [sequelize_1.Op.like]: `%${filters.lastName}%` };
        }
        if (filters.email) {
            where.email = { [sequelize_1.Op.like]: `%${filters.email}%` };
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.gender) {
            where.gender = filters.gender;
        }
        if (filters.city) {
            where.city = { [sequelize_1.Op.like]: `%${filters.city}%` };
        }
        if (filters.county) {
            where.county = { [sequelize_1.Op.like]: `%${filters.county}%` };
        }
        if (filters.familyId) {
            where.familyId = filters.familyId;
        }
        if (filters.includeFamily) {
            include.push({
                model: FamilyDbModel,
                as: 'family',
                attributes: ['id', 'familyName', 'address', 'city', 'county'],
                required: false
            });
        }
        if (filters.includeMinistries) {
            include.push({
                model: MinistryDbModel,
                as: 'ministries',
                attributes: ['id', 'name', 'description', 'isActive'],
                through: {
                    model: MinistryMemberDbModel,
                    attributes: ['role', 'startDate', 'endDate']
                },
                required: false
            });
        }
        if (filters.includeSmallGroups) {
            include.push({
                model: SmallGroupDbModel,
                as: 'smallGroups',
                attributes: ['id', 'name', 'description', 'meetingDay', 'meetingTime'],
                through: {
                    model: SmallGroupMemberDbModel,
                    attributes: ['role', 'startDate', 'endDate']
                },
                required: false
            });
        }
        if (filters.includeContributions) {
            include.push({
                model: ContributionDbModel,
                as: 'contributions',
                attributes: ['id', 'amount', 'contributionType', 'contributionDate', 'paymentMethod', 'transactionId', 'notes'],
                required: false
            });
        }
        if (filters.includeLedMinistries) {
            include.push({
                model: MinistryDbModel,
                as: 'ledMinistries',
                attributes: ['id', 'name', 'description', 'isActive'],
                required: false
            });
        }
        const { count, rows } = await MemberDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['lastName', 'ASC'], ['firstName', 'ASC']],
            include: include,
        });
        return { members: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all members: ${error.message}`);
    }
};
exports.getAllMembers = getAllMembers;
const getMemberById = async (id, includeFamily = false, includeMinistries = false, includeSmallGroups = false, includeContributions = false, includeLedMinistries = false) => {
    try {
        const include = [];
        if (includeFamily) {
            include.push({
                model: FamilyDbModel,
                as: 'family',
                attributes: ['id', 'familyName', 'address', 'city', 'county'],
                required: false
            });
        }
        if (includeMinistries) {
            include.push({
                model: MinistryDbModel,
                as: 'ministries',
                attributes: ['id', 'name', 'description', 'isActive'],
                through: {
                    model: MinistryMemberDbModel,
                    attributes: ['role', 'startDate', 'endDate']
                },
                required: false
            });
        }
        if (includeSmallGroups) {
            include.push({
                model: SmallGroupDbModel,
                as: 'smallGroups',
                attributes: ['id', 'name', 'description', 'meetingDay', 'meetingTime'],
                through: {
                    model: SmallGroupMemberDbModel,
                    attributes: ['role', 'startDate', 'endDate']
                },
                required: false
            });
        }
        if (includeContributions) {
            include.push({
                model: ContributionDbModel,
                as: 'contributions',
                attributes: ['id', 'amount', 'contributionType', 'contributionDate', 'paymentMethod', 'transactionId', 'notes'],
                required: false
            });
        }
        if (includeLedMinistries) {
            include.push({
                model: MinistryDbModel,
                as: 'ledMinistries',
                attributes: ['id', 'name', 'description', 'isActive'],
                required: false
            });
        }
        const member = await MemberDbModel.findByPk(id, { include });
        return member;
    }
    catch (error) {
        throw new Error(`Service error fetching member by ID ${id}: ${error.message}`);
    }
};
exports.getMemberById = getMemberById;
const updateMember = async (id, memberData) => {
    try {
        const member = await MemberDbModel.findByPk(id);
        if (!member) {
            return null;
        }
        if (memberData.email && memberData.email !== member.email) {
            const existingEmail = await MemberDbModel.findOne({ where: { email: memberData.email } });
            if (existingEmail && existingEmail.id !== id) {
                throw new Error(`Email '${memberData.email}' is already taken by another member.`);
            }
        }
        if (memberData.phoneNumber && memberData.phoneNumber !== member.phoneNumber) {
            const existingPhone = await MemberDbModel.findOne({ where: { phoneNumber: memberData.phoneNumber } });
            if (existingPhone && existingPhone.id !== id) {
                throw new Error(`Phone number '${memberData.phoneNumber}' is already taken by another member.`);
            }
        }
        const fieldsToUpdate = { ...memberData };
        if (memberData.familyId !== undefined) {
            if (memberData.familyId === null) {
                fieldsToUpdate.familyId = null;
            }
            else {
                const familyExists = await FamilyDbModel.findByPk(memberData.familyId);
                if (!familyExists) {
                    throw new Error(`Family with ID ${memberData.familyId} not found for update.`);
                }
                fieldsToUpdate.familyId = memberData.familyId;
            }
        }
        else {
            delete fieldsToUpdate.familyId;
        }
        const [updatedRowsCount] = await MemberDbModel.update(fieldsToUpdate, {
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

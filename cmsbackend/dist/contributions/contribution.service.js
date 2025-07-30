'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContribution = exports.updateContribution = exports.getContributionById = exports.getAllContributions = exports.createContribution = void 0;
const _models_1 = __importDefault(require("@models"));
const sequelize_1 = require("sequelize");
const ContributionDbModel = _models_1.default.Contribution;
const MemberDbModel = _models_1.default.Member;
const AGGREGATED_CONTRIBUTION_TYPES = ['Tithe', 'Offering'];
const createContribution = async (data) => {
    try {
        let { memberId, contributorName, amount, contributionDate, contributionType, ...rest } = data;
        if (amount <= 0) {
            throw new Error('Contribution amount must be a positive number.');
        }
        if (!contributionType) {
            throw new Error('Contribution type is required.');
        }
        if (!contributionDate) {
            throw new Error('Contribution date is required.');
        }
        if (AGGREGATED_CONTRIBUTION_TYPES.includes(contributionType)) {
            if (memberId !== undefined && memberId !== null) {
                throw new Error(`Tithes and Offerings are recorded as daily totals. Member ID should not be provided for type '${contributionType}'.`);
            }
            if (contributorName !== undefined && contributorName !== null && contributorName.trim() !== '') {
                throw new Error(`Tithes and Offerrings are recorded as daily totals. Contributor name should not be provided for type '${contributionType}'.`);
            }
            memberId = null;
            contributorName = null;
            const existingTotal = await ContributionDbModel.findOne({
                where: {
                    contributionType: contributionType,
                    contributionDate: new Date(contributionDate),
                    memberId: null,
                    contributorName: null
                }
            });
            if (existingTotal) {
                existingTotal.amount = parseFloat(existingTotal.amount.toString()) + amount;
                await existingTotal.save();
                return existingTotal;
            }
        }
        else {
            if (!memberId && !contributorName) {
                throw new Error(`For contribution type '${contributionType}', either a member ID or a contributor name must be provided.`);
            }
            if (memberId) {
                const member = await MemberDbModel.findByPk(memberId);
                if (!member) {
                    throw new Error(`Member with ID ${memberId} not found.`);
                }
            }
        }
        const newContribution = await ContributionDbModel.create({
            memberId,
            contributorName,
            amount,
            contributionDate: new Date(contributionDate),
            contributionType,
            ...rest,
        });
        if (!AGGREGATED_CONTRIBUTION_TYPES.includes(newContribution.contributionType)) {
            const createdWithMember = await ContributionDbModel.findByPk(newContribution.id, {
                include: [{
                        model: MemberDbModel,
                        as: 'contributorMember',
                        attributes: ['id', 'firstName', 'lastName']
                    }]
            });
            return createdWithMember;
        }
        return newContribution;
    }
    catch (error) {
        console.error('Service error creating contribution:', error.message);
        throw new Error(`Service error creating contribution: ${error.message}`);
    }
};
exports.createContribution = createContribution;
const getAllContributions = async (filters, limit, offset) => {
    try {
        const where = {};
        const include = [];
        if (filters.type) {
            where.contributionType = filters.type;
        }
        if (filters.memberId) {
            where.memberId = filters.memberId;
            include.push({
                model: MemberDbModel,
                as: 'contributorMember',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
                required: true
            });
        }
        else {
            include.push({
                model: MemberDbModel,
                as: 'contributorMember',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
                required: false
            });
        }
        if (filters.startDate && filters.endDate) {
            where.contributionDate = {
                [sequelize_1.Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
            };
        }
        else if (filters.startDate) {
            where.contributionDate = {
                [sequelize_1.Op.gte]: new Date(filters.startDate)
            };
        }
        else if (filters.endDate) {
            where.contributionDate = {
                [sequelize_1.Op.lte]: new Date(filters.endDate)
            };
        }
        const { count, rows } = await ContributionDbModel.findAndCountAll({
            where,
            limit,
            offset,
            order: [['contributionDate', 'DESC']],
            include: include
        });
        return { contributions: rows, totalCount: count };
    }
    catch (error) {
        console.error('Service error fetching all contributions:', error.message);
        throw new Error(`Service error fetching all contributions: ${error.message}`);
    }
};
exports.getAllContributions = getAllContributions;
const getContributionById = async (id) => {
    try {
        const contribution = await ContributionDbModel.findByPk(id, {
            include: [{
                    model: MemberDbModel,
                    as: 'contributorMember',
                    attributes: ['id', 'firstName', 'lastName', 'email', 'phoneNumber'],
                    required: false
                }]
        });
        return contribution;
    }
    catch (error) {
        console.error(`Service error fetching contribution by ID ${id}:`, error.message);
        throw new Error(`Service error fetching contribution by ID ${id}: ${error.message}`);
    }
};
exports.getContributionById = getContributionById;
const updateContribution = async (id, contributionData) => {
    try {
        const contribution = await ContributionDbModel.findByPk(id);
        if (!contribution) {
            return null;
        }
        let { memberId, contributorName, amount, contributionDate, contributionType, ...rest } = contributionData;
        const originalContributionType = contribution.contributionType;
        const isOriginalAggregated = AGGREGATED_CONTRIBUTION_TYPES.includes(originalContributionType);
        const isNewAggregated = AGGREGATED_CONTRIBUTION_TYPES.includes(contributionType || originalContributionType);
        if (contributionType && contributionType !== originalContributionType) {
            if ((isOriginalAggregated && !isNewAggregated) || (!isOriginalAggregated && isNewAggregated)) {
                throw new Error(`Changing contribution type from '${originalContributionType}' to '${contributionType}' is not allowed due to privacy rules (cannot change aggregated type to identifiable or vice-versa).`);
            }
        }
        if (isOriginalAggregated || isNewAggregated) {
            if (memberId !== undefined && memberId !== null) {
                throw new Error(`Cannot set member ID for aggregated contribution type '${originalContributionType}'.`);
            }
            if (contributorName !== undefined && contributorName !== null && contributorName.trim() !== '') {
                throw new Error(`Cannot set contributor name for aggregated contribution type '${originalContributionType}'.`);
            }
            memberId = null;
            contributorName = null;
        }
        else {
            if (memberId !== undefined && memberId !== null) {
                const member = await MemberDbModel.findByPk(memberId);
                if (!member) {
                    throw new Error(`Member with ID ${memberId} not found for update.`);
                }
            }
        }
        if (amount !== undefined && amount <= 0) {
            throw new Error('Contribution amount must be a positive number.');
        }
        const updatePayload = {
            memberId,
            contributorName,
            amount,
            contributionType,
            ...rest
        };
        if (contributionDate !== undefined) {
            updatePayload.contributionDate = new Date(contributionDate);
        }
        const [updatedRowsCount] = await ContributionDbModel.update(updatePayload, {
            where: { id },
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedContribution = await ContributionDbModel.findByPk(id, {
            include: [{
                    model: MemberDbModel,
                    as: 'contributorMember',
                    attributes: ['id', 'firstName', 'lastName']
                }]
        });
        return updatedContribution;
    }
    catch (error) {
        console.error(`Service error updating contribution with ID ${id}:`, error.message);
        throw new Error(`Service error updating contribution with ID ${id}: ${error.message}`);
    }
};
exports.updateContribution = updateContribution;
const deleteContribution = async (id) => {
    try {
        const deletedRowCount = await ContributionDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        console.error(`Service error deleting contribution with ID ${id}:`, error.message);
        throw new Error(`Service error deleting contribution with ID ${id}: ${error.message}`);
    }
};
exports.deleteContribution = deleteContribution;

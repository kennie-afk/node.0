"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContribution = exports.updateContribution = exports.getContributionById = exports.getAllContributions = exports.createContribution = void 0;
const _models_1 = __importDefault(require("@models"));
const ContributionDbModel = _models_1.default.Contribution;
const createContribution = async (contributionData) => {
    try {
        const newContribution = await ContributionDbModel.create(contributionData);
        return newContribution;
    }
    catch (error) {
        throw new Error(`Service error creating contribution: ${error.message}`);
    }
};
exports.createContribution = createContribution;
const getAllContributions = async (memberId) => {
    try {
        const whereClause = {};
        if (memberId) {
            whereClause.memberId = memberId;
        }
        const contributions = await ContributionDbModel.findAll({
            where: whereClause,
            include: [
                {
                    model: _models_1.default.Member,
                    as: 'member', // ← Must match the 'as' in model
                    attributes: ['firstName', 'lastName']
                }
            ],
            order: [['date', 'DESC']]
        });
        return contributions;
    }
    catch (error) {
        throw new Error(`Service error fetching contributions: ${error.message}`);
    }
};
exports.getAllContributions = getAllContributions;
const getContributionById = async (id) => {
    try {
        const contribution = await ContributionDbModel.findByPk(id, {
            include: [
                {
                    model: _models_1.default.Member,
                    as: 'member',
                    attributes: ['firstName', 'lastName']
                }
            ]
        });
        return contribution;
    }
    catch (error) {
        throw new Error(`Service error fetching contribution by ID ${id}: ${error.message}`);
    }
};
exports.getContributionById = getContributionById;
const updateContribution = async (id, contributionData) => {
    try {
        const [updatedRowsCount] = await ContributionDbModel.update(contributionData, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedContribution = await ContributionDbModel.findByPk(id);
        return updatedContribution;
    }
    catch (error) {
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
        throw new Error(`Service error deleting contribution with ID ${id}: ${error.message}`);
    }
};
exports.deleteContribution = deleteContribution;

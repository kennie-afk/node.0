'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteContribution = exports.updateContribution = exports.getContributionById = exports.getAllContributions = exports.createContribution = void 0;
const contributionService = __importStar(require("./contribution.service"));
const createContribution = async (req, res) => {
    try {
        const newContribution = await contributionService.createContribution(req.body);
        return res.status(201).json(newContribution);
    }
    catch (error) {
        console.error('Error in createContribution controller:', error.message);
        if (error.message.includes('required.') || error.message.includes('positive number.') ||
            error.message.includes('Member with ID') || error.message.includes('Either a member ID') ||
            error.message.includes('Tithes and Offerings are recorded as daily totals') ||
            error.message.includes('A total for')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create contribution.' });
    }
};
exports.createContribution = createContribution;
const getAllContributions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const { contributions, totalCount } = await contributionService.getAllContributions(filters, limit, offset);
        return res.status(200).json({
            data: contributions,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllContributions controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve contributions.' });
    }
};
exports.getAllContributions = getAllContributions;
const getContributionById = async (req, res) => {
    try {
        const { id } = req.params;
        const contribution = await contributionService.getContributionById(Number(id));
        if (!contribution) {
            return res.status(404).json({ message: 'Contribution not found.' });
        }
        return res.status(200).json(contribution);
    }
    catch (error) {
        console.error('Error in getContributionById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve contribution.' });
    }
};
exports.getContributionById = getContributionById;
const updateContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedContribution = await contributionService.updateContribution(Number(id), req.body);
        if (!updatedContribution) {
            return res.status(404).json({ message: 'Contribution not found or no changes made.' });
        }
        return res.status(200).json(updatedContribution);
    }
    catch (error) {
        console.error('Error in updateContribution controller:', error.message);
        if (error.message.includes('not found for update.') ||
            error.message.includes('Contribution not found') ||
            error.message.includes('amount must be a positive number') ||
            error.message.includes('Cannot set member ID for contribution type') ||
            error.message.includes('Cannot set contributor name for contribution type') ||
            error.message.includes('Changing contribution type')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update contribution.' });
    }
};
exports.updateContribution = updateContribution;
const deleteContribution = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await contributionService.deleteContribution(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Contribution not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteContribution controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete contribution.' });
    }
};
exports.deleteContribution = deleteContribution;

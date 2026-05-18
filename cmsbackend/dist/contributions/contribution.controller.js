"use strict";
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
const errors_1 = require("../utils/errors");
const createContribution = async (req, res) => {
    try {
        const newContribution = await contributionService.createContribution(req.body);
        return res.status(201).json(newContribution);
    }
    catch (error) {
        throw error;
    }
};
exports.createContribution = createContribution;
const getAllContributions = async (req, res) => {
    try {
        let memberId = undefined;
        if (req.query.memberId) {
            const parsedId = Number(req.query.memberId);
            if (isNaN(parsedId) || parsedId <= 0) {
                throw new errors_1.BadRequestError('Invalid memberId provided');
            }
            memberId = parsedId;
        }
        const contributions = await contributionService.getAllContributions(memberId);
        return res.status(200).json(contributions);
    }
    catch (error) {
        throw error;
    }
};
exports.getAllContributions = getAllContributions;
const getContributionById = async (req, res) => {
    try {
        const contribution = await contributionService.getContributionById(Number(req.params.id));
        if (!contribution) {
            throw new errors_1.NotFoundError('Contribution not found.');
        }
        return res.status(200).json(contribution);
    }
    catch (error) {
        throw error;
    }
};
exports.getContributionById = getContributionById;
const updateContribution = async (req, res) => {
    try {
        const updatedContribution = await contributionService.updateContribution(Number(req.params.id), req.body);
        if (!updatedContribution) {
            throw new errors_1.NotFoundError('Contribution not found or no changes made.');
        }
        return res.status(200).json(updatedContribution);
    }
    catch (error) {
        throw error;
    }
};
exports.updateContribution = updateContribution;
const deleteContribution = async (req, res) => {
    try {
        const deletedRowCount = await contributionService.deleteContribution(Number(req.params.id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Contribution not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteContribution = deleteContribution;

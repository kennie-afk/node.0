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
exports.getMembersOfMinistry = exports.removeMemberFromMinistry = exports.addMemberToMinistry = exports.deleteMinistry = exports.updateMinistry = exports.getMinistryById = exports.getAllMinistries = exports.createMinistry = void 0;
const ministryService = __importStar(require("./ministry.service"));
const errors_1 = require("../utils/errors");
const createMinistry = async (req, res) => {
    try {
        const newMinistry = await ministryService.createMinistry(req.body);
        return res.status(201).json(newMinistry);
    }
    catch (error) {
        throw error;
    }
};
exports.createMinistry = createMinistry;
const getAllMinistries = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const { ministries, totalCount } = await ministryService.getAllMinistries(filters, limit, offset);
        return res.status(200).json({ data: ministries, meta: { totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) } });
    }
    catch (error) {
        throw error;
    }
};
exports.getAllMinistries = getAllMinistries;
const getMinistryById = async (req, res) => {
    try {
        const ministry = await ministryService.getMinistryById(Number(req.params.id));
        if (!ministry)
            throw new errors_1.NotFoundError('Ministry not found.');
        return res.status(200).json(ministry);
    }
    catch (error) {
        throw error;
    }
};
exports.getMinistryById = getMinistryById;
const updateMinistry = async (req, res) => {
    try {
        const updatedMinistry = await ministryService.updateMinistry(Number(req.params.id), req.body);
        if (!updatedMinistry)
            throw new errors_1.NotFoundError('Ministry not found or no changes made.');
        return res.status(200).json(updatedMinistry);
    }
    catch (error) {
        throw error;
    }
};
exports.updateMinistry = updateMinistry;
const deleteMinistry = async (req, res) => {
    try {
        const deletedRowCount = await ministryService.deleteMinistry(Number(req.params.id));
        if (deletedRowCount === 0)
            throw new errors_1.NotFoundError('Ministry not found.');
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteMinistry = deleteMinistry;
const addMemberToMinistry = async (req, res) => {
    try {
        const { ministryId } = req.params;
        const { memberId, role } = req.body;
        const result = await ministryService.addMemberToMinistry(Number(ministryId), memberId, role);
        return res.status(201).json(result);
    }
    catch (error) {
        throw error;
    }
};
exports.addMemberToMinistry = addMemberToMinistry;
const removeMemberFromMinistry = async (req, res) => {
    try {
        const { ministryId } = req.params;
        const { memberId } = req.body;
        const deletedCount = await ministryService.removeMemberFromMinistry(Number(ministryId), memberId);
        if (deletedCount === 0)
            throw new errors_1.NotFoundError('Member not found in this ministry.');
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.removeMemberFromMinistry = removeMemberFromMinistry;
const getMembersOfMinistry = async (req, res) => {
    try {
        const members = await ministryService.getMembersOfMinistry(Number(req.params.ministryId));
        return res.status(200).json(members);
    }
    catch (error) {
        throw error;
    }
};
exports.getMembersOfMinistry = getMembersOfMinistry;

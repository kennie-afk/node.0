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
const createMinistry = async (req, res) => {
    try {
        const ministryData = req.body;
        const newMinistry = await ministryService.createMinistry(ministryData);
        return res.status(201).json(newMinistry);
    }
    catch (error) {
        console.error('Error in createMinistry controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already exists')) {
            return res.status(409).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create ministry.' });
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
        return res.status(200).json({
            data: ministries,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllMinistries controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve ministries.' });
    }
};
exports.getAllMinistries = getAllMinistries;
const getMinistryById = async (req, res) => {
    try {
        const { id } = req.params;
        const ministry = await ministryService.getMinistryById(Number(id));
        if (!ministry) {
            return res.status(404).json({ message: 'Ministry not found.' });
        }
        return res.status(200).json(ministry);
    }
    catch (error) {
        console.error('Error in getMinistryById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve ministry.' });
    }
};
exports.getMinistryById = getMinistryById;
const updateMinistry = async (req, res) => {
    try {
        const { id } = req.params;
        const ministryData = req.body;
        const updatedMinistry = await ministryService.updateMinistry(Number(id), ministryData);
        if (!updatedMinistry) {
            return res.status(404).json({ message: 'Ministry not found or no changes made.' });
        }
        return res.status(200).json(updatedMinistry);
    }
    catch (error) {
        console.error('Error in updateMinistry controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already exists')) {
            return res.status(409).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update ministry.' });
    }
};
exports.updateMinistry = updateMinistry;
const deleteMinistry = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await ministryService.deleteMinistry(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Ministry not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteMinistry controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete ministry.' });
    }
};
exports.deleteMinistry = deleteMinistry;
const addMemberToMinistry = async (req, res) => {
    try {
        const { ministryId, memberId } = req.params;
        const { role } = req.body;
        const ministryMember = await ministryService.addMemberToMinistry(Number(ministryId), Number(memberId), role);
        return res.status(201).json(ministryMember);
    }
    catch (error) {
        console.error('Error in addMemberToMinistry controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already part of')) {
            return res.status(409).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to add member to ministry.' });
    }
};
exports.addMemberToMinistry = addMemberToMinistry;
const removeMemberFromMinistry = async (req, res) => {
    try {
        const { ministryId, memberId } = req.params;
        const deletedCount = await ministryService.removeMemberFromMinistry(Number(ministryId), Number(memberId));
        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Member not found in this ministry.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in removeMemberFromMinistry controller:', error.message);
        return res.status(500).json({ message: 'Failed to remove member from ministry.' });
    }
};
exports.removeMemberFromMinistry = removeMemberFromMinistry;
const getMembersOfMinistry = async (req, res) => {
    try {
        const { ministryId } = req.params;
        const members = await ministryService.getMembersOfMinistry(Number(ministryId));
        return res.status(200).json(members);
    }
    catch (error) {
        console.error('Error in getMembersOfMinistry controller:', error.message);
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to retrieve members of ministry.' });
    }
};
exports.getMembersOfMinistry = getMembersOfMinistry;

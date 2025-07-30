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
exports.deleteMember = exports.updateMember = exports.getMemberById = exports.getAllMembers = exports.createMember = void 0;
const memberService = __importStar(require("./member.service"));
const createMember = async (req, res) => {
    try {
        const memberData = req.body;
        const newMember = await memberService.createMember(memberData);
        return res.status(201).json(newMember);
    }
    catch (error) {
        console.error('Error in createMember controller:', error.message);
        if (error.message.includes('Unique constraint error')) {
            const field = error.message.split(': ')[1].split(' ')[0];
            return res.status(409).json({ message: `${field} already exists.` });
        }
        if (error.message.includes('required.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create member.' });
    }
};
exports.createMember = createMember;
const getAllMembers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const includeFamily = filters.includeFamily === 'true';
        const includeMinistries = filters.includeMinistries === 'true';
        const includeSmallGroups = filters.includeSmallGroups === 'true';
        const includeContributions = filters.includeContributions === 'true';
        const includeLedMinistries = filters.includeLedMinistries === 'true';
        const { members, totalCount } = await memberService.getAllMembers({
            ...filters,
            includeFamily,
            includeMinistries,
            includeSmallGroups,
            includeContributions,
            includeLedMinistries
        }, limit, offset);
        return res.status(200).json({
            data: members,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllMembers controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve members.' });
    }
};
exports.getAllMembers = getAllMembers;
const getMemberById = async (req, res) => {
    try {
        const { id } = req.params;
        const includeFamily = req.query.includeFamily === 'true';
        const includeMinistries = req.query.includeMinistries === 'true';
        const includeSmallGroups = req.query.includeSmallGroups === 'true';
        const includeContributions = req.query.includeContributions === 'true';
        const includeLedMinistries = req.query.includeLedMinistries === 'true';
        const member = await memberService.getMemberById(Number(id), includeFamily, includeMinistries, includeSmallGroups, includeContributions, includeLedMinistries);
        if (!member) {
            return res.status(404).json({ message: 'Member not found.' });
        }
        return res.status(200).json(member);
    }
    catch (error) {
        console.error('Error in getMemberById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve member.' });
    }
};
exports.getMemberById = getMemberById;
const updateMember = async (req, res) => {
    try {
        const { id } = req.params;
        const memberData = req.body;
        const updatedMember = await memberService.updateMember(Number(id), memberData);
        if (!updatedMember) {
            return res.status(404).json({ message: 'Member not found or no changes made.' });
        }
        return res.status(200).json(updatedMember);
    }
    catch (error) {
        console.error('Error in updateMember controller:', error.message);
        if (error.message.includes('Unique constraint error')) {
            const field = error.message.split(': ')[1].split(' ')[0];
            return res.status(409).json({ message: `${field} already exists.` });
        }
        if (error.message.includes('not found for update.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update member.' });
    }
};
exports.updateMember = updateMember;
const deleteMember = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await memberService.deleteMember(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Member not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteMember controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete member.' });
    }
};
exports.deleteMember = deleteMember;

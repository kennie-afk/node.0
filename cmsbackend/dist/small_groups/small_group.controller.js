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
exports.getMembersOfSmallGroup = exports.removeMemberFromSmallGroup = exports.addMemberToSmallGroup = exports.deleteSmallGroup = exports.updateSmallGroup = exports.getSmallGroupById = exports.getAllSmallGroups = exports.createSmallGroup = void 0;
const smallGroupService = __importStar(require("./small_group.service"));
const errors_1 = require("../utils/errors");
const createSmallGroup = async (req, res) => {
    try {
        const newSmallGroup = await smallGroupService.createSmallGroup(req.body);
        return res.status(201).json(newSmallGroup);
    }
    catch (error) {
        throw error;
    }
};
exports.createSmallGroup = createSmallGroup;
const getAllSmallGroups = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const { smallGroups, totalCount } = await smallGroupService.getAllSmallGroups(filters, limit, offset);
        return res.status(200).json({
            data: smallGroups,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        throw error;
    }
};
exports.getAllSmallGroups = getAllSmallGroups;
const getSmallGroupById = async (req, res) => {
    try {
        const { id } = req.params;
        const smallGroup = await smallGroupService.getSmallGroupById(Number(id));
        if (!smallGroup) {
            throw new errors_1.NotFoundError('Small Group not found.');
        }
        return res.status(200).json(smallGroup);
    }
    catch (error) {
        throw error;
    }
};
exports.getSmallGroupById = getSmallGroupById;
const updateSmallGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const smallGroupData = req.body;
        const updatedSmallGroup = await smallGroupService.updateSmallGroup(Number(id), smallGroupData);
        if (!updatedSmallGroup) {
            throw new errors_1.NotFoundError('Small Group not found or no changes made.');
        }
        return res.status(200).json(updatedSmallGroup);
    }
    catch (error) {
        throw error;
    }
};
exports.updateSmallGroup = updateSmallGroup;
const deleteSmallGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await smallGroupService.deleteSmallGroup(Number(id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Small Group not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteSmallGroup = deleteSmallGroup;
const addMemberToSmallGroup = async (req, res) => {
    try {
        const { smallGroupId, memberId } = req.params;
        const { role } = req.body;
        const smallGroupMember = await smallGroupService.addMemberToSmallGroup(Number(smallGroupId), Number(memberId), role);
        return res.status(201).json(smallGroupMember);
    }
    catch (error) {
        throw error;
    }
};
exports.addMemberToSmallGroup = addMemberToSmallGroup;
const removeMemberFromSmallGroup = async (req, res) => {
    try {
        const { smallGroupId, memberId } = req.params;
        const deletedCount = await smallGroupService.removeMemberFromSmallGroup(Number(smallGroupId), Number(memberId));
        if (deletedCount === 0) {
            throw new errors_1.NotFoundError('Member not found in this small group.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.removeMemberFromSmallGroup = removeMemberFromSmallGroup;
const getMembersOfSmallGroup = async (req, res) => {
    try {
        const { smallGroupId } = req.params;
        const members = await smallGroupService.getMembersOfSmallGroup(Number(smallGroupId));
        if (!members) {
            throw new errors_1.NotFoundError('Small Group not found.');
        }
        return res.status(200).json(members);
    }
    catch (error) {
        throw error;
    }
};
exports.getMembersOfSmallGroup = getMembersOfSmallGroup;

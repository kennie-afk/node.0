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
const errors_1 = require("../utils/errors");
const createMember = async (req, res) => {
    try {
        const newMember = await memberService.createMember(req.body);
        return res.status(201).json(newMember);
    }
    catch (error) {
        throw error;
    }
};
exports.createMember = createMember;
const getAllMembers = async (req, res) => {
    try {
        const members = await memberService.getAllMembers();
        return res.status(200).json(members);
    }
    catch (error) {
        throw error;
    }
};
exports.getAllMembers = getAllMembers;
const getMemberById = async (req, res) => {
    try {
        const member = await memberService.getMemberById(Number(req.params.id));
        if (!member) {
            throw new errors_1.NotFoundError('Member not found.');
        }
        return res.status(200).json(member);
    }
    catch (error) {
        throw error;
    }
};
exports.getMemberById = getMemberById;
const updateMember = async (req, res) => {
    try {
        const updatedMember = await memberService.updateMember(Number(req.params.id), req.body);
        if (!updatedMember) {
            throw new errors_1.NotFoundError('Member not found or no changes made.');
        }
        return res.status(200).json(updatedMember);
    }
    catch (error) {
        throw error;
    }
};
exports.updateMember = updateMember;
const deleteMember = async (req, res) => {
    try {
        const deletedRowCount = await memberService.deleteMember(Number(req.params.id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Member not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteMember = deleteMember;

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
exports.deleteFamily = exports.updateFamily = exports.getFamilyById = exports.getAllFamilies = exports.createFamily = void 0;
const familyService = __importStar(require("./family.service"));
const createFamily = async (req, res) => {
    try {
        const familyData = req.body;
        const newFamily = await familyService.createFamily(familyData);
        return res.status(201).json(newFamily);
    }
    catch (error) {
        console.error('Error creating family:', error);
        if (error.message.includes('required.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('Unique constraint error')) {
            return res.status(409).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create family.' });
    }
};
exports.createFamily = createFamily;
const getAllFamilies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = req.query;
        const { families, totalCount } = await familyService.getAllFamilies(filters, limit, offset);
        return res.status(200).json({
            data: families,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error fetching families:', error);
        return res.status(500).json({ message: 'Failed to retrieve families.' });
    }
};
exports.getAllFamilies = getAllFamilies;
const getFamilyById = async (req, res) => {
    try {
        const { id } = req.params;
        const family = await familyService.getFamilyById(Number(id));
        if (!family) {
            return res.status(404).json({ message: 'Family not found.' });
        }
        return res.status(200).json(family);
    }
    catch (error) {
        console.error('Error fetching family by ID:', error);
        return res.status(500).json({ message: 'Failed to retrieve family.' });
    }
};
exports.getFamilyById = getFamilyById;
const updateFamily = async (req, res) => {
    try {
        const { id } = req.params;
        const familyData = req.body;
        const updatedFamily = await familyService.updateFamily(Number(id), familyData);
        if (!updatedFamily) {
            return res.status(404).json({ message: 'Family not found or no changes made.' });
        }
        return res.status(200).json(updatedFamily);
    }
    catch (error) {
        if (error.message.includes('not found for update.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('Unique constraint error')) {
            return res.status(409).json({ message: error.message });
        }
        console.error('Error updating family:', error);
        return res.status(500).json({ message: 'Failed to update family.' });
    }
};
exports.updateFamily = updateFamily;
const deleteFamily = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await familyService.deleteFamily(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Family not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error deleting family:', error);
        return res.status(500).json({ message: 'Failed to delete family.' });
    }
};
exports.deleteFamily = deleteFamily;

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
exports.deleteSermon = exports.updateSermon = exports.getSermonById = exports.getAllSermons = exports.createSermon = void 0;
const sermonService = __importStar(require("./sermon.service"));
const createSermon = async (req, res) => {
    try {
        const newSermon = await sermonService.createSermon(req.body);
        return res.status(201).json(newSermon);
    }
    catch (error) {
        console.error('Error in createSermon controller:', error.message);
        if (error.message.includes('required.')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message.includes('not found.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create sermon.' });
    }
};
exports.createSermon = createSermon;
const getAllSermons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { sermons, totalCount } = await sermonService.getAllSermons(limit, offset);
        return res.status(200).json({
            data: sermons,
            meta: {
                totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    }
    catch (error) {
        console.error('Error in getAllSermons controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve sermons.' });
    }
};
exports.getAllSermons = getAllSermons;
const getSermonById = async (req, res) => {
    try {
        const { id } = req.params;
        const sermon = await sermonService.getSermonById(Number(id));
        if (!sermon) {
            return res.status(404).json({ message: 'Sermon not found.' });
        }
        return res.status(200).json(sermon);
    }
    catch (error) {
        console.error('Error in getSermonById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve sermon.' });
    }
};
exports.getSermonById = getSermonById;
const updateSermon = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedSermon = await sermonService.updateSermon(Number(id), req.body);
        if (!updatedSermon) {
            return res.status(404).json({ message: 'Sermon not found or no changes made.' });
        }
        return res.status(200).json(updatedSermon);
    }
    catch (error) {
        console.error('Error in updateSermon controller:', error.message);
        if (error.message.includes('not found for update.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to update sermon.' });
    }
};
exports.updateSermon = updateSermon;
const deleteSermon = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await sermonService.deleteSermon(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'Sermon not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteSermon controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete sermon.' });
    }
};
exports.deleteSermon = deleteSermon;

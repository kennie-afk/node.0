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
const errors_1 = require("../utils/errors");
const createSermon = async (req, res) => {
    try {
        const newSermon = await sermonService.createSermon(req.body);
        return res.status(201).json(newSermon);
    }
    catch (error) {
        throw error;
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
        throw error;
    }
};
exports.getAllSermons = getAllSermons;
const getSermonById = async (req, res) => {
    try {
        const { id } = req.params;
        const sermon = await sermonService.getSermonById(Number(id));
        if (!sermon) {
            throw new errors_1.NotFoundError('Sermon not found.');
        }
        return res.status(200).json(sermon);
    }
    catch (error) {
        throw error;
    }
};
exports.getSermonById = getSermonById;
const updateSermon = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedSermon = await sermonService.updateSermon(Number(id), req.body);
        if (!updatedSermon) {
            throw new errors_1.NotFoundError('Sermon not found or no changes made.');
        }
        return res.status(200).json(updatedSermon);
    }
    catch (error) {
        throw error;
    }
};
exports.updateSermon = updateSermon;
const deleteSermon = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await sermonService.deleteSermon(Number(id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Sermon not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteSermon = deleteSermon;

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
const errors_1 = require("../utils/errors");
const createFamily = async (req, res) => {
    try {
        const newFamily = await familyService.createFamily(req.body);
        return res.status(201).json(newFamily);
    }
    catch (error) {
        throw error;
    }
};
exports.createFamily = createFamily;
const getAllFamilies = async (req, res) => {
    try {
        const families = await familyService.getAllFamilies();
        return res.status(200).json(families);
    }
    catch (error) {
        throw error;
    }
};
exports.getAllFamilies = getAllFamilies;
const getFamilyById = async (req, res) => {
    try {
        const family = await familyService.getFamilyById(Number(req.params.id));
        if (!family) {
            throw new errors_1.NotFoundError('Family not found.');
        }
        return res.status(200).json(family);
    }
    catch (error) {
        throw error;
    }
};
exports.getFamilyById = getFamilyById;
const updateFamily = async (req, res) => {
    try {
        const updatedFamily = await familyService.updateFamily(Number(req.params.id), req.body);
        if (!updatedFamily) {
            throw new errors_1.NotFoundError('Family not found or no changes made.');
        }
        return res.status(200).json(updatedFamily);
    }
    catch (error) {
        throw error;
    }
};
exports.updateFamily = updateFamily;
const deleteFamily = async (req, res) => {
    try {
        const deletedRowCount = await familyService.deleteFamily(Number(req.params.id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('Family not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteFamily = deleteFamily;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFamily = exports.updateFamily = exports.getFamilyById = exports.getAllFamilies = exports.createFamily = void 0;
const _models_1 = __importDefault(require("@models"));
const errors_1 = require("../utils/errors");
const FamilyDbModel = _models_1.default.Family;
const createFamily = async (familyData) => {
    try {
        const newFamily = await FamilyDbModel.create(familyData);
        return newFamily;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new errors_1.BadRequestError('Family with this name already exists.');
        }
        throw new Error(`Service error creating family: ${error.message}`);
    }
};
exports.createFamily = createFamily;
const getAllFamilies = async () => {
    try {
        const families = await FamilyDbModel.findAll();
        return families;
    }
    catch (error) {
        throw new Error(`Service error fetching all families: ${error.message}`);
    }
};
exports.getAllFamilies = getAllFamilies;
const getFamilyById = async (id) => {
    try {
        const family = await FamilyDbModel.findByPk(id);
        return family;
    }
    catch (error) {
        throw new Error(`Service error fetching family by ID ${id}: ${error.message}`);
    }
};
exports.getFamilyById = getFamilyById;
const updateFamily = async (id, familyData) => {
    try {
        const [updatedRowsCount] = await FamilyDbModel.update(familyData, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedFamily = await FamilyDbModel.findByPk(id);
        return updatedFamily;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw new errors_1.BadRequestError('Family name already in use.');
        }
        throw new Error(`Service error updating family with ID ${id}: ${error.message}`);
    }
};
exports.updateFamily = updateFamily;
const deleteFamily = async (id) => {
    try {
        const deletedRowCount = await FamilyDbModel.destroy({
            where: { id },
        });
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting family with ID ${id}: ${error.message}`);
    }
};
exports.deleteFamily = deleteFamily;

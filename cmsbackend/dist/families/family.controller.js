"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFamily = exports.updateFamily = exports.getFamilyById = exports.getAllFamilies = exports.createFamily = void 0;
const _models_1 = __importDefault(require("@models"));
const Family = _models_1.default.Family;
/**
 * @param req
 * @param res
 * @returns
 */
const createFamily = async (req, res) => {
    try {
        const { familyName, headOfFamilyMemberId, address, city, county, postalCode, phoneNumber, email, notes, } = req.body;
        if (!familyName) {
            return res.status(400).json({ message: 'Family name is required.' });
        }
        const newFamily = await Family.create({
            familyName,
            headOfFamilyMemberId,
            address,
            city,
            county,
            postalCode,
            phoneNumber,
            email,
            notes,
        });
        return res.status(201).json(newFamily);
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            return res.status(409).json({ message: `Family with this ${field} already exists.` });
        }
        console.error('Error creating family:', error);
        return res.status(500).json({ message: 'Failed to create family.' });
    }
};
exports.createFamily = createFamily;
/**
 * @param req
 * @param res
 * @returns
 */
const getAllFamilies = async (req, res) => {
    try {
        const families = await Family.findAll();
        return res.status(200).json(families);
    }
    catch (error) {
        console.error('Error fetching families:', error);
        return res.status(500).json({ message: 'Failed to retrieve families.' });
    }
};
exports.getAllFamilies = getAllFamilies;
/**
 * @param req
 * @param res
 * @returns
 */
const getFamilyById = async (req, res) => {
    try {
        const { id } = req.params;
        const family = await Family.findByPk(id);
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
/**
 * @param req
 * @param res
 * @returns
 */
const updateFamily = async (req, res) => {
    try {
        const { id } = req.params;
        const [updatedRowsCount, updatedFamilies] = await Family.update(req.body, {
            where: { id },
            returning: true,
        });
        if (updatedRowsCount === 0) {
            return res.status(404).json({ message: 'Family not found or no changes made.' });
        }
        const updatedFamily = await Family.findByPk(id);
        return res.status(200).json(updatedFamily);
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            return res.status(409).json({ message: `Family with this ${field} already exists.` });
        }
        console.error('Error updating family:', error);
        return res.status(500).json({ message: 'Failed to update family.' });
    }
};
exports.updateFamily = updateFamily;
/**
 * @param req
 * @param res
 * @returns
 */
const deleteFamily = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await Family.destroy({
            where: { id },
        });
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

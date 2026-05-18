"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.createUser = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const _models_1 = __importDefault(require("@models"));
const errors_1 = require("../utils/errors");
const UserDbModel = _models_1.default.User;
const createUser = async (userData) => {
    try {
        const { username, email, password, isAdmin } = userData;
        const password_hash = await bcrypt_1.default.hash(password, 10);
        const newUser = await UserDbModel.create({
            username,
            email,
            password_hash,
            isAdmin: isAdmin !== undefined ? isAdmin : false
        });
        return newUser;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new errors_1.BadRequestError(`Unique constraint error: ${field} already exists.`);
        }
        throw new Error(`Service error creating user: ${error.message}`);
    }
};
exports.createUser = createUser;
const getAllUsers = async (limit, offset) => {
    try {
        const { count, rows } = await UserDbModel.findAndCountAll({
            limit,
            offset,
            order: [['username', 'ASC']],
        });
        return { users: rows, totalCount: count };
    }
    catch (error) {
        throw new Error(`Service error fetching all users: ${error.message}`);
    }
};
exports.getAllUsers = getAllUsers;
const getUserById = async (id) => {
    try {
        const user = await UserDbModel.findByPk(id);
        return user;
    }
    catch (error) {
        throw new Error(`Service error fetching user by ID ${id}: ${error.message}`);
    }
};
exports.getUserById = getUserById;
const updateUser = async (id, userData) => {
    try {
        const { password, ...rest } = userData;
        let updateData = { ...rest };
        // Only hash password if a new one was provided
        if (password && password.trim() !== '') {
            updateData.password_hash = await bcrypt_1.default.hash(password, 10);
        }
        const [updatedRowsCount] = await UserDbModel.update(updateData, {
            where: { id },
            individualHooks: true
        });
        // If no rows were updated, check if user exists and return it
        if (updatedRowsCount === 0) {
            const existingUser = await UserDbModel.findByPk(id);
            if (!existingUser) {
                throw new errors_1.NotFoundError('User not found');
            }
            return existingUser; // Return current user instead of throwing
        }
        const updatedUser = await UserDbModel.findByPk(id);
        if (!updatedUser) {
            throw new errors_1.NotFoundError('User not found');
        }
        return updatedUser;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new errors_1.BadRequestError(`Unique constraint error: ${field} already exists.`);
        }
        if (error instanceof errors_1.NotFoundError) {
            throw error;
        }
        throw new Error(`Service error updating user with ID ${id}: ${error.message}`);
    }
};
exports.updateUser = updateUser;
const deleteUser = async (id) => {
    try {
        const deletedRowCount = await UserDbModel.destroy({
            where: { id },
        });
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('User not found');
        }
        return deletedRowCount;
    }
    catch (error) {
        if (error instanceof errors_1.NotFoundError) {
            throw error;
        }
        throw new Error(`Service error deleting user with ID ${id}: ${error.message}`);
    }
};
exports.deleteUser = deleteUser;

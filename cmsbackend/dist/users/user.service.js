"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.createUser = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const _models_1 = __importDefault(require("@models"));
const UserDbModel = _models_1.default.User;
const createUser = async (userData) => {
    try {
        const { username, email, password, isAdmin } = userData;
        if (!username || !email || !password) {
            throw new Error('Username, email, and password are required.');
        }
        const password_hash = await bcrypt_1.default.hash(password, 10);
        const newUser = await UserDbModel.create({
            username,
            email,
            password_hash,
            isAdmin: isAdmin !== undefined ? isAdmin : true
        });
        return newUser;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: ${field} already exists.`);
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
        if (password) {
            updateData.password_hash = await bcrypt_1.default.hash(password, 10);
        }
        const [updatedRowsCount] = await UserDbModel.update(updateData, {
            where: { id },
            individualHooks: true
        });
        if (updatedRowsCount === 0) {
            return null;
        }
        const updatedUser = await UserDbModel.findByPk(id);
        return updatedUser;
    }
    catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            const field = error.errors[0].path;
            throw new Error(`Unique constraint error: ${field} already exists.`);
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
        return deletedRowCount;
    }
    catch (error) {
        throw new Error(`Service error deleting user with ID ${id}: ${error.message}`);
    }
};
exports.deleteUser = deleteUser;

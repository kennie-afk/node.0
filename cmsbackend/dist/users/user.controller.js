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
exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.createUser = void 0;
const userService = __importStar(require("./user.service"));
const errors_1 = require("../utils/errors");
const createUser = async (req, res) => {
    try {
        const { username, email, password, isAdmin } = req.body;
        const newUser = await userService.createUser({ username, email, password, isAdmin });
        const userResponse = {
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            isAdmin: newUser.isAdmin,
            createdAt: newUser.createdAt,
        };
        return res.status(201).json(userResponse);
    }
    catch (error) {
        throw error;
    }
};
exports.createUser = createUser;
const getAllUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { users, totalCount } = await userService.getAllUsers(limit, offset);
        return res.status(200).json({
            data: users,
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
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userService.getUserById(Number(id));
        if (!user) {
            throw new errors_1.NotFoundError('User not found.');
        }
        return res.status(200).json(user);
    }
    catch (error) {
        throw error;
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userData = req.body;
        if (!userData.password || userData.password.trim() === '') {
            delete userData.password;
        }
        const updatedUser = await userService.updateUser(Number(id), userData);
        if (!updatedUser) {
            const userExists = await userService.getUserById(Number(id));
            if (!userExists) {
                throw new errors_1.NotFoundError('User not found.');
            }
            return res.status(200).json(userExists);
        }
        return res.status(200).json(updatedUser);
    }
    catch (error) {
        if (error instanceof errors_1.NotFoundError) {
            return res.status(404).json({ message: error.message });
        }
        console.error('Update user error:', error);
        return res.status(500).json({ message: 'Failed to update user' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await userService.deleteUser(Number(id));
        if (deletedRowCount === 0) {
            throw new errors_1.NotFoundError('User not found.');
        }
        return res.status(204).send();
    }
    catch (error) {
        throw error;
    }
};
exports.deleteUser = deleteUser;

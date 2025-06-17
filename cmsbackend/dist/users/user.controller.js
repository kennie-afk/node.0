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
const createUser = async (req, res) => {
    try {
        const { username, email, password, isAdmin } = req.body;
        const newUser = await userService.createUser({ username, email, password, isAdmin });
        return res.status(201).json({
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            isAdmin: newUser.isAdmin,
            createdAt: newUser.createdAt,
        });
    }
    catch (error) {
        console.error('Error in createUser controller:', error.message);
        if (error.message.includes('Unique constraint error')) {
            const field = error.message.split(': ')[1].replace(' already exists.', '');
            return res.status(409).json({ message: `${field} already exists.` });
        }
        if (error.message.includes('required.')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Failed to create user.' });
    }
};
exports.createUser = createUser;
const getAllUsers = async (req, res) => {
    try {
        const users = await userService.getAllUsers();
        return res.status(200).json(users);
    }
    catch (error) {
        console.error('Error in getAllUsers controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve users.' });
    }
};
exports.getAllUsers = getAllUsers;
const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await userService.getUserById(Number(id));
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        return res.status(200).json(user);
    }
    catch (error) {
        console.error('Error in getUserById controller:', error.message);
        return res.status(500).json({ message: 'Failed to retrieve user.' });
    }
};
exports.getUserById = getUserById;
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const userData = req.body;
        const updatedUser = await userService.updateUser(Number(id), userData);
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found or no changes made.' });
        }
        return res.status(200).json(updatedUser);
    }
    catch (error) {
        console.error('Error in updateUser controller:', error.message);
        if (error.message.includes('Unique constraint error')) {
            const field = error.message.split(': ')[1].replace(' already exists.', '');
            return res.status(409).json({ message: `${field} already exists.` });
        }
        return res.status(500).json({ message: 'Failed to update user.' });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRowCount = await userService.deleteUser(Number(id));
        if (deletedRowCount === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }
        return res.status(204).send();
    }
    catch (error) {
        console.error('Error in deleteUser controller:', error.message);
        return res.status(500).json({ message: 'Failed to delete user.' });
    }
};
exports.deleteUser = deleteUser;

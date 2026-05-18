"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProfile = exports.loginUser = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const _models_1 = __importDefault(require("@models"));
const errors_1 = require("../utils/errors");
const UserDbModel = _models_1.default.User;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const loginUser = async (email, password) => {
    const user = await UserDbModel.findOne({ where: { email } });
    if (!user)
        throw new errors_1.UnauthorizedError('Invalid credentials');
    const isPasswordValid = await bcrypt_1.default.compare(password, user.password_hash);
    if (!isPasswordValid)
        throw new errors_1.UnauthorizedError('Invalid credentials');
    const payload = {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin,
    };
    const token = jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: '1d' });
    return token;
};
exports.loginUser = loginUser;
const getProfile = async (userId) => {
    const user = await UserDbModel.findByPk(userId, {
        attributes: { exclude: ['password_hash'] },
    });
    if (!user)
        throw new errors_1.UnauthorizedError('User not found');
    return user;
};
exports.getProfile = getProfile;

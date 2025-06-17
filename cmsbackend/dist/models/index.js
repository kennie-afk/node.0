"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = __importDefault(require("../config/database"));
const user_model_1 = require("../users/user.model");
const family_model_1 = require("../families/family.model");
const member_model_1 = require("../members/member.model");
const db = {};
db.sequelize = database_1.default;
(0, user_model_1.initUser)(database_1.default);
(0, family_model_1.initFamily)(database_1.default);
(0, member_model_1.initMember)(database_1.default);
db.User = user_model_1.User;
db.Family = family_model_1.Family;
db.Member = member_model_1.Member;
Object.values(db).forEach(model => {
    if ('associate' in model && typeof model.associate === 'function') {
        model.associate(db);
    }
});
exports.default = db;

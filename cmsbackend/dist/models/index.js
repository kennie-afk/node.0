"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmallGroupMember = exports.MinistryMember = exports.SmallGroup = exports.Ministry = exports.Attendance = exports.Contribution = exports.Sermon = exports.Event = exports.Member = exports.Family = exports.User = exports.Announcement = void 0;
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
const announcement_model_1 = __importDefault(require("@announcements/announcement.model"));
const user_model_1 = __importDefault(require("@users/user.model"));
const family_model_1 = __importDefault(require("@families/family.model"));
const member_model_1 = __importDefault(require("@members/member.model"));
const event_model_1 = __importDefault(require("@events/event.model"));
const sermon_model_1 = __importDefault(require("@sermons/sermon.model"));
const contribution_model_1 = __importDefault(require("@contributions/contribution.model"));
const attendance_model_1 = __importDefault(require("@attendance/attendance.model"));
const ministry_model_1 = __importDefault(require("@ministries/ministry.model"));
const small_group_model_1 = __importDefault(require("@small_groups/small_group.model"));
const ministry_member_model_1 = __importDefault(require("@ministries/ministry_member.model"));
const small_group_member_model_1 = __importDefault(require("@small_groups/small_group_member.model"));
dotenv_1.default.config();
const sequelize = new sequelize_1.Sequelize(process.env.DB_NAME || 'church_cms_db', process.env.DB_USER || 'church_admin', process.env.DB_PASSWORD || '', {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV !== 'production',
    dialectOptions: {
        ssl: false,
    },
});
exports.Announcement = (0, announcement_model_1.default)(sequelize);
exports.User = (0, user_model_1.default)(sequelize);
exports.Family = (0, family_model_1.default)(sequelize);
exports.Member = (0, member_model_1.default)(sequelize);
exports.Event = (0, event_model_1.default)(sequelize);
exports.Sermon = (0, sermon_model_1.default)(sequelize);
exports.Contribution = (0, contribution_model_1.default)(sequelize);
exports.Attendance = (0, attendance_model_1.default)(sequelize);
exports.Ministry = (0, ministry_model_1.default)(sequelize);
exports.SmallGroup = (0, small_group_model_1.default)(sequelize);
exports.MinistryMember = (0, ministry_member_model_1.default)(sequelize, sequelize_1.DataTypes);
exports.SmallGroupMember = (0, small_group_member_model_1.default)(sequelize, sequelize_1.DataTypes);
const models = {
    Announcement: exports.Announcement,
    User: exports.User,
    Family: exports.Family,
    Member: exports.Member,
    Event: exports.Event,
    Sermon: exports.Sermon,
    Contribution: exports.Contribution,
    Attendance: exports.Attendance,
    Ministry: exports.Ministry,
    SmallGroup: exports.SmallGroup,
    MinistryMember: exports.MinistryMember,
    SmallGroupMember: exports.SmallGroupMember
};
exports.Announcement.associate?.(models);
exports.User.associate?.(models);
exports.Family.associate?.(models);
exports.Member.associate?.(models);
exports.Event.associate?.(models);
exports.Sermon.associate?.(models);
exports.Contribution.associate?.(models);
exports.Attendance.associate?.(models);
exports.Ministry.associate?.(models);
exports.SmallGroup.associate?.(models);
exports.MinistryMember.associate?.(models);
exports.SmallGroupMember.associate?.(models);
const db = {
    sequelize,
    Sequelize: sequelize_1.Sequelize,
    Announcement: exports.Announcement,
    User: exports.User,
    Family: exports.Family,
    Member: exports.Member,
    Event: exports.Event,
    Sermon: exports.Sermon,
    Contribution: exports.Contribution,
    Attendance: exports.Attendance,
    Ministry: exports.Ministry,
    SmallGroup: exports.SmallGroup,
    MinistryMember: exports.MinistryMember,
    SmallGroupMember: exports.SmallGroupMember
};
exports.default = db;

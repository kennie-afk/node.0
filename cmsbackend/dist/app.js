"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const _models_1 = __importDefault(require("@models"));
const errors_1 = require("./utils/errors");
const user_routes_1 = __importDefault(require("@users/user.routes"));
const auth_routes_1 = __importDefault(require("./auth/auth.routes"));
const family_routes_1 = __importDefault(require("@families/family.routes"));
const member_routes_1 = __importDefault(require("@members/member.routes"));
const event_routes_1 = __importDefault(require("@events/event.routes"));
const announcement_routes_1 = __importDefault(require("@announcements/announcement.routes"));
const sermon_routes_1 = __importDefault(require("@sermons/sermon.routes"));
const contribution_routes_1 = __importDefault(require("@contributions/contribution.routes"));
const attendance_routes_1 = __importDefault(require("@attendance/attendance.routes"));
const ministry_routes_1 = __importDefault(require("@ministries/ministry.routes"));
const small_group_routes_1 = __importDefault(require("@small_groups/small_group.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
const allowedOrigins = [
    'http://localhost:5173',
    process.env.FRONTEND_URL
].filter(Boolean);
app.use(express_1.default.json());
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
const apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(apiLimiter);
app.get('/', async (req, res) => {
    const counts = {
        usersInDb: await _models_1.default.User.count(),
        familiesInDb: await _models_1.default.Family.count(),
        membersInDb: await _models_1.default.Member.count(),
        eventsInDb: await _models_1.default.Event.count(),
        announcementsInDb: await _models_1.default.Announcement.count(),
        sermonsInDb: await _models_1.default.Sermon.count(),
        contributionsInDb: await _models_1.default.Contribution.count(),
        attendanceInDb: await _models_1.default.Attendance.count(),
        ministriesInDb: await _models_1.default.Ministry.count(),
        smallGroupsInDb: await _models_1.default.SmallGroup.count()
    };
    res.status(200).json({
        message: 'Welcome to Church CMS Backend!',
        ...counts
    });
});
app.use('/auth', auth_routes_1.default);
app.use('/users', user_routes_1.default);
app.use('/families', family_routes_1.default);
app.use('/members', member_routes_1.default);
app.use('/events', event_routes_1.default);
app.use('/announcements', announcement_routes_1.default);
app.use('/sermons', sermon_routes_1.default);
app.use('/contributions', contribution_routes_1.default);
app.use('/attendance', attendance_routes_1.default);
app.use('/ministries', ministry_routes_1.default);
app.use('/small-groups', small_group_routes_1.default);
app.use((err, req, res, next) => {
    console.error(err.stack);
    if (err instanceof errors_1.ApiError) {
        return res.status(err.statusCode).json({ message: err.message });
    }
    res.status(500).json({ message: 'Internal Server Error' });
});
async function startServer() {
    try {
        await _models_1.default.sequelize.authenticate();
        console.log('Database connected successfully');
        if (process.env.NODE_ENV !== 'production') {
            await _models_1.default.sequelize.sync();
            console.log('Database synced');
        }
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
startServer();

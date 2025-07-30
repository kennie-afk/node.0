"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("module-alias/register");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
'use strict';
const express_1 = __importDefault(require("express"));
const _models_1 = __importDefault(require("@models"));
const user_routes_1 = __importDefault(require("@users/user.routes"));
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
app.use(express_1.default.json());
app.get('/', async (req, res) => {
    try {
        const userCount = await _models_1.default.User.count();
        const familyCount = await _models_1.default.Family.count();
        const memberCount = await _models_1.default.Member.count();
        const eventCount = await _models_1.default.Event.count();
        const announcementCount = await _models_1.default.Announcement.count();
        const sermonCount = await _models_1.default.Sermon.count();
        const contributionCount = await _models_1.default.Contribution.count();
        const attendanceCount = await _models_1.default.Attendance.count();
        const ministryCount = await _models_1.default.Ministry.count();
        const smallGroupCount = await _models_1.default.SmallGroup.count();
        res.status(200).json({
            message: `Welcome to Church CMS Backend! MySQL Database connected.`,
            usersInDb: userCount,
            familiesInDb: familyCount,
            membersInDb: memberCount,
            eventsInDb: eventCount,
            announcementsInDb: announcementCount,
            sermonsInDb: sermonCount,
            contributionsInDb: contributionCount,
            attendanceInDb: attendanceCount,
            ministriesInDb: ministryCount,
            smallGroupsInDb: smallGroupCount,
        });
    }
    catch (error) {
        console.error('Error fetching counts:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
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
    res.status(500).send('Something broke!');
});
async function startServer() {
    try {
        console.log(`DEBUG: Attempting to connect to DB host: ${_models_1.default.sequelize.config.host}`);
        await _models_1.default.sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        await _models_1.default.sequelize.sync({ alter: true });
        console.log('Database tables synchronized successfully.');
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Access the server at http://localhost:${PORT}`);
        });
    }
    catch (error) {
        console.error('Unable to connect to the database or start server:', error);
        process.exit(1);
    }
}
startServer();

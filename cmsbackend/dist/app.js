"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const _models_1 = __importDefault(require("@models"));
const user_routes_1 = __importDefault(require("@users/user.routes"));
const family_routes_1 = __importDefault(require("@families/family.routes"));
const member_routes_1 = __importDefault(require("@members/member.routes"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(express_1.default.json());
app.get('/', async (req, res) => {
    try {
        const userCount = await _models_1.default.User.count();
        const familyCount = await _models_1.default.Family.count();
        const memberCount = await _models_1.default.Member.count();
        res.status(200).json({
            message: `Welcome to Church CMS Backend! MySQL Database connected.`,
            usersInDb: userCount,
            familiesInDb: familyCount,
            membersInDb: memberCount,
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
async function startServer() {
    try {
        await _models_1.default.sequelize.authenticate();
        console.log('Database connection has been established successfully.');
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

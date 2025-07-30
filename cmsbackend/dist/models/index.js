'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const process_1 = __importDefault(require("process"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const basename = path_1.default.basename(__filename);
const env = process_1.default.env.NODE_ENV || 'development';
const db = {};
let sequelize;
const productionConfig = {
    username: process_1.default.env.DB_USER,
    password: process_1.default.env.DB_PASSWORD,
    database: process_1.default.env.DB_NAME,
    host: process_1.default.env.DB_HOST,
    dialect: 'mysql'
};
const developmentConfig = {
    username: process_1.default.env.DB_USER_DEV || 'root',
    password: process_1.default.env.DB_PASSWORD_DEV || '',
    database: process_1.default.env.DB_NAME_DEV || 'church_cms_db',
    host: process_1.default.env.DB_HOST_DEV || 'localhost',
    dialect: 'mysql'
};
const testConfig = {
    username: process_1.default.env.DB_USER_TEST || 'root',
    password: process_1.default.env.DB_PASSWORD_TEST || '',
    database: process_1.default.env.DB_NAME_TEST || 'church_cms_db_test',
    host: process_1.default.env.DB_HOST_TEST || 'localhost',
    dialect: 'mysql'
};
if (env === 'production') {
    sequelize = new sequelize_1.Sequelize(productionConfig.database, productionConfig.username, productionConfig.password, {
        host: productionConfig.host,
        dialect: productionConfig.dialect,
        logging: false,
        dialectOptions: {
            connectTimeout: 60000
        }
    });
}
else if (env === 'test') {
    sequelize = new sequelize_1.Sequelize(testConfig.database, testConfig.username, testConfig.password, {
        host: testConfig.host,
        dialect: testConfig.dialect,
        logging: console.log
    });
}
else {
    sequelize = new sequelize_1.Sequelize(developmentConfig.database, developmentConfig.username, developmentConfig.password, {
        host: developmentConfig.host,
        dialect: developmentConfig.dialect,
        logging: console.log
    });
}
const fileExtension = basename.endsWith('.js') ? '.js' : '.ts';
fs_1.default.readdirSync(__dirname)
    .filter(file => {
    return (file.indexOf('.') !== 0 &&
        file !== basename &&
        file.slice(-fileExtension.length) === fileExtension &&
        file.indexOf('.test.ts') === -1 &&
        file.indexOf('.test.js') === -1);
})
    .forEach(file => {
    const modelDefinition = require(path_1.default.join(__dirname, file));
    const model = (modelDefinition.default || modelDefinition)(sequelize, sequelize_1.DataTypes);
    db[model.name] = model;
});
Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});
db.sequelize = sequelize;
db.Sequelize = sequelize_1.Sequelize;
exports.default = db;

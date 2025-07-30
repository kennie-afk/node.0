"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const env = process.env.NODE_ENV || 'development';
const isLocalDev = process.env.IS_LOCAL_DEV === 'true';
let config;
if (isLocalDev) {
    config = require('./config.local.json')[env];
    console.log('DEBUG: Loading local database config (localhost).');
}
else {
    config = require('./config.json')[env];
    console.log(`DEBUG: Loading standard database config (host: ${config.host}).`);
}
console.log('DEBUG: Value of env:', env);
console.log('DEBUG: Value of isLocalDev:', isLocalDev);
console.log('DEBUG: Raw config object after require:', require(isLocalDev ? './config.local.json' : './config.json'));
console.log('DEBUG: Final config object (config[env]):', config);
console.log('DEBUG: Attempting to access config.database:', config ? config.database : 'config is undefined');
const sequelize = new sequelize_1.Sequelize(config.database, config.username, config.password, {
    host: config.host,
    dialect: config.dialect,
    logging: false,
    pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
});
exports.default = sequelize;

'use strict';

import fs from 'fs';
import path from 'path';
import { Sequelize, DataTypes } from 'sequelize';
import process from 'process';
import dotenv from 'dotenv';

dotenv.config();

const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const db: any = {};

let sequelize: Sequelize;

const productionConfig = {
  username: process.env.DB_USER as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  host: process.env.DB_HOST as string,
  dialect: 'mysql' as 'mysql'
};

const developmentConfig = {
  username: process.env.DB_USER_DEV || 'root',
  password: process.env.DB_PASSWORD_DEV || '',
  database: process.env.DB_NAME_DEV || 'church_cms_db',
  host: process.env.DB_HOST_DEV || 'localhost',
  dialect: 'mysql' as 'mysql'
};

const testConfig = {
  username: process.env.DB_USER_TEST || 'root',
  password: process.env.DB_PASSWORD_TEST || '',
  database: process.env.DB_NAME_TEST || 'church_cms_db_test',
  host: process.env.DB_HOST_TEST || 'localhost',
  dialect: 'mysql' as 'mysql'
};


if (env === 'production') {
  sequelize = new Sequelize(
    productionConfig.database,
    productionConfig.username,
    productionConfig.password,
    {
      host: productionConfig.host,
      dialect: productionConfig.dialect,
      logging: false,
      dialectOptions: {
        connectTimeout: 60000
      }
    }
  );
} else if (env === 'test') {
  sequelize = new Sequelize(
    testConfig.database,
    testConfig.username,
    testConfig.password,
    {
      host: testConfig.host,
      dialect: testConfig.dialect,
      logging: console.log
    }
  );
} else {
  sequelize = new Sequelize(
    developmentConfig.database,
    developmentConfig.username,
    developmentConfig.password,
    {
      host: developmentConfig.host,
      dialect: developmentConfig.dialect,
      logging: console.log
    }
  );
}

const fileExtension = basename.endsWith('.js') ? '.js' : '.ts';

fs.readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-fileExtension.length) === fileExtension &&
      file.indexOf('.test.ts') === -1 &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const modelDefinition = require(path.join(__dirname, file));
    const model = (modelDefinition.default || modelDefinition)(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

export default db;
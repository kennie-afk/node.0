require('dotenv').config();

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('DATABASE_URL must be set before running migrations');
}

const useSsl = process.env.DATABASE_SSL !== 'false' && !url.includes('localhost');

const shared = {
  url,
  dialect: 'postgres',
  dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  migrationStorageTableName: 'sequelize_meta'
};

module.exports = {
  development: shared,
  test: shared,
  production: shared
};

require('dotenv').config();

// Migrations run as the schema owner; the API connects as the least-privilege application role.
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  throw new Error('MIGRATE_DATABASE_URL (or DATABASE_URL) must be set before running migrations');
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

'use strict';

const { enableTenantRls, dropTenantRls, tableExists, ensureCurrentChurchFunction } = require('../migrations-lib/tenant');

/**
 * 1. Roles: users gain a `role` so treasurers, approvers and auditors exist alongside admins.
 * 2. Composite-FK anchors: UNIQUE (church_id, id) on the tables finance points at.
 * 3. Row-level security on every pre-existing tenant table.
 * 4. The sign-in lookup, which has to find a user before it knows the church.
 * 5. The least-privilege application role (only when APP_DB_USER is provided).
 */
const LEGACY_TENANT_TABLES = [
  'users',
  'families',
  'members',
  'events',
  'announcements',
  'sermons',
  'contribution',
  'attendance',
  'ministries',
  'ministry_members',
  'small_groups',
  'small_group_members'
];

const ANCHORS = ['users', 'families', 'members', 'events', 'sermons', 'contribution', 'ministries', 'small_groups'];

module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql, options = {}) => qi.sequelize.query(sql, { transaction, ...options });

      await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'MEMBER'`);
      await q(`UPDATE users SET role = 'ADMIN' WHERE is_admin = true AND role = 'MEMBER'`);

      for (const table of ANCHORS) {
        if (await tableExists(qi, table, transaction)) {
          await q(`CREATE UNIQUE INDEX IF NOT EXISTS "${table}_church_id_id_unique" ON "${table}" (church_id, id)`);
        }
      }

      await ensureCurrentChurchFunction(qi, transaction);

      for (const table of LEGACY_TENANT_TABLES) {
        if (await tableExists(qi, table, transaction)) {
          await enableTenantRls(qi, table, { transaction });
        }
      }

      await q(`
        CREATE OR REPLACE FUNCTION cms_login_lookup(candidate text)
        RETURNS TABLE (id integer, church_id integer, email varchar, password_hash varchar, is_admin boolean, role varchar)
        LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
          SELECT u.id, u.church_id, u.email, u.password_hash, u.is_admin, u.role
            FROM users u WHERE u.email = candidate LIMIT 1
        $$;`);
      await q(`REVOKE ALL ON FUNCTION cms_login_lookup(text) FROM PUBLIC`);

      const appUser = process.env.APP_DB_USER;
      if (appUser) {
        if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) {
          throw new Error('APP_DB_USER must be a plain lowercase identifier');
        }
        const password = process.env.APP_DB_PASSWORD;
        if (!password) {
          throw new Error('APP_DB_PASSWORD must be set together with APP_DB_USER');
        }
        await q(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appUser}') THEN
              CREATE ROLE ${appUser} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
            END IF;
          END $$;`);
        // The password is bound, not interpolated, so it cannot break out of the statement.
        await q(`SELECT set_config('cms.tmp_pw', :pw, true)`, { replacements: { pw: password } });
        await q(`DO $$ BEGIN EXECUTE format('ALTER ROLE ${appUser} NOSUPERUSER NOBYPASSRLS PASSWORD %L', current_setting('cms.tmp_pw')); END $$;`);
        await q(`GRANT USAGE ON SCHEMA public TO ${appUser}`);
        await q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appUser}`);
        await q(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appUser}`);
        await q(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appUser}`);
        await q(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${appUser}`);
        await q(`GRANT EXECUTE ON FUNCTION cms_login_lookup(text) TO ${appUser}`);
        // The migration bookkeeping table is the owner's business.
        await q(`REVOKE ALL ON sequelize_meta FROM ${appUser}`);
      }
    });
  },

  async down(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });
      for (const table of LEGACY_TENANT_TABLES) {
        if (await tableExists(qi, table, transaction)) {
          await dropTenantRls(qi, table, { transaction });
        }
      }
      await q('DROP FUNCTION IF EXISTS cms_login_lookup(text)');
      for (const table of ANCHORS) {
        if (await tableExists(qi, table, transaction)) {
          await q(`DROP INDEX IF EXISTS "${table}_church_id_id_unique"`);
        }
      }
      await q('ALTER TABLE users DROP COLUMN IF EXISTS role');
    });
  }
};

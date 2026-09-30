'use strict';

/**
 * Helpers every migration that creates a tenant table should use, so the isolation rules are
 * written once. Conventions for all tenant tables:
 *   - a `church_id integer NOT NULL REFERENCES churches(id)` column;
 *   - a UNIQUE (church_id, id) index so other tables can use composite foreign keys
 *     `(church_id, x_id) REFERENCES x (church_id, id)`, which stops a row in one church from
 *     ever pointing at a row in another (a plain foreign key on a global id cannot);
 *   - row-level security keyed on the `app.church_id` setting the API stamps on each request.
 */

const CURRENT_CHURCH_FN = `
CREATE OR REPLACE FUNCTION cms_current_church() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.church_id', true), '')::integer
$$;`;

async function ensureCurrentChurchFunction(qi, transaction) {
  await qi.sequelize.query(CURRENT_CHURCH_FN, { transaction });
}

/** ENABLE (not FORCE): the owner running migrations keeps full access, the app role does not. */
async function enableTenantRls(qi, table, { column = 'church_id', transaction } = {}) {
  await ensureCurrentChurchFunction(qi, transaction);
  await qi.sequelize.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`, { transaction });
  await qi.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`, { transaction });
  await qi.sequelize.query(
    `CREATE POLICY "${table}_tenant" ON "${table}"
       USING ("${column}" = cms_current_church())
       WITH CHECK ("${column}" = cms_current_church())`,
    { transaction }
  );
}

async function dropTenantRls(qi, table, { transaction } = {}) {
  await qi.sequelize.query(`DROP POLICY IF EXISTS "${table}_tenant" ON "${table}"`, { transaction });
  await qi.sequelize.query(`ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`, { transaction });
}

async function tableExists(qi, table, transaction) {
  const [rows] = await qi.sequelize.query(
    `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = :table`,
    { replacements: { table }, transaction }
  );
  return rows.length > 0;
}

/** Forbid UPDATE and DELETE outright (the audit log, the journal lines). */
async function makeAppendOnly(qi, table, { transaction } = {}) {
  const fn = `${table}_append_only`;
  await qi.sequelize.query(
    `CREATE OR REPLACE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       RAISE EXCEPTION '${table} is append-only: % is not permitted', TG_OP USING ERRCODE = '42501';
     END $$;`,
    { transaction }
  );
  await qi.sequelize.query(`DROP TRIGGER IF EXISTS ${fn} ON "${table}"`, { transaction });
  await qi.sequelize.query(
    `CREATE TRIGGER ${fn} BEFORE UPDATE OR DELETE ON "${table}"
       FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    { transaction }
  );
}

module.exports = {
  ensureCurrentChurchFunction,
  enableTenantRls,
  dropTenantRls,
  tableExists,
  makeAppendOnly
};

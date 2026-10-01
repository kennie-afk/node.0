'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

// Roles are data, one set per church. The built-in seven are templates copied in on first use
// (see roles.service ensureDefaultRoles), so nothing here depends on what they contain.
module.exports = tenantMigration({
  tables: ['church_roles'],
  statements: [
    `CREATE TABLE church_roles (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      role_key varchar(20) NOT NULL CHECK (role_key ~ '^[A-Z][A-Z0-9_]{1,19}$'),
      label varchar(60) NOT NULL,
      description varchar(200),
      is_system boolean NOT NULL DEFAULT false,
      permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, role_key),
      UNIQUE (church_id, id)
    )`
  ]
});

'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['consent_records', 'import_jobs', 'erasure_requests'],
  statements: [
    `CREATE TABLE consent_records (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer NOT NULL,
      purpose varchar(40) NOT NULL,
      channel varchar(10) NOT NULL DEFAULT 'ANY' CHECK (channel IN ('SMS','EMAIL','ANY')),
      granted boolean NOT NULL,
      source varchar(20) NOT NULL DEFAULT 'STAFF',
      recorded_by_user_id integer,
      notes varchar(300),
      recorded_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX consent_member ON consent_records (church_id, member_id, purpose, channel, id DESC)`,
    `CREATE TABLE import_jobs (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      kind varchar(20) NOT NULL DEFAULT 'MEMBERS',
      file_hash char(64) NOT NULL,
      status varchar(10) NOT NULL CHECK (status IN ('DRY_RUN','APPLIED','FAILED')),
      update_existing boolean NOT NULL DEFAULT false,
      total_rows integer NOT NULL DEFAULT 0,
      created_count integer NOT NULL DEFAULT 0,
      updated_count integer NOT NULL DEFAULT 0,
      skipped_count integer NOT NULL DEFAULT 0,
      error_count integer NOT NULL DEFAULT 0,
      errors jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by integer,
      created_at ${TS},
      updated_at ${TS},
      UNIQUE (church_id, id)
    )`,
    `CREATE UNIQUE INDEX import_jobs_applied_once ON import_jobs (church_id, kind, file_hash, update_existing) WHERE status = 'APPLIED'`,
    `CREATE TABLE erasure_requests (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer NOT NULL,
      requested_by integer,
      reason varchar(500) NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','REFUSED')),
      outcome varchar(12) CHECK (outcome IN ('ANONYMISED','DELETED','REFUSED')),
      legal_hold_reason varchar(300),
      decided_by integer,
      decided_at timestamptz,
      created_at ${TS},
      updated_at ${TS},
      UNIQUE (church_id, id)
    )`,
    `CREATE INDEX erasure_member ON erasure_requests (church_id, member_id)`
  ]
});

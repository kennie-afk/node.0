'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['care_notes', 'prayer_requests', 'visitations'],
  statements: [
    `CREATE TABLE care_notes (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer NOT NULL,
      author_user_id integer NOT NULL,
      kind varchar(12) NOT NULL DEFAULT 'PASTORAL' CHECK (kind IN ('PASTORAL','COUNSELING','HOSPITAL','BEREAVEMENT','OTHER')),
      body text NOT NULL,
      is_confidential boolean NOT NULL DEFAULT false,
      occurred_on date NOT NULL,
      follow_up_on date,
      follow_up_done boolean NOT NULL DEFAULT false,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX care_notes_member ON care_notes (church_id, member_id, id DESC)`,
    `CREATE INDEX care_notes_followup ON care_notes (church_id, follow_up_on) WHERE follow_up_done = false AND follow_up_on IS NOT NULL`,
    `CREATE TABLE prayer_requests (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer,
      requester_name varchar(150),
      body varchar(2000) NOT NULL,
      is_private boolean NOT NULL DEFAULT false,
      status varchar(8) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ANSWERED','CLOSED')),
      answered_note varchar(500),
      submitted_by_user_id integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (member_id)
    )`,
    `CREATE INDEX prayer_status ON prayer_requests (church_id, status, id DESC)`,
    `CREATE TABLE visitations (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer NOT NULL,
      visitor_user_id integer NOT NULL,
      visit_date date NOT NULL,
      kind varchar(8) NOT NULL DEFAULT 'HOME' CHECK (kind IN ('HOME','HOSPITAL','PRISON','OTHER')),
      summary varchar(1000) NOT NULL,
      follow_up_on date,
      follow_up_done boolean NOT NULL DEFAULT false,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX visitations_member ON visitations (church_id, member_id, visit_date DESC)`
  ]
});

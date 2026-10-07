'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

/**
 * Event registration (capacity, RSVP with a waitlist) and sermon media (files in the object store).
 * New tables go through tenantMigration, which puts each under row-level security keyed on
 * app.church_id and grants the application role its DML, exactly like the other operations tables.
 */
module.exports = tenantMigration({
  tables: ['event_rsvps', 'sermon_media'],
  statements: [
    `ALTER TABLE events ADD COLUMN IF NOT EXISTS capacity integer CHECK (capacity IS NULL OR capacity > 0)`,
    `CREATE TABLE event_rsvps (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      event_id integer NOT NULL,
      occurrence_date date NOT NULL,
      member_id integer,
      guest_name varchar(150),
      party_size integer NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 20),
      status varchar(10) NOT NULL DEFAULT 'GOING' CHECK (status IN ('GOING','WAITLIST','CANCELLED')),
      note varchar(300),
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL),
      FOREIGN KEY (church_id, event_id) REFERENCES events (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX event_rsvps_occurrence ON event_rsvps (church_id, event_id, occurrence_date, status, id)`,
    // One live registration per member per occurrence; cancelled ones may repeat.
    `CREATE UNIQUE INDEX event_rsvps_member_once ON event_rsvps (church_id, event_id, occurrence_date, member_id) WHERE member_id IS NOT NULL AND status <> 'CANCELLED'`,
    `CREATE TABLE sermon_media (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      sermon_id integer NOT NULL,
      kind varchar(5) NOT NULL CHECK (kind IN ('audio','video','notes')),
      file_name varchar(200) NOT NULL,
      content_type varchar(100) NOT NULL,
      size_bytes bigint NOT NULL CHECK (size_bytes > 0),
      storage_key varchar(300) NOT NULL,
      sha256 char(64) NOT NULL,
      uploaded_by integer,
      created_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, sermon_id) REFERENCES sermons (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX sermon_media_sermon ON sermon_media (church_id, sermon_id, id)`
  ],
  drops: [
    'DROP TABLE IF EXISTS sermon_media CASCADE',
    'DROP TABLE IF EXISTS event_rsvps CASCADE',
    'ALTER TABLE events DROP COLUMN IF EXISTS capacity'
  ]
});

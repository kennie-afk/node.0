'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['checkin_rooms', 'checkin_children', 'checkin_guardians', 'checkin_sessions', 'checkin_events'],
  appendOnly: ['checkin_events'],
  statements: [
    `CREATE TABLE checkin_rooms (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(100) NOT NULL,
      min_age_months integer NOT NULL DEFAULT 0 CHECK (min_age_months >= 0),
      max_age_months integer NOT NULL CHECK (max_age_months >= min_age_months),
      capacity integer NOT NULL CHECK (capacity > 0),
      is_active boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, name)
    )`,
    `CREATE TABLE checkin_children (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer,
      first_name varchar(100) NOT NULL,
      last_name varchar(100) NOT NULL,
      date_of_birth date NOT NULL,
      allergies varchar(300),
      medical_notes varchar(500),
      photo_consent boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (member_id)
    )`,
    `CREATE TABLE checkin_guardians (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      child_id integer NOT NULL,
      member_id integer,
      name varchar(150) NOT NULL,
      phone varchar(30),
      relationship varchar(40) NOT NULL DEFAULT 'Parent',
      is_authorized_pickup boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, child_id) REFERENCES checkin_children (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (member_id)
    )`,
    `CREATE TABLE checkin_sessions (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      event_id integer,
      room_id integer NOT NULL,
      child_id integer NOT NULL,
      checked_in_by integer,
      checked_in_by_guardian_id integer,
      pickup_code_hash char(64) NOT NULL,
      security_tag varchar(12) NOT NULL,
      status varchar(4) NOT NULL DEFAULT 'IN' CHECK (status IN ('IN','OUT')),
      checked_in_at ${TS},
      checked_out_at timestamptz,
      checked_out_by integer,
      picked_up_by_guardian_id integer,
      override_reason varchar(300),
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, event_id) REFERENCES events (church_id, id) ON DELETE SET NULL (event_id),
      FOREIGN KEY (church_id, room_id) REFERENCES checkin_rooms (church_id, id),
      FOREIGN KEY (church_id, child_id) REFERENCES checkin_children (church_id, id)
    )`,
    `CREATE UNIQUE INDEX checkin_one_active_per_child ON checkin_sessions (church_id, child_id) WHERE status = 'IN'`,
    `CREATE INDEX checkin_room_active ON checkin_sessions (church_id, room_id) WHERE status = 'IN'`,
    `CREATE INDEX checkin_time ON checkin_sessions (church_id, checked_in_at DESC)`,
    `CREATE TABLE checkin_events (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      session_id integer,
      child_id integer NOT NULL,
      type varchar(10) NOT NULL CHECK (type IN ('CHECK_IN','CHECK_OUT','DENIED','FLAGGED','OVERRIDE')),
      actor_user_id integer,
      detail varchar(400),
      created_at ${TS},
      UNIQUE (church_id, id)
    )`,
    `CREATE INDEX checkin_events_child ON checkin_events (church_id, child_id, id DESC)`
  ]
});

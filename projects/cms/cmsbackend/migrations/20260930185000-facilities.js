'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

/**
 * Double-booking is prevented by the database, not just the service: an exclusion constraint over
 * (church, resource, time range) rejects any two live bookings of one resource that overlap, even
 * from two requests racing each other. Pending bookings hold their slot, cancelled ones release it.
 */
module.exports = tenantMigration({
  tables: ['facility_resources', 'facility_bookings'],
  statements: [
    `CREATE EXTENSION IF NOT EXISTS btree_gist`,
    `CREATE TABLE facility_resources (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(120) NOT NULL,
      kind varchar(10) NOT NULL DEFAULT 'ROOM' CHECK (kind IN ('ROOM','EQUIPMENT','VEHICLE')),
      capacity integer,
      requires_approval boolean NOT NULL DEFAULT false,
      description varchar(500),
      is_active boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, name)
    )`,
    `CREATE TABLE facility_bookings (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      resource_id integer NOT NULL,
      title varchar(200) NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
      booked_by_user_id integer,
      status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      series_id varchar(40),
      decided_by integer,
      decided_at timestamptz,
      notes varchar(500),
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, resource_id) REFERENCES facility_resources (church_id, id),
      CONSTRAINT facility_no_double_booking EXCLUDE USING gist (
        church_id WITH =, resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&
      ) WHERE (status IN ('PENDING','APPROVED'))
    )`,
    `CREATE INDEX facility_time ON facility_bookings (church_id, resource_id, starts_at)`,
    `CREATE INDEX facility_series ON facility_bookings (church_id, series_id) WHERE series_id IS NOT NULL`
  ]
});

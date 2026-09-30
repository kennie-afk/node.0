'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['volunteer_teams', 'volunteer_roles', 'volunteer_team_members', 'volunteer_unavailability', 'roster_assignments', 'swap_requests'],
  statements: [
    `CREATE TABLE volunteer_teams (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(120) NOT NULL,
      description varchar(500),
      ministry_id integer,
      is_active boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, name),
      FOREIGN KEY (church_id, ministry_id) REFERENCES ministries (church_id, id) ON DELETE SET NULL (ministry_id)
    )`,
    `CREATE TABLE volunteer_roles (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      team_id integer NOT NULL,
      name varchar(120) NOT NULL,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, team_id, name),
      FOREIGN KEY (church_id, team_id) REFERENCES volunteer_teams (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE volunteer_team_members (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      team_id integer NOT NULL,
      member_id integer NOT NULL,
      role_id integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, team_id, member_id),
      FOREIGN KEY (church_id, team_id) REFERENCES volunteer_teams (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, role_id) REFERENCES volunteer_roles (church_id, id) ON DELETE SET NULL (role_id)
    )`,
    `CREATE TABLE volunteer_unavailability (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      member_id integer NOT NULL,
      from_date date NOT NULL,
      to_date date NOT NULL CHECK (to_date >= from_date),
      reason varchar(200),
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE roster_assignments (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      event_id integer NOT NULL,
      team_id integer NOT NULL,
      role_id integer,
      member_id integer NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','DECLINED')),
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, event_id, member_id, team_id),
      FOREIGN KEY (church_id, event_id) REFERENCES events (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, team_id) REFERENCES volunteer_teams (church_id, id),
      FOREIGN KEY (church_id, role_id) REFERENCES volunteer_roles (church_id, id) ON DELETE SET NULL (role_id),
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE INDEX roster_member_time ON roster_assignments (church_id, member_id, starts_at)`,
    `CREATE INDEX roster_event ON roster_assignments (church_id, event_id)`,
    `CREATE TABLE swap_requests (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      assignment_id integer NOT NULL,
      from_member_id integer NOT NULL,
      to_member_id integer,
      status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      reason varchar(300),
      decided_by integer,
      decided_at timestamptz,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, assignment_id) REFERENCES roster_assignments (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, from_member_id) REFERENCES members (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, to_member_id) REFERENCES members (church_id, id) ON DELETE CASCADE
    )`
  ]
});

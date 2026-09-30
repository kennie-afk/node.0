'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['visitors', 'visitor_stage_history', 'visitor_tasks', 'visitor_interactions'],
  statements: [
    `CREATE TABLE visitors (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      first_name varchar(100) NOT NULL,
      last_name varchar(100) NOT NULL,
      phone varchar(30),
      email varchar(100),
      first_visit_date date NOT NULL,
      source varchar(60),
      notes varchar(1000),
      stage varchar(14) NOT NULL DEFAULT 'NEW' CHECK (stage IN ('NEW','CONTACTED','VISITED_AGAIN','CLASS','JOINED','LOST')),
      status varchar(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CONVERTED','CLOSED')),
      assigned_member_id integer,
      converted_member_id integer,
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, assigned_member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (assigned_member_id),
      FOREIGN KEY (church_id, converted_member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (converted_member_id)
    )`,
    `CREATE INDEX visitors_pipeline ON visitors (church_id, status, stage, id DESC)`,
    `CREATE INDEX visitors_assignee ON visitors (church_id, assigned_member_id) WHERE assigned_member_id IS NOT NULL`,
    `CREATE TABLE visitor_stage_history (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      visitor_id integer NOT NULL,
      from_stage varchar(14),
      to_stage varchar(14) NOT NULL,
      note varchar(300),
      changed_by integer,
      changed_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, visitor_id) REFERENCES visitors (church_id, id) ON DELETE CASCADE
    )`,
    `CREATE TABLE visitor_tasks (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      visitor_id integer NOT NULL,
      title varchar(200) NOT NULL,
      due_date date NOT NULL,
      assignee_member_id integer,
      status varchar(6) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DONE')),
      completed_at timestamptz,
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, visitor_id) REFERENCES visitors (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, assignee_member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (assignee_member_id)
    )`,
    `CREATE INDEX visitor_tasks_due ON visitor_tasks (church_id, status, due_date)`,
    `CREATE TABLE visitor_interactions (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      visitor_id integer NOT NULL,
      type varchar(6) NOT NULL CHECK (type IN ('CALL','SMS','VISIT','EMAIL')),
      summary varchar(500) NOT NULL,
      by_user_id integer,
      occurred_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, visitor_id) REFERENCES visitors (church_id, id) ON DELETE CASCADE
    )`
  ]
});

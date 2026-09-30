'use strict';
const { tenantMigration, TS } = require('../migrations-lib/ops');

module.exports = tenantMigration({
  tables: ['message_templates', 'audience_segments', 'campaigns', 'outbox_messages'],
  drops: ['DROP FUNCTION IF EXISTS cms_outbox_pending_churches(integer)', 'DROP TABLE IF EXISTS outbox_messages CASCADE', 'DROP TABLE IF EXISTS campaigns CASCADE', 'DROP TABLE IF EXISTS audience_segments CASCADE', 'DROP TABLE IF EXISTS message_templates CASCADE'],
  statements: [
    `SELECT set_config('cms.app_user', '${process.env.APP_DB_USER && /^[a-z_][a-z0-9_]*$/.test(process.env.APP_DB_USER) ? process.env.APP_DB_USER : ''}', true)`,
    `CREATE TABLE message_templates (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(120) NOT NULL,
      channel varchar(10) NOT NULL CHECK (channel IN ('SMS','EMAIL')),
      subject varchar(200),
      body text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, name, channel)
    )`,
    `CREATE TABLE audience_segments (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(120) NOT NULL,
      definition jsonb NOT NULL,
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id), UNIQUE (church_id, name)
    )`,
    `CREATE TABLE campaigns (
      id serial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      name varchar(150) NOT NULL,
      channel varchar(10) NOT NULL CHECK (channel IN ('SMS','EMAIL')),
      purpose varchar(20) NOT NULL DEFAULT 'COMMUNICATIONS',
      template_id integer,
      subject varchar(200),
      body text NOT NULL,
      segment_id integer NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','QUEUED','COMPLETED','CANCELLED')),
      scheduled_at timestamptz,
      recipient_count integer NOT NULL DEFAULT 0,
      created_by integer,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, segment_id) REFERENCES audience_segments (church_id, id),
      FOREIGN KEY (church_id, template_id) REFERENCES message_templates (church_id, id)
    )`,
    `CREATE TABLE outbox_messages (
      id bigserial PRIMARY KEY,
      church_id integer NOT NULL REFERENCES churches(id) ON DELETE RESTRICT,
      campaign_id integer,
      member_id integer,
      channel varchar(10) NOT NULL CHECK (channel IN ('SMS','EMAIL')),
      purpose varchar(20) NOT NULL DEFAULT 'COMMUNICATIONS',
      to_address varchar(200) NOT NULL,
      subject varchar(200),
      body text NOT NULL,
      status varchar(10) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENT','FAILED','SKIPPED')),
      attempts integer NOT NULL DEFAULT 0,
      last_error varchar(300),
      provider_ref varchar(100),
      dedupe_key varchar(120),
      not_before timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      created_at ${TS}, updated_at ${TS},
      UNIQUE (church_id, id),
      FOREIGN KEY (church_id, campaign_id) REFERENCES campaigns (church_id, id) ON DELETE CASCADE,
      FOREIGN KEY (church_id, member_id) REFERENCES members (church_id, id) ON DELETE SET NULL (member_id)
    )`,
    `CREATE UNIQUE INDEX outbox_dedupe ON outbox_messages (church_id, dedupe_key) WHERE dedupe_key IS NOT NULL`,
    `CREATE INDEX outbox_due ON outbox_messages (status, not_before) WHERE status = 'QUEUED'`,
    `CREATE INDEX outbox_church_status ON outbox_messages (church_id, status, id DESC)`,
    `CREATE INDEX outbox_campaign ON outbox_messages (church_id, campaign_id)`,
    // The background sender has no church in scope, and row-level security would hide every row
    // from it. This narrow definer function lists only which churches have mail due, nothing more.
    `CREATE OR REPLACE FUNCTION cms_outbox_pending_churches(max_rows integer) RETURNS TABLE (church_id integer)
       LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
         SELECT DISTINCT o.church_id FROM outbox_messages o WHERE o.status = 'QUEUED' AND o.not_before <= now() LIMIT max_rows
       $$`,
    `REVOKE ALL ON FUNCTION cms_outbox_pending_churches(integer) FROM PUBLIC`,
    `DO $$ BEGIN
       IF current_setting('cms.app_user', true) IS NOT NULL AND current_setting('cms.app_user', true) <> '' THEN
         EXECUTE format('GRANT EXECUTE ON FUNCTION cms_outbox_pending_churches(integer) TO %I', current_setting('cms.app_user'));
       END IF;
     END $$`
  ]
});

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE organisations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  billing_plan  text NOT NULL DEFAULT 'starter',
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name            text NOT NULL,
  timezone        text NOT NULL DEFAULT 'Africa/Nairobi',
  opens_minute    int  NOT NULL DEFAULT 360,
  closes_minute   int  NOT NULL DEFAULT 1140,
  days_open       int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  litres_per_wash numeric(6,2) NOT NULL DEFAULT 60,
  cash_ratio      numeric(4,3) NOT NULL DEFAULT 0.100,
  geo             point,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_org_idx ON sites (org_id);

CREATE TABLE bays (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id   uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id  uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  label    text NOT NULL
);
CREATE INDEX bays_site_idx ON bays (site_id);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id       uuid REFERENCES sites(id) ON DELETE SET NULL,
  role          text NOT NULL CHECK (role IN ('owner','manager','supervisor','worker','support')),
  display_name  text NOT NULL,
  phone         text NOT NULL,
  pin_hash      text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, phone)
);
CREATE INDEX users_org_idx ON users (org_id);

CREATE TABLE services (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name               text NOT NULL,
  list_price_cents   bigint NOT NULL CHECK (list_price_cents >= 0),
  expected_water_l   numeric(6,2) NOT NULL DEFAULT 0,
  expected_duration_s int NOT NULL DEFAULT 0,
  commission_rate    numeric(4,3) NOT NULL DEFAULT 0.100,
  active             boolean NOT NULL DEFAULT true
);
CREATE INDEX services_org_idx ON services (org_id);

CREATE TABLE vehicles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  plate_raw        text,
  plate_normalised text NOT NULL,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  visit_count      int NOT NULL DEFAULT 0,
  UNIQUE (org_id, plate_normalised)
);

CREATE TABLE jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id        uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  bay_id         uuid REFERENCES bays(id) ON DELETE SET NULL,
  vehicle_id     uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  worker_id      uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  state          text NOT NULL DEFAULT 'created',
  quoted_total_cents bigint NOT NULL DEFAULT 0,
  list_total_cents   bigint NOT NULL DEFAULT 0,
  discount_authorised_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  closed_at      timestamptz
);
CREATE INDEX jobs_org_site_created_idx ON jobs (org_id, site_id, created_at DESC);
CREATE INDEX jobs_state_idx ON jobs (org_id, state) WHERE state NOT IN ('closed','abandoned');

CREATE TABLE job_services (
  job_id           uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  service_id       uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  unit_price_cents bigint NOT NULL,
  qty              int NOT NULL DEFAULT 1 CHECK (qty > 0),
  PRIMARY KEY (job_id, service_id)
);

CREATE TABLE job_events (
  id         bigserial,
  org_id     uuid NOT NULL,
  job_id     uuid NOT NULL,
  type       text NOT NULL,
  actor_id   uuid,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ts  timestamptz,
  server_ts  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, server_ts)
) PARTITION BY RANGE (server_ts);

CREATE INDEX job_events_job_idx ON job_events (job_id, server_ts);

CREATE TABLE payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  job_id        uuid REFERENCES jobs(id) ON DELETE SET NULL,
  channel       text NOT NULL CHECK (channel IN ('mpesa','card','bank','cash')),
  amount_cents  bigint NOT NULL CHECK (amount_cents > 0),
  external_ref  text,
  payer_msisdn  text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, external_ref)
);
CREATE INDEX payments_org_site_received_idx ON payments (org_id, site_id, received_at DESC);
CREATE INDEX payments_unmatched_idx ON payments (org_id, site_id) WHERE job_id IS NULL;

CREATE TABLE discrepancies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id         uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  business_day    date NOT NULL,
  type            text NOT NULL,
  severity        text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  est_value_cents bigint NOT NULL DEFAULT 0,
  summary         text NOT NULL,
  evidence        jsonb NOT NULL DEFAULT '{}'::jsonb,
  state           text NOT NULL DEFAULT 'open' CHECK (state IN ('open','explained','confirmed','dismissed')),
  resolved_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, site_id, business_day, type, summary)
);
CREATE INDEX discrepancies_open_idx ON discrepancies (org_id, site_id, business_day) WHERE state = 'open';

CREATE TABLE devices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  bay_id       uuid REFERENCES bays(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('flow_meter','pump_monitor','beam','doser','machine','camera')),
  firmware     text,
  secret_hash  text NOT NULL,
  last_seen    timestamptz,
  last_sequence bigint NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'active'
);
CREATE INDEX devices_site_idx ON devices (site_id);

CREATE TABLE telemetry (
  device_id  uuid NOT NULL,
  org_id     uuid NOT NULL,
  site_id    uuid NOT NULL,
  bay_id     uuid,
  ts         timestamptz NOT NULL,
  metric     text NOT NULL,
  value      double precision NOT NULL,
  sequence   bigint NOT NULL,
  PRIMARY KEY (device_id, ts, metric)
) PARTITION BY RANGE (ts);

CREATE INDEX telemetry_site_ts_idx ON telemetry (site_id, ts DESC);

CREATE TABLE plate_captures (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id          uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  ts               timestamptz NOT NULL,
  plate_raw        text,
  plate_normalised text,
  confidence       numeric(4,3),
  image_key        text,
  direction        text NOT NULL CHECK (direction IN ('entry','exit'))
);
CREATE INDEX plate_captures_site_ts_idx ON plate_captures (site_id, ts DESC);

CREATE TABLE inventory_movements (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id   uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  item_id   text NOT NULL,
  item_name text NOT NULL,
  delta     numeric(10,3) NOT NULL,
  unit      text NOT NULL DEFAULT 'L',
  reason    text NOT NULL,
  actor_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  ts        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_site_ts_idx ON inventory_movements (site_id, ts DESC);

CREATE TABLE idempotency_keys (
  key         text PRIMARY KEY,
  org_id      uuid NOT NULL,
  route       text NOT NULL,
  response    jsonb,
  status_code int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at);

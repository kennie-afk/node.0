-- Operations: guards, clients, sites, posts, checkpoints, rosters (shifts), attendance, patrols, incidents, swaps.
--
-- Facts that must never be edited (attendance events, patrol scans, incidents and their notes) have UPDATE/DELETE/TRUNCATE revoked
-- from the application role. A guard cannot be rostered on two overlapping shifts: that is an exclusion constraint, not just a check
-- in the service, so two simultaneous requests cannot both succeed.

CREATE TABLE org_counters (
  org_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  key     text NOT NULL,
  n       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, key)
);
SELECT sojaa_protect('org_counters');

-- Guards are DATA the firm keeps. PSRA registration, NSSF, SHA and KRA numbers are typed in by the firm; Sojaa does not and cannot
-- verify any of them (no public verification service is used or assumed).
CREATE TABLE guards (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id           uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  guard_no            text NOT NULL,
  full_name           text NOT NULL,
  phone               text,
  national_id         text,
  psra_reg_no         text,
  psra_expiry         date,
  nssf_no             text,
  sha_no              text,
  kra_pin             text,
  monthly_basic_cents bigint NOT NULL DEFAULT 0 CHECK (monthly_basic_cents >= 0),
  allowance_cents     bigint NOT NULL DEFAULT 0 CHECK (allowance_cents >= 0),
  -- 0 = Sunday .. 6 = Saturday; NULL = no fixed weekly rest day recorded
  rest_weekday        smallint CHECK (rest_weekday IS NULL OR rest_weekday BETWEEN 0 AND 6),
  hired_on            date NOT NULL,
  exited_on           date,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exited')),
  -- the guard's own PIN for the check-in screen; NULL = the guard cannot check in alone
  pin_hash            text,
  is_demo             boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, guard_no),
  CHECK (exited_on IS NULL OR exited_on >= hired_on)
);
CREATE UNIQUE INDEX guards_national_id_unique ON guards (org_id, national_id) WHERE national_id IS NOT NULL;
CREATE UNIQUE INDEX guards_phone_unique ON guards (org_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX guards_org_status_idx ON guards (org_id, status, full_name);
CREATE INDEX guards_branch_idx ON guards (org_id, branch_id, status);
CREATE INDEX guards_name_trgm ON guards USING gin (full_name gin_trgm_ops);
SELECT sojaa_protect('guards');

-- A guard checks in alone by phone and PIN, before any tenant is known: one narrow lookup, ids and a hash only.
CREATE OR REPLACE FUNCTION resolve_guard(candidate text)
RETURNS TABLE (id uuid, org_id uuid, pin_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.org_id, g.pin_hash FROM guards g WHERE g.phone = candidate AND g.status = 'active' AND g.pin_hash IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION resolve_guard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_guard(text) TO sojaa_app;

CREATE TABLE clients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name               text NOT NULL,
  contact_name       text,
  contact_phone      text,
  contact_email      text,
  kra_pin            text,
  payment_terms_days int NOT NULL DEFAULT 30 CHECK (payment_terms_days BETWEEN 0 AND 365),
  -- optional read-only link for the client: an attendance verification summary and nothing else
  portal_token       text UNIQUE,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX clients_org_idx ON clients (org_id, status, name);
SELECT sojaa_protect('clients');

CREATE OR REPLACE FUNCTION resolve_portal(candidate text)
RETURNS TABLE (org_id uuid, client_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.org_id, c.id FROM clients c WHERE c.portal_token = candidate AND c.status = 'active' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION resolve_portal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_portal(text) TO sojaa_app;

CREATE TABLE sites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id           uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name                text NOT NULL,
  address             text,
  lat                 double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng                 double precision CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  -- NULL = use the organisation default
  geofence_m          int CHECK (geofence_m IS NULL OR geofence_m BETWEEN 20 AND 5000),
  checkpoints_ordered boolean NOT NULL DEFAULT false,
  rounds_per_shift    int NOT NULL DEFAULT 0 CHECK (rounds_per_shift BETWEEN 0 AND 48),
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_id, name),
  CHECK ((lat IS NULL) = (lng IS NULL))
);
CREATE INDEX sites_org_idx ON sites (org_id, active, name);
CREATE INDEX sites_client_idx ON sites (client_id);
SELECT sojaa_protect('sites');

CREATE TABLE posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id          uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  guards_required  int NOT NULL DEFAULT 1 CHECK (guards_required BETWEEN 1 AND 50),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, name)
);
SELECT sojaa_protect('posts');

-- The QR on the wall encodes the token. It is a low-value secret printed in a public-ish place, kept in plain text so the QR can be reprinted.
CREATE TABLE checkpoints (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id   uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  name      text NOT NULL,
  seq       int NOT NULL CHECK (seq >= 1),
  token     text NOT NULL UNIQUE,
  active    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, name)
);
CREATE INDEX checkpoints_site_idx ON checkpoints (site_id, seq);
SELECT sojaa_protect('checkpoints');

CREATE TABLE shift_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  name        text NOT NULL,
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, name),
  CHECK (start_time <> end_time)
);
SELECT sojaa_protect('shift_templates');

CREATE TABLE shifts (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id                  uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  site_id                    uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  post_id                    uuid NOT NULL REFERENCES posts(id) ON DELETE RESTRICT,
  -- NULL = an open shift nobody has been given yet
  guard_id                   uuid REFERENCES guards(id) ON DELETE RESTRICT,
  start_at                   timestamptz NOT NULL,
  end_at                     timestamptz NOT NULL,
  scheduled_minutes          int NOT NULL CHECK (scheduled_minutes BETWEEN 30 AND 1440),
  status                     text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  published_at               timestamptz,
  overtime_approved_minutes  int NOT NULL DEFAULT 0 CHECK (overtime_approved_minutes BETWEEN 0 AND 720),
  overtime_note              text,
  created_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at),
  -- a guard cannot be on two shifts that overlap in time
  CONSTRAINT shifts_no_double_booking EXCLUDE USING gist (guard_id WITH =, tstzrange(start_at, end_at) WITH &&)
    WHERE (guard_id IS NOT NULL AND status = 'scheduled')
);
CREATE INDEX shifts_org_start_idx ON shifts (org_id, start_at);
CREATE INDEX shifts_site_start_idx ON shifts (site_id, start_at);
CREATE INDEX shifts_guard_start_idx ON shifts (guard_id, start_at);
CREATE INDEX shifts_branch_start_idx ON shifts (org_id, branch_id, start_at);
SELECT sojaa_protect('shifts');

CREATE TABLE swap_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  shift_id      uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  from_guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  to_guard_id   uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  requested_by  uuid NOT NULL,
  reason        text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    uuid,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_guard_id <> to_guard_id)
);
CREATE INDEX swap_requests_status_idx ON swap_requests (org_id, status, created_at DESC);
-- one open request per shift
CREATE UNIQUE INDEX swap_requests_one_pending ON swap_requests (shift_id) WHERE status = 'pending';
SELECT sojaa_protect('swap_requests');

-- Attendance: facts, never edited. `at` is the SERVER clock when the event arrived; a device's own clock is never used.
-- A correction is a new override event carrying the supervisor's stated time and a reason; the latest override wins and the
-- original event stays on record.
CREATE TABLE attendance_events (
  id            bigserial PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  shift_id      uuid NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  guard_id      uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  kind          text NOT NULL CHECK (kind IN ('in', 'out', 'override_in', 'override_out')),
  at            timestamptz NOT NULL DEFAULT now(),
  effective_at  timestamptz NOT NULL DEFAULT now(),
  method        text NOT NULL CHECK (method IN ('supervisor', 'guard_pin', 'override')),
  recorded_by   uuid,
  lat           double precision,
  lng           double precision,
  accuracy_m    int,
  distance_m    int,
  geofence      text NOT NULL DEFAULT 'unknown' CHECK (geofence IN ('within', 'outside', 'unknown')),
  reason        text,
  CHECK (kind NOT IN ('override_in', 'override_out') OR (reason IS NOT NULL AND length(trim(reason)) >= 5 AND method = 'override')),
  CHECK (kind IN ('override_in', 'override_out') OR method <> 'override')
);
-- the duplicate-check-in control: one in and one out per shift, enforced by the database
CREATE UNIQUE INDEX attendance_one_in ON attendance_events (shift_id) WHERE kind = 'in';
CREATE UNIQUE INDEX attendance_one_out ON attendance_events (shift_id) WHERE kind = 'out';
CREATE INDEX attendance_shift_idx ON attendance_events (org_id, shift_id, id);
CREATE INDEX attendance_guard_idx ON attendance_events (org_id, guard_id, at DESC);
SELECT sojaa_protect('attendance_events');
SELECT sojaa_append_only('attendance_events');

CREATE TABLE patrol_scans (
  id             bigserial PRIMARY KEY,
  org_id         uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  site_id        uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  shift_id       uuid REFERENCES shifts(id) ON DELETE RESTRICT,
  guard_id       uuid REFERENCES guards(id) ON DELETE RESTRICT,
  checkpoint_id  uuid NOT NULL REFERENCES checkpoints(id) ON DELETE RESTRICT,
  scanned_at     timestamptz NOT NULL DEFAULT now(),
  method         text NOT NULL CHECK (method IN ('supervisor', 'guard_pin')),
  recorded_by    uuid,
  lat            double precision,
  lng            double precision,
  geofence       text NOT NULL DEFAULT 'unknown' CHECK (geofence IN ('within', 'outside', 'unknown'))
);
CREATE INDEX patrol_scans_shift_idx ON patrol_scans (org_id, shift_id, scanned_at);
CREATE INDEX patrol_scans_site_idx ON patrol_scans (org_id, site_id, scanned_at DESC);
SELECT sojaa_protect('patrol_scans');
SELECT sojaa_append_only('patrol_scans');

CREATE TABLE incidents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  incident_no  text NOT NULL,
  site_id      uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
  shift_id     uuid REFERENCES shifts(id) ON DELETE RESTRICT,
  guard_id     uuid REFERENCES guards(id) ON DELETE RESTRICT,
  reported_by  uuid NOT NULL,
  severity     text NOT NULL CHECK (severity IN ('info', 'minor', 'major', 'critical')),
  category     text NOT NULL,
  narrative    text NOT NULL CHECK (length(trim(narrative)) >= 5),
  occurred_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, incident_no)
);
CREATE INDEX incidents_org_idx ON incidents (org_id, created_at DESC);
CREATE INDEX incidents_site_idx ON incidents (site_id, created_at DESC);
SELECT sojaa_protect('incidents');
SELECT sojaa_append_only('incidents');

CREATE TABLE incident_notes (
  id           bigserial PRIMARY KEY,
  org_id       uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE RESTRICT,
  kind         text NOT NULL CHECK (kind IN ('note', 'close', 'reopen')),
  body         text NOT NULL CHECK (length(trim(body)) >= 3),
  by_user      uuid NOT NULL,
  at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_notes_idx ON incident_notes (incident_id, id);
SELECT sojaa_protect('incident_notes');
SELECT sojaa_append_only('incident_notes');

-- Public holidays are typed in by the firm. Sojaa ships no calendar: dates move (religious holidays) and a wrong built-in date would
-- silently mis-pay guards.
CREATE TABLE org_holidays (
  org_id  uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  day     date NOT NULL,
  name    text NOT NULL,
  PRIMARY KEY (org_id, day)
);
SELECT sojaa_protect('org_holidays');

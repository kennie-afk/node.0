-- Guard training certificates and issued equipment (so their expiry and return dates can be watched), and a per-firm
-- notification outbox that a dispatcher drains through the configured SMS provider, retrying with a back-off.
CREATE TABLE guard_training (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  guard_id    uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  title       text NOT NULL CHECK (length(trim(title)) >= 2),
  -- as typed by the firm; nothing here is verified with the issuer
  certificate_no text,
  issued_on   date,
  expires_on  date,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guard_training_expiry_idx ON guard_training (org_id, expires_on) WHERE expires_on IS NOT NULL;
SELECT sojaa_protect('guard_training');

CREATE TABLE equipment_issues (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  guard_id      uuid NOT NULL REFERENCES guards(id) ON DELETE RESTRICT,
  item          text NOT NULL CHECK (length(trim(item)) >= 2),
  serial_no     text,
  issued_on     date NOT NULL,
  return_due_on date,
  returned_on   date,
  created_by    uuid NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (returned_on IS NULL OR returned_on >= issued_on)
);
CREATE INDEX equipment_due_idx ON equipment_issues (org_id, return_due_on) WHERE returned_on IS NULL;
SELECT sojaa_protect('equipment_issues');

CREATE TABLE notification_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
  guard_id        uuid REFERENCES guards(id) ON DELETE RESTRICT,
  to_phone        text NOT NULL,
  purpose         text NOT NULL,
  body            text NOT NULL,
  -- the same alert is queued once: e.g. 'psra:<guard>:<expiry date>'
  dedupe_key      text NOT NULL,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  UNIQUE (org_id, dedupe_key)
);
CREATE INDEX outbox_due_idx ON notification_outbox (org_id, next_attempt_at) WHERE status = 'queued';
SELECT sojaa_protect('notification_outbox');

-- Which firms have something to send now; returns ids only.
CREATE FUNCTION outbox_orgs() RETURNS TABLE (org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT o.org_id FROM notification_outbox o WHERE o.status = 'queued' AND o.next_attempt_at <= now();
$$;
REVOKE ALL ON FUNCTION outbox_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION outbox_orgs() TO sojaa_app;

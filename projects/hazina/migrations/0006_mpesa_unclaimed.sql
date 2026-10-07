-- Money that reached this system for a shortcode nobody has registered. Nothing here belongs to a
-- tenant, so there is no RLS; the application role may only add rows (reading and clearing them is an
-- operator task done as the migration role). TransID is unique, so a Daraja retry adds nothing twice.
CREATE TABLE IF NOT EXISTS mpesa_unclaimed (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code     text NOT NULL,
  external_ref   text NOT NULL UNIQUE,
  amount_cents   bigint NOT NULL CHECK (amount_cents > 0),
  payer_msisdn   text,
  bill_ref       text,
  received_at    timestamptz NOT NULL,
  raw            jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  claimed_by_org uuid,
  claimed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS mpesa_unclaimed_short_code_idx ON mpesa_unclaimed (short_code) WHERE claimed_at IS NULL;
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON mpesa_unclaimed FROM hazina_app;
GRANT INSERT ON mpesa_unclaimed TO hazina_app;
-- ON CONFLICT needs to read the unique column to see the clash; that one column is all the app role gets.
GRANT SELECT (external_ref) ON mpesa_unclaimed TO hazina_app;

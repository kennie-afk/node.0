-- Self-serve signup requests: captured before an organisation exists, so this
-- table carries no org_id and is exempt from row-level security by design.
-- Kennedy (or whoever runs onboarding) converts a request into a real
-- organisation/site/user manually today; this is the intake, not automatic
-- provisioning.
CREATE TABLE signup_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name  text NOT NULL,
  phone         text NOT NULL,
  site_count    int  NOT NULL DEFAULT 1,
  notes         text,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'onboarded', 'declined')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX signup_requests_status_idx ON signup_requests (status, created_at DESC);

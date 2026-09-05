ALTER TABLE telemetry_minute ALTER COLUMN bay_id DROP NOT NULL;
ALTER TABLE telemetry_hour   ALTER COLUMN bay_id DROP NOT NULL;

ALTER TABLE sites ADD COLUMN IF NOT EXISTS till_number text;
CREATE UNIQUE INDEX IF NOT EXISTS sites_till_unique ON sites (till_number) WHERE till_number IS NOT NULL;

CREATE OR REPLACE FUNCTION resolve_till(candidate text)
RETURNS TABLE (org_id uuid, site_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.org_id, s.id
    FROM sites s
   WHERE s.till_number = candidate
      OR s.id::text = candidate
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_till(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_till(text) TO forecourt_app;

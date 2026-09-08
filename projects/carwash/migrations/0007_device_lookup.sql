CREATE OR REPLACE FUNCTION resolve_device(candidate uuid)
RETURNS TABLE (id uuid, org_id uuid, site_id uuid, bay_id uuid, secret_hash text, last_sequence bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.org_id, d.site_id, d.bay_id, d.secret_hash, d.last_sequence
    FROM devices d
   WHERE d.id = candidate AND d.status = 'active'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_device(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_device(uuid) TO forecourt_app;

CREATE INDEX IF NOT EXISTS telemetry_device_sequence_idx ON telemetry (device_id, sequence DESC);

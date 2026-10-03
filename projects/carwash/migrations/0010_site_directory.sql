-- The daily-close runner walks every site of every organisation. It needs only their ids and
-- time zones, and then enters each organisation through the ordinary per-organisation path, so this
-- is the same kind of narrow SECURITY DEFINER lookup as resolve_till and billing_org_ids.
CREATE OR REPLACE FUNCTION site_directory()
RETURNS TABLE (org_id uuid, site_id uuid, timezone text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.org_id, s.id, s.timezone FROM sites s ORDER BY s.org_id, s.id;
$$;
REVOKE ALL ON FUNCTION site_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION site_directory() TO forecourt_app;

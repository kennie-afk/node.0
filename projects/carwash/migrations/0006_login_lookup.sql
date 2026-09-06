CREATE OR REPLACE FUNCTION resolve_login(candidate text)
RETURNS TABLE (id uuid, org_id uuid, site_id uuid, role text, display_name text, pin_hash text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.org_id, u.site_id, u.role, u.display_name, u.pin_hash
    FROM users u
   WHERE u.phone = candidate AND u.status = 'active'
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_login(text) TO forecourt_app;

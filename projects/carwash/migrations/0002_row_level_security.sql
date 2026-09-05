CREATE OR REPLACE FUNCTION current_org() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('forecourt.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  target text;
  tenant_tables text[] := ARRAY[
    'sites','bays','users','services','vehicles','jobs','job_events','payments',
    'discrepancies','devices','telemetry','plate_captures','inventory_movements'
  ];
BEGIN
  FOREACH target IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);

    EXECUTE format(
      'CREATE POLICY %I ON %I USING (org_id = current_org()) WITH CHECK (org_id = current_org())',
      target || '_tenant_isolation', target
    );
  END LOOP;
END $$;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
CREATE POLICY organisations_tenant_isolation ON organisations
  USING (id = current_org())
  WITH CHECK (id = current_org());

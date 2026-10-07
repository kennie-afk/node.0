-- /readyz compares the migrations this build ships with the ones applied. schema_migrations is created before the default
-- privileges of migration 0001 exist, so the app role was never granted it; it needs read access to the names only.
GRANT SELECT ON schema_migrations TO hazina_app;

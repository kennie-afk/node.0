CREATE OR REPLACE FUNCTION ensure_month_partition(parent text, month date)
RETURNS void AS $$
DECLARE
  child text := format('%s_%s', parent, to_char(month, 'YYYY_MM'));
  starts date := date_trunc('month', month)::date;
  ends   date := (date_trunc('month', month) + interval '1 month')::date;
BEGIN
  IF to_regclass(child) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      child, parent, starts, ends
    );
  END IF;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ensure_upcoming_partitions(months int DEFAULT 3)
RETURNS void AS $$
DECLARE
  offset_month int;
BEGIN
  FOR offset_month IN -1..months LOOP
    PERFORM ensure_month_partition('job_events', (CURRENT_DATE + (offset_month || ' month')::interval)::date);
    PERFORM ensure_month_partition('telemetry',  (CURRENT_DATE + (offset_month || ' month')::interval)::date);
  END LOOP;
END $$ LANGUAGE plpgsql;

SELECT ensure_upcoming_partitions(3);

CREATE TABLE IF NOT EXISTS telemetry_minute (
  org_id   uuid NOT NULL,
  site_id  uuid NOT NULL,
  bay_id   uuid,
  bucket   timestamptz NOT NULL,
  metric   text NOT NULL,
  total    double precision NOT NULL,
  samples  int NOT NULL,
  PRIMARY KEY (site_id, bucket, metric, bay_id)
);
CREATE INDEX IF NOT EXISTS telemetry_minute_site_bucket_idx ON telemetry_minute (site_id, bucket DESC);

CREATE TABLE IF NOT EXISTS telemetry_hour (
  org_id   uuid NOT NULL,
  site_id  uuid NOT NULL,
  bay_id   uuid,
  bucket   timestamptz NOT NULL,
  metric   text NOT NULL,
  total    double precision NOT NULL,
  samples  int NOT NULL,
  PRIMARY KEY (site_id, bucket, metric, bay_id)
);
CREATE INDEX IF NOT EXISTS telemetry_hour_site_bucket_idx ON telemetry_hour (site_id, bucket DESC);

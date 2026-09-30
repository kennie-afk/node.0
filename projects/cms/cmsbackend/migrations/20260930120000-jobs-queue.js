'use strict';

const { enableTenantRls } = require('../migrations-lib/tenant');

/**
 * Durable job queue. The jobs table is cross-tenant by nature (a worker serves every church),
 * so its row-level security policy only lets a request see its OWN church's jobs, and the
 * worker's cross-tenant operations (claim, finish, fail, system enqueue, maintenance purge) go
 * through SECURITY DEFINER functions owned by the schema owner. The application role can enqueue
 * for the church it is acting for and nothing else; it cannot list or alter other churches' jobs.
 */
module.exports = {
  async up(queryInterface) {
    const qi = queryInterface;
    await qi.sequelize.transaction(async (transaction) => {
      const q = (sql) => qi.sequelize.query(sql, { transaction });

      await q(`
        CREATE TABLE jobs (
          id bigserial PRIMARY KEY,
          church_id integer REFERENCES churches(id) ON DELETE CASCADE,
          type varchar(80) NOT NULL,
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          status varchar(10) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','dead')),
          run_at timestamptz NOT NULL DEFAULT now(),
          attempts integer NOT NULL DEFAULT 0,
          max_attempts integer NOT NULL DEFAULT 8,
          last_error text,
          dedupe_key varchar(160),
          locked_by varchar(80),
          locked_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          finished_at timestamptz
        )`);
      // Only one live job per (church, dedupe key): a retrying caller cannot stack duplicates.
      await q(`CREATE UNIQUE INDEX jobs_dedupe_live ON jobs (COALESCE(church_id, 0), dedupe_key)
                 WHERE dedupe_key IS NOT NULL AND status IN ('queued','running')`);
      await q(`CREATE INDEX jobs_claim ON jobs (run_at) WHERE status = 'queued'`);
      await q(`CREATE INDEX jobs_stuck ON jobs (locked_at) WHERE status = 'running'`);
      await q(`CREATE INDEX jobs_church ON jobs (church_id, status)`);

      await enableTenantRls(qi, 'jobs', { transaction });

      // Leaderless scheduling: one row per recurring task. A worker wins a run by moving
      // last_run_at forward in a single atomic upsert, so exactly one of N workers fires it per
      // interval, with no session-level lock (those do not survive PgBouncer transaction pooling).
      await q(`
        CREATE TABLE scheduler_state (
          name varchar(80) PRIMARY KEY,
          last_run_at timestamptz NOT NULL
        )`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_claim(worker text, batch integer, lease_seconds integer)
        RETURNS SETOF jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        BEGIN
          -- A worker that died mid-job leaves it 'running'; after the lease expires it is re-queued.
          UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL
           WHERE status = 'running' AND locked_at < now() - make_interval(secs => lease_seconds);
          RETURN QUERY
          UPDATE jobs j SET status = 'running', locked_by = worker, locked_at = now(), attempts = j.attempts + 1
           WHERE j.id IN (
             SELECT id FROM jobs WHERE status = 'queued' AND run_at <= now()
              ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT batch)
          RETURNING j.*;
        END $$;`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_finish(job_id bigint) RETURNS void
        LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
          UPDATE jobs SET status = 'done', finished_at = now(), locked_by = NULL, locked_at = NULL, last_error = NULL WHERE id = job_id
        $$;`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_fail(job_id bigint, message text, retry_in_seconds integer) RETURNS text
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE result text;
        BEGIN
          UPDATE jobs SET
            status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
            run_at = CASE WHEN attempts >= max_attempts THEN run_at ELSE now() + make_interval(secs => retry_in_seconds) END,
            last_error = left(message, 2000), locked_by = NULL, locked_at = NULL,
            finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END
          WHERE id = job_id RETURNING status INTO result;
          RETURN result;
        END $$;`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_enqueue_system(job_type text, job_payload jsonb, job_church integer, job_dedupe text, job_run_at timestamptz)
        RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE new_id bigint;
        BEGIN
          INSERT INTO jobs (type, payload, church_id, dedupe_key, run_at)
          VALUES (job_type, job_payload, job_church, job_dedupe, COALESCE(job_run_at, now()))
          ON CONFLICT DO NOTHING RETURNING id INTO new_id;
          RETURN new_id;
        END $$;`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_stats() RETURNS TABLE (status text, n bigint, oldest_age_seconds double precision)
        LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
          SELECT status::text, count(*), COALESCE(EXTRACT(EPOCH FROM now() - min(run_at)), 0)::double precision
            FROM jobs WHERE status IN ('queued','running','dead') GROUP BY status
        $$;`);

      await q(`
        CREATE OR REPLACE FUNCTION jobs_purge(done_older_than_days integer, idempotency_older_than_hours integer) RETURNS TABLE (jobs_deleted bigint, keys_deleted bigint)
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
        DECLARE j bigint; k bigint;
        BEGIN
          DELETE FROM jobs WHERE status = 'done' AND finished_at < now() - make_interval(days => done_older_than_days);
          GET DIAGNOSTICS j = ROW_COUNT;
          DELETE FROM idempotency_keys WHERE created_at < now() - make_interval(hours => idempotency_older_than_hours);
          GET DIAGNOSTICS k = ROW_COUNT;
          RETURN QUERY SELECT j, k;
        END $$;`);

      // Lets a starting pod confirm the schema is current without being granted sequelize_meta.
      await q(`
        CREATE OR REPLACE FUNCTION cms_migration_count() RETURNS bigint
        LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT count(*) FROM sequelize_meta $$;`);

      for (const fn of [
        'jobs_claim(text, integer, integer)',
        'jobs_finish(bigint)',
        'jobs_fail(bigint, text, integer)',
        'jobs_enqueue_system(text, jsonb, integer, text, timestamptz)',
        'jobs_stats()',
        'jobs_purge(integer, integer)',
        'cms_migration_count()'
      ]) {
        await q(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
      }
      const appUser = process.env.APP_DB_USER;
      if (appUser) {
        for (const fn of [
          'jobs_claim(text, integer, integer)',
          'jobs_finish(bigint)',
          'jobs_fail(bigint, text, integer)',
          'jobs_enqueue_system(text, jsonb, integer, text, timestamptz)',
          'jobs_stats()',
          'jobs_purge(integer, integer)',
          'cms_migration_count()'
        ]) {
          await q(`GRANT EXECUTE ON FUNCTION ${fn} TO ${appUser}`);
        }
        // PgBouncer (transaction mode) does not forward startup parameters, so the limits that
        // stop a runaway query pinning a pooled connection live on the role itself.
        await q(`ALTER ROLE ${appUser} SET statement_timeout = '15s'`);
        await q(`ALTER ROLE ${appUser} SET idle_in_transaction_session_timeout = '30s'`);
      }
    });
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    for (const fn of [
      'jobs_claim(text, integer, integer)',
      'jobs_finish(bigint)',
      'jobs_fail(bigint, text, integer)',
      'jobs_enqueue_system(text, jsonb, integer, text, timestamptz)',
      'jobs_stats()',
      'jobs_purge(integer, integer)',
      'cms_migration_count()'
    ]) {
      await q(`DROP FUNCTION IF EXISTS ${fn}`);
    }
    await q('DROP TABLE IF EXISTS scheduler_state');
    await q('DROP TABLE IF EXISTS jobs');
  }
};

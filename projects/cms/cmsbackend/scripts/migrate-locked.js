#!/usr/bin/env node
'use strict';

/**
 * Runs `sequelize-cli db:migrate` while holding a Postgres advisory lock, so any number of pods
 * or jobs started at once apply migrations one at a time instead of racing each other (the CLI
 * has no locking of its own). The lock is a session lock, so MIGRATE_DATABASE_URL must be a direct
 * connection to Postgres (not PgBouncer in transaction mode).
 *
 * Usage: node scripts/migrate-locked.js [db:migrate | db:migrate:undo | ...]   (default db:migrate)
 * Env:   MIGRATE_DATABASE_URL (or DATABASE_URL), DATABASE_SSL, APP_DB_USER/APP_DB_PASSWORD,
 *        MIGRATE_LOCK_TIMEOUT_SECONDS (default 300).
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const { Client } = require('pg');

const LOCK_KEY = 727_001_001;
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) {
  console.error('MIGRATE_DATABASE_URL (or DATABASE_URL) must be set');
  process.exit(2);
}
const command = process.argv[2] || 'db:migrate';
const timeoutMs = Number(process.env.MIGRATE_LOCK_TIMEOUT_SECONDS || 300) * 1000;
const ssl = process.env.DATABASE_SSL === 'false' || url.includes('localhost') ? false : { rejectUnauthorized: false };

async function main() {
  // The database may still be starting (first boot, image pull, failover): retry the connection
  // instead of burning the Job's backoff budget on a dependency that is merely late.
  const connectDeadline = Date.now() + Number(process.env.MIGRATE_CONNECT_TIMEOUT_SECONDS || 180) * 1000;
  let client;
  for (;;) {
    client = new Client({ connectionString: url, ssl });
    try {
      await client.connect();
      break;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (Date.now() > connectDeadline) throw error;
      console.log(`database not reachable yet (${error.code || error.message}); retrying`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  const started = Date.now();
  let waitedLogged = false;
  // Poll rather than block forever: a wedged migration elsewhere should fail this pod visibly.
  for (;;) {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
    if (rows[0].locked) break;
    if (!waitedLogged) {
      console.log('another migration is running; waiting for it to finish');
      waitedLogged = true;
    }
    if (Date.now() - started > timeoutMs) {
      console.error('timed out waiting for the migration lock');
      await client.end();
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const cli = path.join(__dirname, '..', 'node_modules', '.bin', 'sequelize-cli');
  const code = await new Promise((resolve) => {
    const child = spawn(cli, [command], { stdio: 'inherit', env: { ...process.env, MIGRATE_DATABASE_URL: url } });
    child.on('exit', (status) => resolve(status ?? 1));
  });
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
  await client.end();
  process.exit(code);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

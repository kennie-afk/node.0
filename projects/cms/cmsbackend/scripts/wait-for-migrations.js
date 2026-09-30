#!/usr/bin/env node
'use strict';

/**
 * Init-container gate: waits until every migration file in ./migrations has been applied, so a pod
 * never serves traffic against an older schema than its code expects. Connects as the application
 * role (DATABASE_URL); it reads the count through a SECURITY DEFINER function because that role is
 * deliberately not granted sequelize_meta.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const expected = fs.readdirSync(path.join(__dirname, '..', 'migrations')).filter((f) => f.endsWith('.js')).length;
const deadline = Date.now() + Number(process.env.WAIT_TIMEOUT_SECONDS || 300) * 1000;

async function attempt() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT cms_migration_count() AS n');
    return Number(rows[0].n);
  } finally {
    await client.end();
  }
}

(async () => {
  for (;;) {
    let applied = -1;
    try {
      applied = await attempt();
      if (applied >= expected) {
        console.log(`schema current: ${applied}/${expected} migrations applied`);
        return;
      }
    } catch (error) {
      console.log(`waiting for the database: ${error.message}`);
    }
    if (Date.now() > deadline) {
      console.error(`gave up: ${applied}/${expected} migrations applied`);
      process.exit(1);
    }
    console.log(`waiting for migrations (${applied}/${expected})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
})();

import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { boot, makePlace, newTenant, on, shutdown } from './helpers';

describe.runIf(on)('CSV exports are streamed with no silent cap (real Postgres)', () => {
  afterAll(shutdown);

  it('exports more attendance rows than the old 50,000 cap and more incidents than the old 20,000 cap', async () => {
    const { app, pool } = await boot();
    const t = await newTenant('Big Export Ltd');
    const place = await makePlace(t.owner.auth);
    const SHIFTS = 50_050;
    const INCIDENTS = 20_050;
    await pool.withMigrator(async (c) => {
      // open (unassigned) shifts 30 minutes each, spread over 40 days in October 2026, seeded in bulk with SQL
      await c.query(
        `INSERT INTO shifts (org_id, branch_id, site_id, post_id, start_at, end_at, scheduled_minutes)
         SELECT $1, $2, $3, $4, ts, ts + interval '30 minutes', 30
           FROM (SELECT timestamptz '2026-08-01 00:00:00+03' + (g * interval '1 minute' * 1) AS ts FROM generate_series(0, $5::int - 1) g) x`,
        [t.orgId, t.branchId, place.siteId, place.postId, SHIFTS]
      );
      await c.query(
        `INSERT INTO incidents (org_id, branch_id, incident_no, site_id, reported_by, severity, category, narrative, occurred_at)
         SELECT $1, $2, 'INC-BULK-' || g, $3, $4, 'info', 'other', 'bulk seeded row ' || g, now() - (g * interval '1 second') FROM generate_series(1, $5::int) g`,
        [t.orgId, t.branchId, place.siteId, t.owner.id, INCIDENTS]
      );
    });

    const inc = await request(app).get('/v1/exports/incidents.csv').set(t.owner.auth).buffer(true).parse((res, cb) => { let d = ''; res.setEncoding('utf8'); res.on('data', (x) => (d += x)); res.on('end', () => cb(null, d)); });
    const incLines = String(inc.body).trim().split('\n');
    expect(inc.status).toBe(200);
    expect(incLines).toHaveLength(INCIDENTS + 1);
    expect(incLines[0]).toBe('incident_no,occurred_at,site,severity,category,guard,narrative');

    // 63 days max per request: 50,050 minutes of shifts all fall on 2026-08-01 .. 2026-09-04
    const att = await request(app).get('/v1/exports/attendance.csv?from=2026-08-01&to=2026-09-05').set(t.owner.auth).buffer(true).parse((res, cb) => { let d = ''; res.setEncoding('utf8'); res.on('data', (x) => (d += x)); res.on('end', () => cb(null, d)); });
    const attLines = String(att.body).trim().split('\n');
    expect(att.status).toBe(200);
    expect(attLines).toHaveLength(SHIFTS + 1);
    expect(attLines[0]).toMatch(/^date,client,site,post,guard_no/);
  }, 180_000);
});

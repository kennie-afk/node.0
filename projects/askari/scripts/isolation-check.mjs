#!/usr/bin/env node
/**
 * Live two-tenant isolation check against a RUNNING compose stack (docker compose up -d).
 *
 *   node scripts/isolation-check.mjs
 *
 * It provisions two security firms through the operator CLI inside the api container, signs both in over HTTP, has A create a
 * guard, a client, a site with a checkpoint, a shift, a check-in, an incident, a rate, a payroll run and a portal link, then proves B cannot
 * see, change or smuggle anything into A's data - first through the API, then in the database itself as the restricted application
 * role (askari_app), which is what the API connects as. Exit code 0 only if every check passes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = `http://localhost:${env.API_PORT ?? 4400}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  - ${detail}` : ''}`); };
const compose = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });

function psql(sql, orgId) {
  const prefix = orgId ? `BEGIN; SELECT set_config('askari.org_id', '${orgId}', true); ` : 'BEGIN; ';
  try {
    return compose('exec', '-T', '-e', `PGPASSWORD=${env.ASKARI_APP_PASSWORD}`, 'postgres', 'psql', '-U', 'askari_app', '-d', env.POSTGRES_DB ?? 'askari', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `${prefix}${sql}; COMMIT;`).trim();
  } catch (error) {
    return `ERROR: ${(error.stderr ?? error.message).toString().trim()}`;
  }
}
const lastLine = (out) => out.split('\n').filter((l) => !/^(BEGIN|COMMIT|set_config|[0-9a-f-]{36})$/.test(l) && l.trim() !== '').pop() ?? '';

async function http(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, body: json };
}

const stamp = Date.now().toString().slice(-7);
const local = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, p) => ({ ...o, [p.type]: p.value }), {});
async function tenant(label) {
  const phone = `07${String(10_000_000 + Math.floor(Math.random() * 80_000_000))}`;
  const out = compose('exec', '-T', 'api', 'node', 'dist/admin/cli.js', 'provision', `Isolation ${label} ${stamp}`, `Owner ${label}`, phone);
  const pin = /PIN (\d{6})/.exec(out)[1];
  const orgId = /organisation ([0-9a-f-]{36})/.exec(out)[1];
  const login = await http('POST', '/v1/auth/login', null, { phone, pin });
  return { orgId, token: login.body.token };
}

const A = await tenant('A');
const B = await tenant('B');
check('two firms provisioned and signed in', Boolean(A.token && B.token && A.orgId !== B.orgId));

// A builds some data
const guard = (await http('POST', '/v1/guards', A.token, { fullName: `A-secret ${stamp}`, nationalId: `8${stamp}`, phone: `0712${stamp.slice(0, 6)}`, psraRegNo: 'PSRA-A', hiredOn: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10) })).body;
const pay = await http('PUT', `/v1/guards/${guard.id}/pay`, A.token, { monthlyBasicCents: 3_000_000, allowanceCents: 0 });
const client = (await http('POST', '/v1/clients', A.token, { name: `A client ${stamp}` })).body;
const site = (await http('POST', '/v1/sites', A.token, { clientId: client.id, name: `A site ${stamp}`, lat: -1.29, lng: 36.82, roundsPerShift: 1 })).body;
const posts = (await http('GET', `/v1/sites/${site.id}`, A.token)).body.posts;
const cp = (await http('POST', `/v1/sites/${site.id}/checkpoints`, A.token, { name: 'A gate' })).body;
const now = new Date();
const start = new Date(now.getTime() - 10 * 60_000);
const end = new Date(now.getTime() + 6 * 3_600_000);
const s = local(start), e = local(end);
const shift = await http('POST', '/v1/shifts', A.token, { siteId: site.id, postId: posts[0].id, guardId: guard.id, date: `${s.year}-${s.month}-${s.day}`, startTime: `${s.hour}:${s.minute}`, endTime: `${e.hour}:${e.minute}` });
const checkin = await http('POST', `/v1/shifts/${shift.body.id}/check`, A.token, { kind: 'in', fix: { lat: -1.29, lng: 36.82, accuracyM: 5 } });
const scan = await http('POST', '/v1/patrol/scan', A.token, { token: cp.token, shiftId: shift.body.id });
const incident = await http('POST', '/v1/incidents', A.token, { siteId: site.id, severity: 'major', category: 'Break-in', narrative: `A secret incident ${stamp}` });
const rate = await http('POST', `/v1/sites/${site.id}/rates`, A.token, { basis: 'per_shift', amountCents: 250_000, effectiveFrom: '2025-01-01' });
const run = await http('POST', `/v1/payroll/periods/${now.toISOString().slice(0, 7)}/run`, A.token, {});
const portal = (await http('PUT', `/v1/clients/${client.id}/portal`, A.token, { enabled: true })).body;
check('A has a guard, pay, client, site, checkpoint, shift, check-in, patrol scan, incident, rate, payroll run and portal link',
  Boolean(guard.id && pay.status === 200 && client.id && site.id && cp.token && shift.status === 201 && checkin.status === 201 && scan.status === 201 && incident.status === 201 && rate.status === 201 && run.status === 200 && portal.token),
  JSON.stringify({ shift: shift.status, checkin: checkin.status, scan: scan.status, inc: incident.status, run: run.status }).slice(0, 200));

// ---- through the API ----
const secretIn = async (path, token) => JSON.stringify((await http('GET', path, token)).body ?? '').includes(stamp);
check('B sees none of A\'s guards', (await http('GET', '/v1/guards', B.token)).body.items.length === 0);
check('B cannot read A\'s guard, site, client, shift or incident by id', (await Promise.all([`/v1/guards/${guard.id}`, `/v1/sites/${site.id}`, `/v1/clients/${client.id}`, `/v1/shifts/${shift.body.id}`, `/v1/incidents/${incident.body.id}`].map((p) => http('GET', p, B.token)))).every((r) => r.status === 404));
check('B\'s lists contain nothing of A\'s: sites, clients, incidents, shifts, board, patrols', !(await secretIn('/v1/sites', B.token)) && !(await secretIn('/v1/clients', B.token)) && !(await secretIn('/v1/incidents', B.token)) && (await http('GET', `/v1/shifts?from=${s.year}-${s.month}-${s.day}&to=${s.year}-${s.month}-${s.day}`, B.token)).body.total === 0 && (await http('GET', '/v1/attendance/board', B.token)).body.counts.total === 0);
check('B cannot check A\'s guard in or out, override, assign, cancel or approve overtime', (await Promise.all([
  http('POST', `/v1/shifts/${shift.body.id}/check`, B.token, { kind: 'out' }),
  http('POST', `/v1/shifts/${shift.body.id}/override`, B.token, { kind: 'out', effectiveAt: new Date().toISOString(), reason: 'sabotage attempt here' }),
  http('PUT', `/v1/shifts/${shift.body.id}/guard`, B.token, { guardId: null }),
  http('POST', `/v1/shifts/${shift.body.id}/cancel`, B.token, { reason: 'sabotage attempt' }),
  http('PUT', `/v1/shifts/${shift.body.id}/overtime`, B.token, { minutes: 60 })
])).every((r) => r.status === 404));
check('B cannot scan A\'s checkpoint, even with the right secret code', (await http('POST', '/v1/patrol/scan', B.token, { token: cp.token, shiftId: shift.body.id })).status === 404);
check('B cannot edit A\'s guard, change their pay, or reset their PIN', [(await http('PATCH', `/v1/guards/${guard.id}`, B.token, { fullName: 'hijacked' })).status, (await http('PUT', `/v1/guards/${guard.id}/pay`, B.token, { monthlyBasicCents: 1, allowanceCents: 0 })).status, (await http('POST', `/v1/guards/${guard.id}/pin`, B.token)).status].every((x) => x === 404));
check('B cannot put a site under A\'s client, nor add a rate to A\'s site', (await http('POST', '/v1/sites', B.token, { clientId: client.id, name: 'smuggled' })).status >= 400 && (await http('POST', `/v1/sites/${site.id}/rates`, B.token, { basis: 'per_shift', amountCents: 1, effectiveFrom: '2025-01-01' })).status === 404);
check('B\'s payroll, invoices, debtors and audit trail hold nothing of A\'s', !(await secretIn('/v1/payroll/periods/' + now.toISOString().slice(0, 7) + '/payslips', B.token)) && (await http('GET', '/v1/invoices', B.token)).body.total === 0 && (await http('GET', '/v1/debtors', B.token)).body.totalCents === 0 && !(await secretIn('/v1/audit', B.token)));
check('A\'s portal link shows A\'s client and nothing about B, and no guard name or pay', await (async () => { const r = await http('GET', `/v1/portal/${portal.token}`, null); const t = JSON.stringify(r.body); return r.status === 200 && t.includes(`A client ${stamp}`) && !t.includes(`A-secret ${stamp}`) && !/monthly|basic|psra/i.test(t); })());
check('a made-up portal link and a made-up checkpoint code are refused', (await http('GET', '/v1/portal/' + 'x'.repeat(32), null)).status === 404 && (await http('POST', '/v1/patrol/scan', A.token, { token: 'x'.repeat(16), shiftId: shift.body.id })).status === 404);
check('a request with no token is refused', (await http('GET', '/v1/guards', null)).status === 401);

// ---- in the database, as the restricted application role ----
const role = psql(`SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user`);
check('the application role cannot bypass row-level security', lastLine(role) === 'f', role.replace(/\n/g, ' '));
const tables = ['guards', 'clients', 'sites', 'posts', 'checkpoints', 'shifts', 'attendance_events', 'patrol_scans', 'incidents', 'payslips', 'pay_periods', 'rate_tables', 'site_rates', 'audit_events'];
check('no tenant bound: nothing is visible in any of fourteen tables', tables.every((t) => lastLine(psql(`SELECT count(*) FROM ${t}`)) === '0'));
check('bound to A: A\'s guard is visible', lastLine(psql(`SELECT count(*) FROM guards WHERE full_name LIKE 'A-secret%'`, A.orgId)) === '1');
check('bound to B: A\'s guard is invisible', lastLine(psql(`SELECT count(*) FROM guards WHERE full_name LIKE 'A-secret%'`, B.orgId)) === '0');
check('bound to B: A\'s shifts, attendance, scans, incidents, payslips and rates are invisible', ['shifts', 'attendance_events', 'patrol_scans', 'incidents', 'payslips', 'site_rates', 'checkpoints'].every((t) => lastLine(psql(`SELECT count(*) FROM ${t}`, B.orgId)) === '0'));
check('bound to B: updating A\'s rows touches nothing', lastLine(psql(`UPDATE guards SET full_name = 'hijacked' WHERE full_name LIKE 'A-secret%'`, B.orgId)).includes('UPDATE 0'));
check('bound to B: writing a row that belongs to A is refused by the policy', psql(`INSERT INTO clients (org_id, name) VALUES ('${A.orgId}', 'smuggled')`, B.orgId).includes('row-level security'));
check('attendance, scans, incidents, pay adjustments and the audit trail cannot be edited even by their own tenant', ['UPDATE attendance_events SET kind = \'out\'', 'DELETE FROM attendance_events', 'DELETE FROM patrol_scans', 'UPDATE incidents SET narrative = \'x\'', 'DELETE FROM incident_notes', 'DELETE FROM audit_events', 'DELETE FROM payroll_adjustments'].every((q) => psql(q, A.orgId).includes('permission denied')));
check('a guard cannot be double-booked even by a direct insert', psql(`INSERT INTO shifts (org_id, branch_id, site_id, post_id, guard_id, start_at, end_at, scheduled_minutes) SELECT org_id, branch_id, site_id, post_id, guard_id, start_at + interval '1 minute', end_at, 60 FROM shifts LIMIT 1`, A.orgId).includes('shifts_no_double_booking'));

const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} isolation checks passed`);
process.exit(ok ? 0 : 1);

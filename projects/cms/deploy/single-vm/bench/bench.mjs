// Measures the hot endpoints with autocannon. Usage:
//   npm i --prefix /tmp/cmsbench autocannon
//   NODE_PATH=/tmp/cmsbench/node_modules node bench.mjs http://127.0.0.1:8180/api admin@grace-demo.test DemoPass-12345 [seconds] [connections]
// Every endpoint runs alone for <seconds> at <connections> concurrent clients (default 8s, 32). Prints one
// row per endpoint: requests/s and latency percentiles in ms. Machine details are printed first.
import { createRequire } from 'node:module';
import os from 'node:os';
const require = createRequire(import.meta.url);
const autocannon = require('autocannon');

const [base, email, password, secs = '8', conns = '32'] = process.argv.slice(2);
if (!base || !email) { console.error('usage: bench.mjs <apiBase> <email> <password> [seconds] [connections]'); process.exit(2); }
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip', ...headers }, body: JSON.stringify(body) });
const login = await post('/auth/login', { email, password });
if (!login.ok) throw new Error('login failed ' + login.status + ' ' + await login.text());
const token = (await login.json()).token;
const auth = { authorization: `Bearer ${token}`, 'accept-encoding': 'gzip' };
const get = async (path) => (await fetch(base + path, { headers: auth })).json();

// Learn real ids so the endpoints that need them are exercised for real.
const members = await get('/members?page=1&pageSize=1');
const firstMember = members.data?.[0]?.id;
const accounts = await get('/finance/accounts').catch(() => []);
const funds = await get('/finance/funds').catch(() => []);
const month = new Date().toISOString().slice(0, 7);
const year = new Date().getUTCFullYear();

const scenarios = [
  ['GET  /overview (dashboard)', { path: '/overview' }],
  ['GET  /members page 1 (25)', { path: '/members?page=1&pageSize=25' }],
  ['GET  /members page 1500 (deep)', { path: '/members?page=1500&pageSize=25' }],
  ['GET  /members search "wanj"', { path: '/members?page=1&pageSize=25&q=wanj' }],
  ['GET  /members search "kamau 1234"', { path: '/members?page=1&pageSize=25&q=bulk-1234' }],
  ['GET  /giving/contributions (keyset 25)', { path: '/giving/contributions?limit=25' }],
  ['GET  /finance/journal (keyset 25)', { path: '/finance/journal?limit=25' }],
  ['GET  /reports/income-statement', { path: `/reports/income-statement?from=${year}-01-01&to=${year}-12-31` }],
  ['GET  /reports/balance-sheet', { path: '/reports/balance-sheet' }],
  ['GET  /reports/giving/by-month', { path: `/reports/giving/by-month?from=${year - 2}-01-01&to=${year}-12-31` }],
  ['GET  /reports/giving/top-givers', { path: `/reports/giving/top-givers?from=${year - 2}-01-01&to=${year}-12-31&limit=20` }],
  ['GET  /reports/giving/lapsed', { path: '/reports/giving/lapsed' }],
  ['GET  /reports/giving/retention', { path: `/reports/giving/retention?year=${year}` }],
  ['POST /auth/login (bcrypt)', { path: '/auth/login', method: 'POST', body: JSON.stringify({ email, password }), headers: { 'content-type': 'application/json', 'accept-encoding': 'gzip' }, noAuth: true, conns: 4 }]
];
const only = process.env.ONLY;
console.log(`host: ${os.cpus().length} cores ${os.cpus()[0].model.trim()}, ${(os.totalmem() / 2 ** 30).toFixed(1)} GiB; node ${process.version}; ${secs}s per endpoint at ${conns} connections; load generator on the same machine`);
console.log('endpoint'.padEnd(40), 'req/s'.padStart(8), 'p50'.padStart(7), 'p90'.padStart(7), 'p99'.padStart(7), 'max'.padStart(7), '  non2xx');
const rows = [];
for (const [name, s] of scenarios) {
  if (only && !name.includes(only)) continue;
  const r = await autocannon({ url: base + s.path, method: s.method ?? 'GET', body: s.body, connections: s.conns ?? Number(conns), duration: Number(secs), headers: s.noAuth ? s.headers : { ...auth, ...(s.headers ?? {}) }, timeout: 30 });
  rows.push({ name, rps: Math.round(r.requests.average), p50: r.latency.p50, p90: r.latency.p90, p99: r.latency.p99, max: r.latency.max, bad: r.non2xx });
  console.log(name.padEnd(40), String(Math.round(r.requests.average)).padStart(8), String(r.latency.p50).padStart(7), String(r.latency.p90).padStart(7), String(r.latency.p99).padStart(7), String(r.latency.max).padStart(7), '  ' + r.non2xx);
}
if (process.env.JSON) console.log(JSON.stringify(rows));

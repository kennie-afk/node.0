// k6 load test for the church CMS.
//   docker run --rm --network host -v "$PWD":/t -e BASE=http://127.0.0.1:4400 grafana/k6 run /t/cms.k6.js
// Run the API with RATE_LIMIT_MAX set very high (the default 100/15min/IP would throttle the test)
// and LOGIN_RATE_LIMIT_MAX as default. CHURCHES (max 4: onboarding is limited to 5/hour/IP).
import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://127.0.0.1:4400';
const CHURCHES = Math.min(Number(__ENV.CHURCHES || 1), 4);
const POST_VUS = Number(__ENV.POST_VUS || 20);
const READ_VUS = Number(__ENV.READ_VUS || 20);
const DURATION = __ENV.DURATION || '30s';
// Fix RUNID to reuse the same churches across runs (onboarding is limited to 5/hour/IP/replica).
const RUN = __ENV.RUNID || `${Date.now()}`.slice(-8);
const ITER_SALT = `${Date.now()}`.slice(-6);

const postLatency = new Trend('post_entry_ms', true);
const reportLatency = new Trend('report_ms', true);
const posted = new Counter('entries_posted');

const scenarios = {};
if (POST_VUS > 0) scenarios.post_entries = { executor: 'constant-vus', vus: POST_VUS, duration: DURATION, exec: 'postEntry' };
if (READ_VUS > 0) scenarios.read_reports = { executor: 'constant-vus', vus: READ_VUS, duration: DURATION, exec: 'readReports' };

export const options = {
  scenarios,
  thresholds: { http_req_failed: ['rate<0.01'] },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max']
};

const json = { 'Content-Type': 'application/json' };

export function setup() {
  const tenants = [];
  for (let i = 0; i < CHURCHES; i += 1) {
    const slug = `lt-${RUN}-${i}`;
    const owner = { username: 'admin', email: `${slug}@load.test`, password: `load-test-pass-${i}` };
    const created = http.post(`${BASE}/churches`, JSON.stringify({ church: { name: `Load ${i}`, slug }, owner }), { headers: json });
    if (![201, 409, 429].includes(created.status)) fail(`onboarding failed: ${created.status} ${created.body}`);
    const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email: owner.email, password: owner.password }), { headers: json });
    const auth = { ...json, Authorization: `Bearer ${login.json('token')}` };
    const accounts = http.get(`${BASE}/finance/accounts`, { headers: auth }).json();
    const funds = http.get(`${BASE}/finance/funds`, { headers: auth }).json();
    tenants.push({
      auth,
      cash: accounts.find((a) => a.systemKey === 'BANK_MAIN').id,
      income: accounts.find((a) => a.systemKey === 'INCOME_TITHES').id,
      fund: funds.find((f) => f.code === 'GEN').id
    });
  }
  return { tenants };
}

const today = () => new Date().toISOString().slice(0, 10);

export function postEntry(data) {
  const t = data.tenants[(__VU - 1) % data.tenants.length];
  const amount = (1 + ((__ITER * 7) % 500)).toFixed(2);
  const body = {
    date: today(),
    memo: `load ${__VU}-${__ITER}`,
    lines: [
      { accountId: t.cash, fundId: t.fund, debit: amount },
      { accountId: t.income, fundId: t.fund, credit: amount }
    ]
  };
  const res = http.post(`${BASE}/finance/journal`, JSON.stringify(body), {
    headers: { ...t.auth, 'Idempotency-Key': `lt-${RUN}-${ITER_SALT}-${__VU}-${__ITER}` }
  });
  postLatency.add(res.timings.duration);
  if (check(res, { 'posted 201': (r) => r.status === 201 })) posted.add(1);
}

export function readReports(data) {
  const t = data.tenants[(__VU - 1) % data.tenants.length];
  const pick = __ITER % 3;
  const url = pick === 0 ? '/finance/trial-balance' : pick === 1 ? '/finance/journal?limit=50' : '/finance/funds';
  const res = http.get(`${BASE}${url}`, { headers: t.auth });
  reportLatency.add(res.timings.duration);
  check(res, { 'read 200': (r) => r.status === 200 });
}

export function teardown() {}

#!/usr/bin/env node
/**
 * Live two-tenant isolation check against a RUNNING compose stack (docker compose up -d).
 *
 *   node scripts/isolation-check.mjs
 *
 * It provisions two SACCOs through the operator CLI inside the api container, signs both in over HTTP, has A create a
 * member, savings, a loan product, a loan application and a manual journal entry, then proves B cannot see, change or
 * smuggle anything into A's data - first through the API, then in the database itself as the restricted application role
 * (hazina_app), which is what the API connects as. Exit code 0 only if every check passes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = `http://localhost:${env.API_PORT ?? 4300}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? `  - ${detail}` : ''}`); };
const compose = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });

function psql(sql, orgId) {
  const prefix = orgId ? `BEGIN; SELECT set_config('hazina.org_id', '${orgId}', true); ` : 'BEGIN; ';
  try {
    return compose('exec', '-T', '-e', `PGPASSWORD=${env.HAZINA_APP_PASSWORD}`, 'postgres', 'psql', '-U', 'hazina_app', '-d', env.POSTGRES_DB ?? 'hazina', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `${prefix}${sql}; COMMIT;`).trim();
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
async function tenant(label) {
  const phone = `07${String(10_000_000 + Math.floor(Math.random() * 80_000_000))}`;
  const out = compose('exec', '-T', 'api', 'node', 'dist/admin/cli.js', 'provision', 'sacco', `Isolation ${label} ${stamp}`, `Owner ${label}`, phone);
  const pin = /PIN (\d{6})/.exec(out)[1];
  const orgId = /organisation ([0-9a-f-]{36})/.exec(out)[1];
  const login = await http('POST', '/v1/auth/login', null, { phone, pin });
  return { orgId, token: login.body.token };
}

const A = await tenant('A');
const B = await tenant('B');
check('two organisations provisioned and signed in', Boolean(A.token && B.token && A.orgId !== B.orgId));

// A builds some data
const member = (await http('POST', '/v1/members', A.token, { fullName: `A-secret ${stamp}`, idNumber: `7${stamp}`, phone: '0712000111' })).body;
const deposit = await http('POST', '/v1/savings/deposit', A.token, { memberId: member.id, product: 'savings', amountCents: 5_000_000, channel: 'cash' });
const product = (await http('POST', '/v1/loan-products', A.token, { name: `A product ${stamp}`, method: 'reducing', annualRateBp: 1200, maxAmountCents: 10_000_000, maxTermMonths: 12 })).body;
const loan = (await http('POST', '/v1/loans', A.token, { memberId: member.id, productId: product.id, principalCents: 3_000_000, termMonths: 6 })).body;
const today = new Date().toISOString().slice(0, 10);
const journal = await http('POST', '/v1/journal', A.token, { entryDate: today, memo: `A secret entry ${stamp}`, lines: [{ accountCode: '1010', debitCents: 100_00 }, { accountCode: '3100', creditCents: 100_00 }] });
check('A has a member, savings, a loan product, a loan application and a journal entry', Boolean(member.id && deposit.status === 201 && product.id && loan.id && journal.status === 201), JSON.stringify({ d: deposit.status, l: loan.id, j: journal.body }).slice(0, 200));

// ---- through the API ----
check('B sees none of A\'s members', (await http('GET', '/v1/members', B.token)).body.items.length === 0);
check('B cannot read A\'s member', (await http('GET', `/v1/members/${member.id}`, B.token)).status === 404);
check('B cannot read A\'s savings statement', (await http('GET', `/v1/members/${member.id}/savings-statement`, B.token)).status === 404);
check('B cannot read A\'s loan', (await http('GET', `/v1/loans/${loan.id}`, B.token)).status === 404);
check('B sees none of A\'s loans or loan products', (await http('GET', '/v1/loans', B.token)).body.items.length === 0 && (await http('GET', '/v1/loan-products?all=true', B.token)).body.length === 0);
check('B cannot deposit into A\'s member', (await http('POST', '/v1/savings/deposit', B.token, { memberId: member.id, product: 'savings', amountCents: 100, channel: 'cash' })).status === 404);
check('B cannot apply for a loan for A\'s member on A\'s product', (await http('POST', '/v1/loans', B.token, { memberId: member.id, productId: product.id, principalCents: 100_000, termMonths: 3 })).status >= 400);
check('B cannot appraise or approve A\'s loan', [(await http('POST', `/v1/loans/${loan.id}/appraise`, B.token, { monthlyIncomeCents: 1, monthlyExpensesCents: 0, recommendation: 'approve' })).status, (await http('POST', `/v1/loans/${loan.id}/decision`, B.token, { approve: true })).status].every((s) => s === 404 || s === 409));
check('B cannot edit A\'s member', (await http('PATCH', `/v1/members/${member.id}`, B.token, { fullName: 'hijacked' })).status === 404);
check('B\'s journal and trial balance contain none of A\'s money', !JSON.stringify((await http('GET', '/v1/journal', B.token)).body).includes(`A secret entry ${stamp}`) && (await http('GET', '/v1/reports/trial-balance', B.token)).body.totalDebitCents === 0);
check('B cannot reverse A\'s journal entry', (await http('POST', `/v1/journal/${journal.body.id}/reverse`, B.token, { memo: 'sabotage attempt' })).status === 404);
check('a request with no token is refused', (await http('GET', '/v1/members', null)).status === 401);

// ---- in the database, as the restricted application role ----
const role = psql(`SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user`);
check('the application role cannot bypass row-level security', lastLine(role) === 'f', role.replace(/\n/g, ' '));
check('no tenant bound: nothing is visible', ['members', 'loans', 'journal_entries', 'savings_txns'].every((t) => lastLine(psql(`SELECT count(*) FROM ${t}`)) === '0'));
check('bound to A: A\'s member is visible', lastLine(psql(`SELECT count(*) FROM members WHERE full_name LIKE 'A-secret%'`, A.orgId)) === '1');
check('bound to B: A\'s member is invisible', lastLine(psql(`SELECT count(*) FROM members WHERE full_name LIKE 'A-secret%'`, B.orgId)) === '0');
check('bound to B: A\'s loans, schedules, savings and journal are invisible', ['loans', 'loan_schedule', 'savings_txns', 'journal_entries', 'journal_lines', 'loan_products'].every((t) => lastLine(psql(`SELECT count(*) FROM ${t}`, B.orgId)) === '0'));
check('bound to B: updating A\'s rows touches nothing', lastLine(psql(`UPDATE members SET full_name = 'hijacked' WHERE full_name LIKE 'A-secret%'`, B.orgId)).includes('UPDATE 0'));
check('bound to B: writing a row that belongs to A is refused by the policy', psql(`INSERT INTO members (org_id, member_no, full_name) VALUES ('${A.orgId}', 'M99999', 'smuggled')`, B.orgId).includes('row-level security'));
check('the ledger and audit trail cannot be edited even by their own tenant', ['UPDATE journal_lines SET debit_cents = 1', 'DELETE FROM journal_entries', 'UPDATE journal_entries SET memo = \'x\'', 'DELETE FROM audit_events', 'DELETE FROM savings_txns', 'DELETE FROM loans'].every((q) => psql(q, A.orgId).includes('permission denied')));

const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} isolation checks passed`);
process.exit(ok ? 0 : 1);

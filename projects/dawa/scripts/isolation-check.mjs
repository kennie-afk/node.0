#!/usr/bin/env node
/**
 * Live two-tenant isolation check against a RUNNING compose stack (docker compose up -d).
 *
 *   node scripts/isolation-check.mjs
 *
 * It provisions two pharmacies through the operator CLI inside the api container, signs both in over HTTP, has A
 * create stock, a customer and a sale, then proves B cannot see, change or smuggle anything into A's data - first
 * through the API, then in the database itself as the restricted application role (dawa_app), which is what the API
 * connects as. Exit code 0 only if every check passes.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const API = `http://localhost:${env.API_PORT ?? 4200}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  - ${detail}` : ''}`); };
const compose = (...args) => execFileSync('docker', ['compose', ...args], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });

function psql(sql, orgId) {
  const prefix = orgId ? `BEGIN; SELECT set_config('dawa.org_id', '${orgId}', true); ` : 'BEGIN; ';
  try {
    return compose('exec', '-T', '-e', `PGPASSWORD=${env.DAWA_APP_PASSWORD}`, 'postgres', 'psql', '-U', 'dawa_app', '-d', env.POSTGRES_DB ?? 'dawa', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `${prefix}${sql}; COMMIT;`).trim();
  } catch (error) {
    return `ERROR: ${(error.stderr ?? error.message).toString().trim()}`;
  }
}
const lastLine = (out) => out.split('\n').filter((l) => !/^(BEGIN|COMMIT|set_config|[0-9a-f-]{36})$/.test(l) && l.trim() !== '' && l !== 'f' && l !== 't').pop() ?? '';

async function http(method, path, token, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, body: json };
}

const stamp = Date.now().toString().slice(-7);
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
check('two organisations provisioned and signed in', Boolean(A.token && B.token && A.orgId !== B.orgId));

// A builds some data
const product = (await http('POST', '/v1/products', A.token, { name: `A-secret ${stamp}`, listPriceCents: 10000, category: 'otc' })).body;
const supplier = (await http('POST', '/v1/suppliers', A.token, { name: `A supplier ${stamp}` })).body;
const expiry = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
const received = await http('POST', '/v1/stock/receive', A.token, { supplierId: supplier.id, invoiceNumber: `ISO-${stamp}`, invoiceDate: new Date().toISOString().slice(0, 10), lines: [{ productId: product.id, batchNo: 'ISO1', expiryDate: expiry, qty: 10, unitCostCents: 5000 }] });
check('A received stock', received.status === 201, received.status === 201 ? '' : JSON.stringify(received.body));
const customer = (await http('POST', '/v1/customers', A.token, { name: 'A customer' })).body;
const sale = (await http('POST', '/v1/sales', A.token, { lines: [{ productId: product.id, qty: 1 }], payments: [{ method: 'cash', amountCents: 10000 }] })).body;
check('A has a product, stock, a customer and a sale', Boolean(product.id && customer.id && sale.saleId), sale.number ?? JSON.stringify(sale).slice(0, 80));

// ---- through the API ----
check('B sees none of A\'s products', (await http('GET', '/v1/products', B.token)).body.items.length === 0);
check('B cannot read A\'s sale', (await http('GET', `/v1/sales/${sale.saleId}`, B.token)).status === 404);
check('B cannot read A\'s customer statement', (await http('GET', `/v1/customers/${customer.id}/statement`, B.token)).status === 404);
check('B cannot void A\'s sale', (await http('POST', `/v1/sales/${sale.saleId}/void`, B.token, { reason: 'sabotage' })).status === 404);
check('B cannot sell A\'s product', (await http('POST', '/v1/sales', B.token, { lines: [{ productId: product.id, qty: 1 }], payments: [] })).status === 404);
check('B cannot edit A\'s product', (await http('PATCH', `/v1/products/${product.id}`, B.token, { name: 'hijacked' })).status === 404);
check('a request with no token is refused', (await http('GET', '/v1/products', null)).status === 401);

// ---- in the database, as the restricted application role ----
const role = psql(`SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user`);
check('the application role cannot bypass row-level security', lastLine(role) === 'f' || role.includes('f'), role.replace(/\n/g, ' '));
check('no tenant bound: nothing is visible', lastLine(psql('SELECT count(*) FROM products')) === '0');
check('bound to A: A\'s product is visible', lastLine(psql(`SELECT count(*) FROM products WHERE name LIKE 'A-secret%'`, A.orgId)) === '1');
check('bound to B: A\'s product is invisible', lastLine(psql(`SELECT count(*) FROM products WHERE name LIKE 'A-secret%'`, B.orgId)) === '0');
check('bound to B: A\'s stock, sales and customers are invisible', ['stock_batches', 'sales', 'sale_lines', 'customers', 'stock_movements'].every((t) => lastLine(psql(`SELECT count(*) FROM ${t}`, B.orgId)) === '0'));
check('bound to B: updating A\'s rows touches nothing', lastLine(psql(`UPDATE products SET name = 'hijacked' WHERE name LIKE 'A-secret%'`, B.orgId)).includes('UPDATE 0'));
check('bound to B: writing a row that belongs to A is refused by the policy', psql(`INSERT INTO suppliers (org_id, name) VALUES ('${A.orgId}', 'smuggled')`, B.orgId).includes('row-level security'));
check('stock and money history cannot be edited even by their own tenant', ['UPDATE stock_movements SET qty_delta = 1', 'DELETE FROM sale_payments', 'UPDATE dispensing_records SET patient_name = \'x\'', 'DELETE FROM audit_events'].every((q) => psql(q, A.orgId).includes('permission denied')));

const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} isolation checks passed`);
process.exit(ok ? 0 : 1);

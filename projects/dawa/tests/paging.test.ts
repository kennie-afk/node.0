import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, dayOffset, get, makeProduct, makeSupplier, newTenant, nextPhone, on, patch, post, put, receive, sell, shutdown, Tenant } from './helpers';

vi.setConfig({ testTimeout: 120_000 });
afterAll(shutdown);

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'x';
const rxLine = (productId: string, patientName: string) => ({ productId, qty: 1, dispensing: { patientName, patientAgeYears: 40, patientSex: 'male', prescriberName: 'Dr Kamau', prescriberRegNo: 'K1', prescriptionRef: 'RX', directions: 'daily' } });

/** Walks a list two rows at a time and checks every boundary: full pages say hasMore, the last says next=null, nothing repeats or goes missing. */
async function walk(auth: { Authorization: string }, path: string, expectedTotal: number, pick: (item: any) => string, itemsOf: (body: any) => any[] = (b) => b.items) {
  const sep = path.includes('?') ? '&' : '?';
  const seen: string[] = [];
  let offset = 0;
  const sizes: number[] = [];
  for (let guard = 0; guard < 20; guard += 1) {
    const res = await get(auth, `${path}${sep}limit=2&offset=${offset}`);
    expect(res.status, path).toBe(200);
    const items = itemsOf(res.body);
    sizes.push(items.length);
    seen.push(...items.map(pick));
    expect(res.body.hasMore, `${path} offset ${offset}`).toBe(offset + 2 < expectedTotal);
    if (!res.body.hasMore) {
      expect(res.body.next).toBeNull();
      break;
    }
    expect(res.body.next).toBe(offset + 2);
    offset = res.body.next;
  }
  expect(seen).toHaveLength(expectedTotal);
  expect(new Set(seen).size).toBe(expectedTotal);
  // and exactly one page that is exactly full: no phantom "more"
  const whole = await get(auth, `${path}${sep}limit=${expectedTotal}`);
  expect(whole.body.hasMore).toBe(false);
  expect(whole.body.next).toBeNull();
  expect(itemsOf(whole.body)).toHaveLength(expectedTotal);
  return sizes;
}

async function seedBranchWithTill(t: Tenant): Promise<string> {
  const till = String(Math.floor(Math.random() * 8_000_000) + 1_000_000);
  expect((await patch(t.owner.auth, `/v1/branches/${t.branchId}`, { tillNumber: till })).status).toBe(200);
  return till;
}

describe.runIf(on)('every list pages, says whether there is more, and never silently stops (real Postgres, RLS on)', () => {
  it('pages products, suppliers, customers, stock, batches, sales, payables, price-list items and purchase orders at their boundaries', async () => {
    await boot();
    const t = await newTenant('Paging Chemist');
    const manager = await addStaff(t, 'manager');
    const products: string[] = [];
    for (let i = 0; i < 5; i += 1) products.push(await makeProduct(t.owner.auth, { name: `Pageable ${i}` }));
    const suppliers: string[] = [];
    for (let i = 0; i < 5; i += 1) suppliers.push(await makeSupplier(t.owner.auth));
    for (let i = 0; i < 5; i += 1) expect((await post(t.owner.auth, '/v1/customers', { name: `Customer ${i}` })).status).toBe(201);
    for (let i = 0; i < 5; i += 1) {
      const rec = await post(t.owner.auth, '/v1/stock/receive', { supplierId: suppliers[0], invoiceNumber: `PG-${i}`, invoiceDate: dayOffset(0), lines: [{ productId: products[i], batchNo: `PB${i}`, expiryDate: dayOffset(300), qty: 5, unitCostCents: 1000 }] });
      expect(rec.status).toBe(201);
    }
    for (let i = 0; i < 5; i += 1) expect((await sell(t.owner.auth, { lines: [{ productId: products[i], qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] })).status).toBe(201);

    expect(await walk(t.owner.auth, '/v1/products', 5, (p) => p.id)).toEqual([2, 2, 1]);
    await walk(t.owner.auth, '/v1/suppliers', 5, (s) => s.id);
    await walk(t.owner.auth, '/v1/customers', 5, (c) => c.id);
    await walk(t.owner.auth, '/v1/stock', 5, (s) => s.productId);
    await walk(t.owner.auth, '/v1/stock/batches', 5, (b) => b.id);
    await walk(t.owner.auth, '/v1/sales', 5, (s) => s.id);
    await walk(manager.auth, '/v1/payables', 5, (i) => i.id);

    // payables totals cover every invoice, not just the page on screen
    const page = (await get(manager.auth, '/v1/payables?limit=2')).body;
    expect(page.items).toHaveLength(2);
    expect(page.outstandingCents).toBe(5 * 5 * 1000);
    // and "open only" is applied before the page is cut, not after
    expect((await get(manager.auth, '/v1/payables?open=true&limit=3')).body.items).toHaveLength(3);

    const list = (await post(t.owner.auth, '/v1/price-lists', { name: 'Staff' })).body;
    for (const p of products) expect((await put(t.owner.auth, `/v1/price-lists/${list.id}/items`, { productId: p, priceCents: 4000 })).status).toBe(200);
    await walk(t.owner.auth, `/v1/price-lists/${list.id}/items`, 5, (i) => i.productId);
    expect((await get(t.owner.auth, '/v1/price-lists')).body[0]).toMatchObject({ name: 'Staff', itemCount: 5 });

    for (let i = 0; i < 5; i += 1) expect((await post(t.owner.auth, '/v1/purchase-orders', { supplierId: suppliers[0], lines: [{ productId: products[i], qty: 1 }] })).status).toBe(201);
    await walk(t.owner.auth, '/v1/purchase-orders', 5, (o) => o.id);

    // a page can never be asked to be larger than the cap
    expect((await get(t.owner.auth, '/v1/products?limit=100000')).body.items.length).toBeLessThanOrEqual(200);
  });

  it('pages the dispensing log, the controlled register (by entry number) and a customer statement', async () => {
    await boot();
    const t = await newTenant('Paging Rx');
    const ph1 = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const rx = await makeProduct(t.owner.auth, { category: 'prescription' });
    const cd = await makeProduct(t.owner.auth, { category: 'controlled' });
    await receive(t.owner.auth, rx, [{ batchNo: 'RX1', expiryDate: dayOffset(300), qty: 50 }]);
    for (let i = 0; i < 5; i += 1) expect((await sell(ph1.auth, { lines: [rxLine(rx, `Patient ${i}`)], payments: [{ method: 'cash', amountCents: 5000 }] })).status).toBe(201);
    await walk(ph1.auth, '/v1/dispensing', 5, (d) => d.id);

    for (let i = 0; i < 5; i += 1) {
      const r = await receive(ph1.auth, cd, [{ batchNo: `CB${i}`, expiryDate: dayOffset(300), qty: 3 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
      expect(r.status).toBe(201);
    }
    // the register pages by entry number: the cursor is the last entry seen, and it is stable while new entries arrive
    const first = (await get(ph1.auth, '/v1/controlled/register?limit=2')).body;
    expect(first.entries).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.balances).toHaveLength(1);
    const second = (await get(ph1.auth, `/v1/controlled/register?limit=2&before=${first.next}`)).body;
    expect(second.entries.map((e: any) => e.id)).not.toContain(first.entries[1].id);
    expect(Number(second.entries[0].id)).toBeLessThan(Number(first.entries[1].id));
    const last = (await get(ph1.auth, `/v1/controlled/register?limit=2&before=${second.next}`)).body;
    expect(last.entries).toHaveLength(1);
    expect(last.hasMore).toBe(false);
    expect(last.next).toBeNull();
    const all = (await get(ph1.auth, '/v1/controlled/register?limit=5')).body;
    expect(all.entries).toHaveLength(5);
    expect(all.hasMore).toBe(false);

    const cust = (await post(t.owner.auth, '/v1/customers', { name: 'Ledger Customer', creditLimitCents: 1_000_000 })).body;
    const otc = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, otc, [{ batchNo: 'OT1', expiryDate: dayOffset(300), qty: 50 }]);
    for (let i = 0; i < 5; i += 1) expect((await sell(t.owner.auth, { customerId: cust.id, lines: [{ productId: otc, qty: 1 }], payments: [{ method: 'credit', amountCents: 5000 }] })).status).toBe(201);
    const s1 = (await get(t.owner.auth, `/v1/customers/${cust.id}/statement?limit=2`)).body;
    expect(s1.entries).toHaveLength(2);
    expect(s1.hasMore).toBe(true);
    expect(s1.balanceCents).toBe(25000); // the balance is the whole ledger, not the page
    const s3 = (await get(t.owner.auth, `/v1/customers/${cust.id}/statement?limit=2&before=${(await get(t.owner.auth, `/v1/customers/${cust.id}/statement?limit=2&before=${s1.next}`)).body.next}`)).body;
    expect(s3.entries).toHaveLength(1);
    expect(s3.hasMore).toBe(false);
  });

  it('pages the M-Pesa payments waiting to be matched, with a total for the badge', async () => {
    await boot();
    const t = await newTenant('Paging Unmatched');
    const till = await seedBranchWithTill(t);
    const run = Date.now().toString(36).toUpperCase();
    for (let i = 0; i < 5; i += 1) {
      const res = await request((await boot()).app).post(`/v1/mpesa/${SECRET}/confirmation`).send({ TransID: `PGU${run}${i}`, TransTime: new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14), TransAmount: 100 + i, BusinessShortCode: till, BillRefNumber: 'NONE', MSISDN: '254711000222' });
      expect(res.status).toBe(200);
    }
    await walk(t.owner.auth, '/v1/mpesa/unmatched', 5, (u) => u.externalRef);
    expect((await get(t.owner.auth, '/v1/mpesa/unmatched?limit=1')).body.total).toBe(5);
  });
});

describe.runIf(on)('searching treats % _ and \\ as the characters they are, and the export is never cut short (real Postgres, RLS on)', () => {
  it('does not let % or _ match everything in any search box', async () => {
    await boot();
    const t = await newTenant('Wildcard Chemist');
    const ph = await addStaff(t, 'pharmacist');
    const plain = await makeProduct(t.owner.auth, { name: 'Panadol 500mg', category: 'prescription' });
    const pct = await makeProduct(t.owner.auth, { name: 'Vitamin C 50% syrup' });
    await makeProduct(t.owner.auth, { name: 'Under_score tonic' });
    await receive(t.owner.auth, plain, [{ batchNo: 'W1', expiryDate: dayOffset(300), qty: 5 }]);
    await receive(t.owner.auth, pct, [{ batchNo: 'W2', expiryDate: dayOffset(300), qty: 5 }]);
    await post(t.owner.auth, '/v1/customers', { name: 'Wanjiru', phone: '0712345678' });
    await post(t.owner.auth, '/v1/customers', { name: 'Back\\slash Ltd' });
    await sell(ph.auth, { lines: [rxLine(plain, 'Achieng Otieno')], payments: [{ method: 'cash', amountCents: 5000 }] });

    const names = async (path: string, key = 'name') => (await get(t.owner.auth, path)).body.items.map((i: any) => i[key]);
    // products
    expect(await names('/v1/products?search=%25')).toEqual(['Vitamin C 50% syrup']); // only the product that really has a percent sign
    expect(await names('/v1/products?search=50%25')).toEqual(['Vitamin C 50% syrup']);
    expect(await names('/v1/products?search=_')).toEqual(['Under_score tonic']);
    expect(await names('/v1/products?search=Pan_dol')).toEqual([]); // _ is not "any one character"
    expect(await names('/v1/products?search=panadol')).toEqual(['Panadol 500mg']);
    // stock list
    expect(await names('/v1/stock?search=%25', 'name')).toEqual(['Vitamin C 50% syrup']);
    expect(await names('/v1/stock?search=Pan_dol', 'name')).toEqual([]);
    // customers (name or phone), including a backslash
    expect(await names('/v1/customers?search=%25')).toEqual([]);
    expect(await names('/v1/customers?search=_')).toEqual([]);
    expect(await names('/v1/customers?search=%5C')).toEqual(['Back\\slash Ltd']);
    expect(await names('/v1/customers?search=254712')).toEqual(['Wanjiru']);
    // dispensing log by patient
    expect((await get(ph.auth, '/v1/dispensing?patient=%25')).body.items).toHaveLength(0);
    expect((await get(ph.auth, '/v1/dispensing?patient=Achi_ng')).body.items).toHaveLength(0);
    expect((await get(ph.auth, '/v1/dispensing?patient=achieng')).body.items).toHaveLength(1);
    // sales by number
    expect((await get(t.owner.auth, '/v1/sales?q=%25')).body.items).toHaveLength(0);
    expect((await get(t.owner.auth, '/v1/sales?q=-')).body.items.length).toBeGreaterThan(0);
  });

  it('exports every dispensing record, however many, in one file', async () => {
    await boot();
    const t = await newTenant('Big Export');
    const ph = await addStaff(t, 'pharmacist');
    const rx = await makeProduct(t.owner.auth, { category: 'prescription' });
    await receive(t.owner.auth, rx, [{ batchNo: 'BE1', expiryDate: dayOffset(300), qty: 5 }]);
    expect((await sell(ph.auth, { lines: [rxLine(rx, 'Seed Patient')], payments: [{ method: 'cash', amountCents: 5000 }] })).status).toBe(201);
    const { pool } = await boot();
    const EXTRA = 5200; // past the 5000 the export used to stop at
    await pool.withOrg(t.orgId, (c) => c.query(
      `INSERT INTO dispensing_records (org_id, branch_id, sale_id, sale_line_id, product_id, qty, patient_name, prescriber_name, dispensed_by, dispensed_at)
       SELECT d.org_id, d.branch_id, d.sale_id, d.sale_line_id, d.product_id, d.qty, 'Bulk ' || g, d.prescriber_name, d.dispensed_by, now() - (g || ' seconds')::interval
         FROM dispensing_records d, generate_series(1, $1::int) g`, [EXTRA]));

    const res = await request((await boot()).app).get('/v1/dispensing/export.csv').set(ph.auth).buffer(true).parse((r, cb) => { let d = ''; r.setEncoding('utf8'); r.on('data', (c) => (d += c)); r.on('end', () => cb(null, d)); });
    expect(res.status).toBe(200);
    const lines = String(res.body).split('\n').filter(Boolean);
    expect(lines).toHaveLength(1 + 1 + EXTRA); // header + the real record + every bulk row
    expect(lines[0]).toContain('patient');
    expect(lines.filter((l) => l.includes('Seed Patient'))).toHaveLength(1);
    // a cashier still gets a clean refusal, not a half-started file
    const cashier = await addStaff(t, 'cashier');
    expect((await get(cashier.auth, '/v1/dispensing/export.csv')).status).toBe(403);
    // the JSON list is capped per page and says there is more
    const page = (await get(ph.auth, '/v1/dispensing?limit=100000')).body;
    expect(page.items).toHaveLength(500);
    expect(page.hasMore).toBe(true);
  });
});

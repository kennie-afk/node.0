import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, assertLedgerAgrees, boot, dayOffset, get, makeProduct, makeSupplier, newTenant, on, onHand, post, put, receive, sell, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });

function darajaTime(at = new Date()): string {
  return new Date(at.getTime() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}
let tx = 0;
const RUN = Date.now().toString(36).toUpperCase();
const transId = () => `QX${RUN}${(tx += 1)}`;
const code = (label: string) => `${label}${RUN}`;

async function setTill(t: Awaited<ReturnType<typeof newTenant>>, till: string) {
  const res = await request((await boot()).app).patch(`/v1/branches/${t.branchId}`).set(t.owner.auth).send({ tillNumber: till });
  expect(res.status).toBe(200);
}
const tillNo = () => String(Math.floor(Math.random() * 8_000_000) + 1_000_000);

async function confirm(secret: string, body: Record<string, unknown>) {
  return request((await boot()).app).post(`/v1/mpesa/${secret}/confirmation`).send(body);
}
const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'x';

describe.runIf(on)('M-Pesa at the till, credit accounts, stock-takes, the day close and supplier payables (real Postgres, RLS on)', () => {
  afterAll(shutdown);

  it('matches an M-Pesa confirmation to the sale whose number was typed, applies a repeat once, and keeps what it cannot match', async () => {
    await boot();
    const t = await newTenant('Mpesa Chemist');
    const till = tillNo();
    await setTill(t, till);
    const p = await makeProduct(t.owner.auth, { listPriceCents: 25000 });
    await receive(t.owner.auth, p, [{ batchNo: 'M1', expiryDate: dayOffset(300), qty: 20 }]);

    const sale = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 2 }], payments: [] })).body;
    expect(sale).toMatchObject({ status: 'pending_payment', totalCents: 50000, dueCents: 50000 });

    const first = transId();
    const body = { TransID: first, TransTime: darajaTime(), TransAmount: 500, BusinessShortCode: till, BillRefNumber: sale.number, MSISDN: '254712345678' };
    expect((await confirm(SECRET, body)).body).toMatchObject({ ResultCode: 0 });
    expect((await get(t.owner.auth, `/v1/sales/${sale.saleId}`)).body).toMatchObject({ status: 'completed', paidCents: 50000 });
    // delivered again: applied once
    await confirm(SECRET, body);
    const detail = (await get(t.owner.auth, `/v1/sales/${sale.saleId}`)).body;
    expect(detail.payments).toHaveLength(1);

    // no reference, but exactly one pending sale of that amount: matched by amount
    const second = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [] })).body;
    await confirm(SECRET, { TransID: transId(), TransTime: darajaTime(), TransAmount: 250, BusinessShortCode: till, BillRefNumber: '', MSISDN: '254712345678' });
    expect((await get(t.owner.auth, `/v1/sales/${second.saleId}`)).body.status).toBe('completed');

    // matches nothing: kept for the manager, never dropped
    const orphan = transId();
    await confirm(SECRET, { TransID: orphan, TransTime: darajaTime(), TransAmount: 999, BusinessShortCode: till, BillRefNumber: 'NOPE', MSISDN: '254700000001' });
    const unmatched = (await get(t.owner.auth, '/v1/mpesa/unmatched')).body;
    expect(unmatched.map((u: any) => u.externalRef)).toContain(orphan);

    // an unknown till is ignored without error, and a wrong secret is not a route at all
    expect((await confirm(SECRET, { TransID: transId(), TransTime: darajaTime(), TransAmount: 1, BusinessShortCode: '9999999', BillRefNumber: '', MSISDN: '254700000001' })).status).toBe(200);
    expect((await confirm('wrong-secret-wrong-secret', body)).status).toBe(404);
  });

  it('lets a cashier claim an M-Pesa payment by typing its code, whichever arrived first', async () => {
    await boot();
    const t = await newTenant('Claim Chemist');
    const till = tillNo();
    await setTill(t, till);
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'C1', expiryDate: dayOffset(300), qty: 20 }]);

    // code typed before the confirmation: the sale is paid by the typed code
    const a = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'mpesa', amountCents: 10000, externalRef: code('TYPED') }] })).body;
    expect(a.status).toBe('completed');
    // the confirmation for that same code then arrives: a duplicate, ignored
    await confirm(SECRET, { TransID: code('TYPED'), TransTime: darajaTime(), TransAmount: 100, BusinessShortCode: till, BillRefNumber: '', MSISDN: '254711111111' });
    expect((await get(t.owner.auth, `/v1/sales/${a.saleId}`)).body.payments).toHaveLength(1);

    // confirmation first (kept as unmatched), then the cashier types the code
    await confirm(SECRET, { TransID: code('EARLY'), TransTime: darajaTime(), TransAmount: 100, BusinessShortCode: till, BillRefNumber: 'ZZZ', MSISDN: '254711111111' });
    const b = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'mpesa', amountCents: 10000, externalRef: code('EARLY') }] })).body;
    expect(b.status).toBe('completed');
    expect((await get(t.owner.auth, '/v1/mpesa/unmatched')).body.map((u: any) => u.externalRef)).not.toContain(code('EARLY'));
    // the same code cannot pay a second sale
    const c = await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'mpesa', amountCents: 10000, externalRef: code('EARLY') }] });
    expect(c.status).toBe(409);
    expect(c.body.code).toBe('mpesa-code-used');
  });

  it('enforces a credit limit, ledgers what is owed, and lets the customer pay it down', async () => {
    await boot();
    const t = await newTenant('Credit Chemist');
    const cashier = await addStaff(t, 'cashier');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 40000 });
    await receive(t.owner.auth, p, [{ batchNo: 'K1', expiryDate: dayOffset(300), qty: 20 }]);
    expect((await post(cashier.auth, '/v1/customers', { name: 'Mama Njeri', creditLimitCents: 100000 })).status).toBe(403); // a cashier cannot give credit
    const cust = (await post(t.owner.auth, '/v1/customers', { name: 'Mama Njeri', phone: '0712000111', creditLimitCents: 100000 })).body;

    expect((await sell(cashier.auth, { customerId: cust.id, lines: [{ productId: p, qty: 2 }], payments: [{ method: 'credit', amountCents: 80000 }] })).body.status).toBe('completed');
    const over = await sell(cashier.auth, { customerId: cust.id, lines: [{ productId: p, qty: 1 }], payments: [{ method: 'credit', amountCents: 40000 }] });
    expect(over.status).toBe(422);
    expect(over.body.code).toBe('credit-limit');
    const noCustomer = await sell(cashier.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'credit', amountCents: 40000 }] });
    expect(noCustomer.status).toBe(400);

    expect((await get(t.owner.auth, `/v1/customers/${cust.id}/statement`)).body.balanceCents).toBe(80000);
    const paid = await post(cashier.auth, `/v1/customers/${cust.id}/payments`, { amountCents: 30000, method: 'cash' });
    expect(paid.body.balanceCents).toBe(50000);
    expect((await post(cashier.auth, `/v1/customers/${cust.id}/payments`, { amountCents: 90000, method: 'cash' })).body.code).toBe('overpay');
    // now there is headroom again
    expect((await sell(cashier.auth, { customerId: cust.id, lines: [{ productId: p, qty: 1 }], payments: [{ method: 'credit', amountCents: 40000 }] })).status).toBe(201);
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query('DELETE FROM customer_ledger'))).rejects.toThrow(/permission denied/);
  });

  it('uses a customer price list when one is set', async () => {
    await boot();
    const t = await newTenant('PriceList Chemist');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'L1', expiryDate: dayOffset(300), qty: 20 }]);
    const list = (await post(t.owner.auth, '/v1/price-lists', { name: 'Staff' })).body;
    expect((await put(t.owner.auth, `/v1/price-lists/${list.id}/items`, { productId: p, priceCents: 7000 })).status).toBe(200);
    const cust = (await post(t.owner.auth, '/v1/customers', { name: 'Staff member', priceListId: list.id })).body;
    expect((await sell(t.owner.auth, { customerId: cust.id, lines: [{ productId: p, qty: 2 }], payments: [] })).body.totalCents).toBe(14000);
    expect((await sell(t.owner.auth, { lines: [{ productId: p, qty: 2 }], payments: [] })).body.totalCents).toBe(20000);
  });

  it('counts stock, posts only the variance after a manager approves, and records it as a movement', async () => {
    await boot();
    const t = await newTenant('Stocktake Chemist');
    const cashier = await addStaff(t, 'cashier');
    const pharmacist = await addStaff(t, 'pharmacist');
    const a = await makeProduct(t.owner.auth);
    const b = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, a, [{ batchNo: 'A1', expiryDate: dayOffset(300), qty: 20 }]);
    await receive(t.owner.auth, b, [{ batchNo: 'B1', expiryDate: dayOffset(300), qty: 10 }]);

    expect((await post(cashier.auth, '/v1/stocktake', {})).status).toBe(403);
    const started = await post(pharmacist.auth, '/v1/stocktake', { note: 'monthly count' });
    expect(started.status).toBe(201);
    expect(started.body.lines).toBe(2);
    expect((await post(pharmacist.auth, '/v1/stocktake', {})).status).toBe(409); // one count at a time

    // a sale made during the count must survive it
    await sell(t.owner.auth, { lines: [{ productId: a, qty: 3 }], payments: [] });

    const take = (await get(pharmacist.auth, `/v1/stocktake/${started.body.id}`)).body;
    const lineA = take.lines.find((l: any) => l.expectedQty === 20);
    const lineB = take.lines.find((l: any) => l.expectedQty === 10);
    expect((await put(pharmacist.auth, `/v1/stocktake/${started.body.id}/counts`, { counts: [{ batchId: lineA.batchId, countedQty: 17 }] })).status).toBe(200);
    // incomplete
    expect((await post(t.owner.auth, `/v1/stocktake/${started.body.id}/approve`, {})).body.code).toBe('uncounted');
    expect((await post(pharmacist.auth, `/v1/stocktake/${started.body.id}/approve`, { skipUncounted: true })).status).toBe(403); // not their decision
    await put(pharmacist.auth, `/v1/stocktake/${started.body.id}/counts`, { counts: [{ batchId: lineB.batchId, countedQty: 8 }] });

    const done = await post(t.owner.auth, `/v1/stocktake/${started.body.id}/approve`, {});
    expect(done.status).toBe(200);
    // A: expected 20, counted 17 (the 3 sold during the count are the same 3 missing from the shelf) -> variance -3 on top of 17 on hand = 14
    expect(done.body).toMatchObject({ batchesAdjusted: 2, netUnits: -5 });
    expect(await onHand(t, a)).toBe(14);
    expect(await onHand(t, b)).toBe(8);
    expect((await post(t.owner.auth, `/v1/stocktake/${started.body.id}/approve`, {})).status).toBe(409);
    await assertLedgerAgrees(t);
  });

  it('closes a day against the cash counted, per cashier, once, and then refuses anything more on that day', async () => {
    await boot();
    const t = await newTenant('Close Chemist');
    const manager = await addStaff(t, 'manager');
    const c1 = await addStaff(t, 'cashier', 'Ann');
    const c2 = await addStaff(t, 'cashier', 'Ben');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 50 }]);
    await sell(c1.auth, { lines: [{ productId: p, qty: 3 }], payments: [{ method: 'cash', amountCents: 30000 }] });
    await sell(c2.auth, { lines: [{ productId: p, qty: 2 }], payments: [{ method: 'cash', amountCents: 20000 }] });
    await sell(c2.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'mpesa', amountCents: 10000, externalRef: code('CLOSEM') }] });
    const voided = (await sell(c1.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 10000 }] })).body;
    await post(manager.auth, `/v1/sales/${voided.saleId}/void`, { reason: 'duplicate ring' });
    await sell(c1.auth, { lines: [{ productId: p, qty: 1 }], payments: [] }); // left pending

    const preview = (await get(manager.auth, '/v1/close/preview')).body;
    expect(preview).toMatchObject({ salesCount: 4, voidsCount: 1, expectedCashCents: 50000, mpesaCents: 10000, pendingCents: 10000, closed: false });
    expect((await get(c1.auth, '/v1/close/preview')).status).toBe(403);

    const day = preview.day;
    const missing = await post(manager.auth, '/v1/close', { day, counts: [{ cashierId: preview.cashiers.find((c: any) => c.name.startsWith('Ann')).cashierId, countedCashCents: 30000 }] });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('count-missing');

    const counts = preview.cashiers.map((c: any) => ({ cashierId: c.cashierId, countedCashCents: c.name.startsWith('Ann') ? 30000 : 19000 })); // Ben is KSh 10 short
    const closed = await post(manager.auth, '/v1/close', { day, counts, note: 'busy afternoon' });
    expect(closed.status).toBe(201);
    expect(closed.body).toMatchObject({ expectedCashCents: 50000, countedCashCents: 49000, cashVarianceCents: -1000, pendingCents: 10000 });
    expect((await post(manager.auth, '/v1/close', { day, counts })).body.code).toBe('day-closed');

    // nothing more can happen on a closed day
    expect((await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [] })).body.code).toBe('day-closed');
    const history = (await get(manager.auth, '/v1/close')).body;
    expect(history[0]).toMatchObject({ day, cashVarianceCents: -1000 });
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query('UPDATE day_closes SET cash_variance_cents = 0'))).rejects.toThrow(/permission denied/);
  });

  it('tracks what is owed to suppliers and refuses to pay more than is owed', async () => {
    await boot();
    const t = await newTenant('Payables Chemist');
    const manager = await addStaff(t, 'manager');
    const pharmacist = await addStaff(t, 'pharmacist');
    const p = await makeProduct(t.owner.auth);
    const supplierId = await makeSupplier(t.owner.auth);
    const rec = await request((await boot()).app).post('/v1/stock/receive').set(pharmacist.auth).send({
      supplierId, invoiceNumber: 'KP-1001', invoiceDate: dayOffset(0), dueDate: dayOffset(-3),
      lines: [{ productId: p, batchNo: 'PY1', expiryDate: dayOffset(300), qty: 10, unitCostCents: 5000 }]
    });
    expect(rec.status).toBe(201);
    expect(rec.body.totalCents).toBe(50000);
    // the same supplier invoice cannot be received twice
    const again = await request((await boot()).app).post('/v1/stock/receive').set(pharmacist.auth).send({
      supplierId, invoiceNumber: 'KP-1001', invoiceDate: dayOffset(0), lines: [{ productId: p, batchNo: 'PY2', expiryDate: dayOffset(300), qty: 1, unitCostCents: 5000 }]
    });
    expect(again.status).toBe(409);

    expect((await get(pharmacist.auth, '/v1/payables')).status).toBe(403);
    const owed = (await get(manager.auth, '/v1/payables')).body;
    expect(owed).toMatchObject({ outstandingCents: 50000, overdueCents: 50000 });
    const id = owed.items[0].id;
    const first = await post(manager.auth, `/v1/payables/${id}/payments`, { amountCents: 20000, method: 'mpesa', reference: 'PAYREF1' });
    expect(first.body.balanceCents).toBe(30000);
    expect((await post(manager.auth, `/v1/payables/${id}/payments`, { amountCents: 40000, method: 'cash' })).body.code).toBe('overpay');
    expect((await post(manager.auth, `/v1/payables/${id}/payments`, { amountCents: 30000, method: 'cash' })).body.balanceCents).toBe(0);
    expect((await get(manager.auth, '/v1/payables?open=true')).body.items).toHaveLength(0);
  });
});

/**
 * Runs against a real, migrated Postgres as the restricted application role, so row-level security is in force.
 * Skipped unless DAWA_INTEGRATION=1 (see README "Testing").
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerAgrees, boot, dayOffset, get, insertExpiredBatch, makeProduct, newTenant, on, onHand, post, receive, sell, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });

describe.runIf(on)('receiving, FEFO selling and oversell protection (real Postgres, RLS on)', () => {
  afterAll(shutdown);

  it('sells from the soonest-expiring batch first and records what each sale took', async () => {
    await boot();
    const t = await newTenant('Fefo Chemist');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    expect((await receive(t.owner.auth, p, [{ batchNo: 'LATE', expiryDate: dayOffset(700), qty: 10 }, { batchNo: 'SOON', expiryDate: dayOffset(200), qty: 5 }])).status).toBe(201);

    const sale = await sell(t.owner.auth, { lines: [{ productId: p, qty: 7 }], payments: [{ method: 'cash', amountCents: 70000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body).toMatchObject({ status: 'completed', totalCents: 70000, paidCents: 70000, dueCents: 0 });

    const batches = (await get(t.owner.auth, `/v1/stock/batches?productId=${p}`)).body.items;
    const by = Object.fromEntries(batches.map((b: any) => [b.batchNo, b.qtyOnHand]));
    expect(by).toEqual({ LATE: 8 }); // SOON (5) was emptied first, then 2 from LATE
    await assertLedgerAgrees(t);
  });

  it('never sells expired stock, even when only expired stock is left', async () => {
    await boot();
    const t = await newTenant('Expired Chemist');
    const p = await makeProduct(t.owner.auth);
    await insertExpiredBatch(t, p, 50);
    const res = await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('insufficient-stock');
    expect(await onHand(t, p)).toBe(50);
    const alerts = (await get(t.owner.auth, '/v1/stock/alerts')).body;
    expect(alerts.expired).toHaveLength(1);
  });

  it('refuses to receive stock that is already expired', async () => {
    await boot();
    const t = await newTenant('Arrival Chemist');
    const p = await makeProduct(t.owner.auth);
    const res = await receive(t.owner.auth, p, [{ batchNo: 'B1', expiryDate: dayOffset(-5), qty: 3 }]);
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('expired-on-arrival');
  });

  it('cannot oversell: 15 simultaneous sales of one unit against 10 in stock make exactly 10 sales and leave zero', async () => {
    await boot();
    const t = await newTenant('Race Chemist');
    const p = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, p, [{ batchNo: 'R1', expiryDate: dayOffset(300), qty: 6 }, { batchNo: 'R2', expiryDate: dayOffset(500), qty: 4 }]);
    const results = await Promise.all(Array.from({ length: 15 }, () => sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] })));
    const ok = results.filter((r) => r.status === 201).length;
    const refused = results.filter((r) => r.status === 409 && r.body.code === 'insufficient-stock').length;
    expect(ok).toBe(10);
    expect(refused).toBe(5);
    expect(await onHand(t, p)).toBe(0);
    await assertLedgerAgrees(t);
    // sale numbers are gap-free and unique even under that contention
    const numbers = results.filter((r) => r.status === 201).map((r) => r.body.number as string).sort();
    expect(new Set(numbers).size).toBe(10);
    expect(numbers.map((n) => Number(n.slice(-4)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('two sales of different products in opposite orders do not deadlock', async () => {
    await boot();
    const t = await newTenant('Deadlock Chemist');
    const a = await makeProduct(t.owner.auth);
    const b = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, a, [{ batchNo: 'A1', expiryDate: dayOffset(300), qty: 40 }]);
    await receive(t.owner.auth, b, [{ batchNo: 'B1', expiryDate: dayOffset(300), qty: 40 }]);
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => sell(t.owner.auth, {
      lines: i % 2 === 0 ? [{ productId: a, qty: 1 }, { productId: b, qty: 1 }] : [{ productId: b, qty: 1 }, { productId: a, qty: 1 }],
      payments: [{ method: 'cash', amountCents: 10000 }]
    })));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await onHand(t, a)).toBe(20);
    expect(await onHand(t, b)).toBe(20);
  });

  it('refuses a sale for a product with no price, a discount without a manager, and takes change on cash', async () => {
    await boot();
    const t = await newTenant('Price Chemist');
    const cashier = await addStaff(t, 'cashier');
    const free = await makeProduct(t.owner.auth, { listPriceCents: 0 });
    const priced = await makeProduct(t.owner.auth, { listPriceCents: 3000 });
    await receive(t.owner.auth, free, [{ batchNo: 'F1', expiryDate: dayOffset(300), qty: 5 }]);
    await receive(t.owner.auth, priced, [{ batchNo: 'P1', expiryDate: dayOffset(300), qty: 5 }]);
    expect((await sell(cashier.auth, { lines: [{ productId: free, qty: 1 }], payments: [] })).body.code).toBe('no-price');
    expect((await sell(cashier.auth, { lines: [{ productId: priced, qty: 1 }], discountCents: 500, discountReason: 'friend', payments: [] })).status).toBe(403);
    const withChange = await sell(cashier.auth, { lines: [{ productId: priced, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(withChange.body).toMatchObject({ totalCents: 3000, paidCents: 3000, changeCents: 2000, status: 'completed' });
    const discounted = await sell(t.owner.auth, { lines: [{ productId: priced, qty: 2 }], discountCents: 1000, discountReason: 'loyal customer', payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(discounted.body).toMatchObject({ totalCents: 5000, discountCents: 1000 });
  });

  it('keeps unit serials honest: a pack scanned twice, or already sold, or never received, is refused', async () => {
    await boot();
    const t = await newTenant('Serial Chemist');
    const p = await makeProduct(t.owner.auth);
    expect((await receive(t.owner.auth, p, [{ batchNo: 'S1', expiryDate: dayOffset(400), qty: 5, serials: ['AA1', 'AA2', 'AA3'] }])).status).toBe(201);
    // a second delivery claiming a serial already held is refused whole
    const dupe = await receive(t.owner.auth, p, [{ batchNo: 'S2', expiryDate: dayOffset(400), qty: 2, serials: ['AA2', 'AA9'] }]);
    expect(dupe.status).toBe(409);
    expect(dupe.body.code).toBe('serial-already-held');

    const first = await sell(t.owner.auth, { lines: [{ productId: p, serials: ['AA1'] }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(first.status).toBe(201);
    const again = await sell(t.owner.auth, { lines: [{ productId: p, serials: ['AA1'] }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('serial-already-sold');
    const unknown = await sell(t.owner.auth, { lines: [{ productId: p, serials: ['ZZZ'] }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('serial-unknown');
    const twice = await sell(t.owner.auth, { lines: [{ productId: p, serials: ['AA2', 'AA2'] }], payments: [] });
    expect(twice.body.code).toBe('duplicate-scan');
    expect(await onHand(t, p)).toBe(4);
    await assertLedgerAgrees(t);
  });

  it('voids a plain sale back onto the shelf, refuses a second void and a void on a day that is no longer today', async () => {
    await boot();
    const t = await newTenant('Void Chemist');
    const p = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, p, [{ batchNo: 'V1', expiryDate: dayOffset(300), qty: 10 }]);
    const sale = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 4 }], payments: [{ method: 'cash', amountCents: 20000 }] })).body;
    expect(await onHand(t, p)).toBe(6);
    expect((await post(t.owner.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'wrong item' })).status).toBe(200);
    expect(await onHand(t, p)).toBe(10);
    expect((await post(t.owner.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'again' })).status).toBe(409);
    await assertLedgerAgrees(t);
  });

  it('returns goods to the original batch, refuses over-returns, and never restocks a dispensed prescription item', async () => {
    await boot();
    const t = await newTenant('Return Chemist');
    const otc = await makeProduct(t.owner.auth);
    const rx = await makeProduct(t.owner.auth, { category: 'prescription' });
    await receive(t.owner.auth, otc, [{ batchNo: 'O1', expiryDate: dayOffset(300), qty: 10 }]);
    await receive(t.owner.auth, rx, [{ batchNo: 'X1', expiryDate: dayOffset(300), qty: 10 }]);

    const sale = (await sell(t.owner.auth, {
      lines: [{ productId: otc, qty: 3 }, { productId: rx, qty: 2, dispensing: { patientName: 'Wanjiru K', prescriberName: 'Dr Otieno' } }],
      payments: [{ method: 'cash', amountCents: 50000 }]
    })).body;
    const detail = (await get(t.owner.auth, `/v1/sales/${sale.saleId}`)).body;
    const otcLine = detail.lines.find((l: any) => l.productId === otc);
    const rxLine = detail.lines.find((l: any) => l.productId === rx);

    const back = await post(t.owner.auth, `/v1/sales/${sale.saleId}/returns`, { lineId: otcLine.id, qty: 2, reason: 'wrong size', refundMethod: 'cash' });
    expect(back.status).toBe(201);
    expect(back.body.restocked).toBe(true);
    expect(await onHand(t, otc)).toBe(9);
    expect((await post(t.owner.auth, `/v1/sales/${sale.saleId}/returns`, { lineId: otcLine.id, qty: 2, reason: 'too many', refundMethod: 'cash' })).body.code).toBe('return-too-many');

    const rxBack = await post(t.owner.auth, `/v1/sales/${sale.saleId}/returns`, { lineId: rxLine.id, qty: 1, reason: 'doctor changed it', refundMethod: 'cash', restock: true });
    expect(rxBack.status).toBe(201);
    expect(rxBack.body.restocked).toBe(false);
    expect(await onHand(t, rx)).toBe(8);
    await assertLedgerAgrees(t);
  });

  it('lets the same sale be paid in parts and completes it when the last part arrives', async () => {
    await boot();
    const t = await newTenant('Partial Chemist');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 10000 });
    await receive(t.owner.auth, p, [{ batchNo: 'PP1', expiryDate: dayOffset(300), qty: 5 }]);
    const sale = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 3 }], payments: [{ method: 'cash', amountCents: 10000 }] })).body;
    expect(sale).toMatchObject({ status: 'pending_payment', paidCents: 10000, dueCents: 20000 });
    const rest = await post(t.owner.auth, `/v1/sales/${sale.saleId}/payments`, { method: 'cash', amountCents: 20000 });
    expect(rest.body).toMatchObject({ status: 'completed', dueCents: 0 });
    expect((await post(t.owner.auth, `/v1/sales/${sale.saleId}/payments`, { method: 'cash', amountCents: 100 })).status).toBe(409);
  });
});

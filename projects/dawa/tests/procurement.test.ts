import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, assertLedgerAgrees, boot, dayOffset, get, insertExpiredBatch, makeProduct, makeSupplier, newTenant, on, onHand, patch, post, receive, sell, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });
afterAll(shutdown);

describe.runIf(on)('purchase orders, supplier returns, credit notes and voided invoices (real Postgres, RLS on)', () => {
  it('takes an order in two deliveries, refuses over-receipt, books each delivery as an invoice, and will not cancel a part-delivered order', async () => {
    await boot();
    const t = await newTenant('PO Chemist');
    const pharmacist = await addStaff(t, 'pharmacist');
    const manager = await addStaff(t, 'manager');
    const p = await makeProduct(t.owner.auth);
    const supplierId = await makeSupplier(t.owner.auth);

    const po = await post(pharmacist.auth, '/v1/purchase-orders', { supplierId, lines: [{ productId: p, qty: 10, unitCostCents: 3000 }] });
    expect(po.status).toBe(201);
    expect(po.body).toMatchObject({ number: 'PO-00001', status: 'open', totalCents: 30000 });
    const detail = (await get(pharmacist.auth, `/v1/purchase-orders/${po.body.id}`)).body;
    const lineId = detail.lines[0].id;

    const tooMany = await post(pharmacist.auth, `/v1/purchase-orders/${po.body.id}/receive`, { invoiceNumber: 'D-1', invoiceDate: dayOffset(0), lines: [{ lineId, batchNo: 'PO1', expiryDate: dayOffset(300), qty: 11 }] });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.code).toBe('po-over-receipt');
    expect(await onHand(t, p)).toBe(0);

    const first = await post(pharmacist.auth, `/v1/purchase-orders/${po.body.id}/receive`, { invoiceNumber: 'D-1', invoiceDate: dayOffset(0), lines: [{ lineId, batchNo: 'PO1', expiryDate: dayOffset(300), qty: 4 }] });
    expect(first.status).toBe(201);
    expect(first.body.purchaseOrderStatus).toBe('partial');
    expect(first.body.totalCents).toBe(12000); // the order's cost was used
    expect(await onHand(t, p)).toBe(4);
    // part has arrived, so the order can no longer be cancelled
    expect((await post(manager.auth, `/v1/purchase-orders/${po.body.id}/cancel`, { reason: 'changed mind' })).status).toBe(409);

    const second = await post(pharmacist.auth, `/v1/purchase-orders/${po.body.id}/receive`, { invoiceNumber: 'D-2', invoiceDate: dayOffset(0), lines: [{ lineId, batchNo: 'PO2', expiryDate: dayOffset(400), qty: 6, unitCostCents: 3100 }] });
    expect(second.status).toBe(201);
    expect(second.body.purchaseOrderStatus).toBe('received');
    expect((await post(pharmacist.auth, `/v1/purchase-orders/${po.body.id}/receive`, { invoiceNumber: 'D-3', invoiceDate: dayOffset(0), lines: [{ lineId, batchNo: 'PO3', expiryDate: dayOffset(400), qty: 1 }] })).status).toBe(409);

    const after = (await get(pharmacist.auth, `/v1/purchase-orders/${po.body.id}`)).body;
    expect(after.status).toBe('received');
    expect(after.receipts.map((r: any) => r.invoiceNumber).sort()).toEqual(['D-1', 'D-2']);
    expect(await onHand(t, p)).toBe(10);
    await assertLedgerAgrees(t);
    // each delivery is a payable
    const owed = (await get(manager.auth, '/v1/payables')).body;
    expect(owed.outstandingCents).toBe(12000 + 6 * 3100);

    // an untouched order can be cancelled, with a reason, by a manager only; and then takes no deliveries
    const po2 = await post(pharmacist.auth, '/v1/purchase-orders', { supplierId, lines: [{ productId: p, qty: 5 }] });
    expect(po2.body.number).toBe('PO-00002');
    expect((await post(pharmacist.auth, `/v1/purchase-orders/${po2.body.id}/cancel`, { reason: 'wrong supplier' })).status).toBe(403);
    expect((await post(manager.auth, `/v1/purchase-orders/${po2.body.id}/cancel`, { reason: 'wrong supplier' })).body.status).toBe('cancelled');
    const line2 = (await get(manager.auth, `/v1/purchase-orders/${po2.body.id}`)).body.lines[0].id;
    expect((await post(pharmacist.auth, `/v1/purchase-orders/${po2.body.id}/receive`, { invoiceNumber: 'D-9', invoiceDate: dayOffset(0), lines: [{ lineId: line2, batchNo: 'X', expiryDate: dayOffset(300), qty: 1 }] })).status).toBe(409);
  });

  it('gives each organisation its own purchase order numbers and hides one pharmacy\'s orders from another', async () => {
    await boot();
    const a = await newTenant('PO A');
    const b = await newTenant('PO B');
    const pa = await makeProduct(a.owner.auth);
    const pb = await makeProduct(b.owner.auth);
    const sa = await makeSupplier(a.owner.auth);
    const sb = await makeSupplier(b.owner.auth);
    const oa = await post(a.owner.auth, '/v1/purchase-orders', { supplierId: sa, lines: [{ productId: pa, qty: 1 }] });
    const ob = await post(b.owner.auth, '/v1/purchase-orders', { supplierId: sb, lines: [{ productId: pb, qty: 1 }] });
    expect(oa.body.number).toBe('PO-00001');
    expect(ob.body.number).toBe('PO-00001');
    expect((await get(b.owner.auth, `/v1/purchase-orders/${oa.body.id}`)).status).toBe(404);
    expect((await post(b.owner.auth, '/v1/purchase-orders', { supplierId: sa, lines: [{ productId: pb, qty: 1 }] })).status).toBe(404);
  });

  it('sends stock back to the supplier, reduces what is owed with a credit note, and never credits more than is owed', async () => {
    await boot();
    const t = await newTenant('Return Chemist');
    const manager = await addStaff(t, 'manager');
    const pharmacist = await addStaff(t, 'pharmacist');
    const p = await makeProduct(t.owner.auth);
    const supplierId = await makeSupplier(t.owner.auth);
    const rec = await post(pharmacist.auth, '/v1/stock/receive', { supplierId, invoiceNumber: 'RT-1', invoiceDate: dayOffset(0), lines: [{ productId: p, batchNo: 'RT1', expiryDate: dayOffset(300), qty: 10, unitCostCents: 5000 }] });
    expect(rec.status).toBe(201);
    const batchId = rec.body.received[0].batchId;

    // a pharmacist cannot send stock back (a stock-reducing action is a manager's)
    expect((await post(pharmacist.auth, '/v1/supplier-returns', { batchId, qty: 2, reason: 'damaged' })).status).toBe(403);
    expect((await post(manager.auth, '/v1/supplier-returns', { batchId, qty: 11, reason: 'damaged' })).status).toBe(409);

    const ret = await post(manager.auth, '/v1/supplier-returns', { batchId, qty: 4, reason: 'damaged in transit', credit: { invoiceId: rec.body.invoiceId, amountCents: 20000, noteNumber: 'CN-77' } });
    expect(ret.status).toBe(201);
    expect(ret.body.qtyOnHand).toBe(6);
    expect(await onHand(t, p)).toBe(6);
    await assertLedgerAgrees(t);

    const owed = (await get(manager.auth, '/v1/payables')).body;
    expect(owed.items[0]).toMatchObject({ totalCents: 50000, creditedCents: 20000, balanceCents: 30000 });
    expect(owed.outstandingCents).toBe(30000);

    // paying: only what is left, after the credit
    expect((await post(manager.auth, `/v1/payables/${rec.body.invoiceId}/payments`, { amountCents: 35000, method: 'cash' })).body.code).toBe('overpay');
    // a credit note larger than the balance is refused
    const big = await post(manager.auth, '/v1/credit-notes', { invoiceId: rec.body.invoiceId, amountCents: 30001, reason: 'rebate' });
    expect(big.status).toBe(422);
    expect(big.body.code).toBe('credit-exceeds-balance');
    const small = await post(manager.auth, '/v1/credit-notes', { invoiceId: rec.body.invoiceId, amountCents: 10000, reason: 'volume rebate' });
    expect(small.status).toBe(201);
    expect(small.body.balanceCents).toBe(20000);
    expect((await post(manager.auth, `/v1/payables/${rec.body.invoiceId}/payments`, { amountCents: 20000, method: 'cash' })).body.balanceCents).toBe(0);

    const list = (await get(pharmacist.auth, '/v1/supplier-returns')).body;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ qty: 4, reason: 'damaged in transit' });
  });

  it('voids a wrongly entered invoice with a reason: stock and payable reversed, number reusable, audited; refused once money or sales have moved', async () => {
    await boot();
    const t = await newTenant('Void Chemist');
    const manager = await addStaff(t, 'manager');
    const pharmacist = await addStaff(t, 'pharmacist');
    const p = await makeProduct(t.owner.auth);
    const supplierId = await makeSupplier(t.owner.auth);
    const enter = (number: string, qty: number, batchNo: string) =>
      post(pharmacist.auth, '/v1/stock/receive', { supplierId, invoiceNumber: number, invoiceDate: dayOffset(0), lines: [{ productId: p, batchNo, expiryDate: dayOffset(300), qty, unitCostCents: 1000 }] });

    const wrong = await enter('VD-1', 100, 'VB1'); // keyed 100 instead of 10
    expect(wrong.status).toBe(201);
    expect(await onHand(t, p)).toBe(100);
    expect((await post(pharmacist.auth, `/v1/payables/${wrong.body.invoiceId}/void`, { reason: 'typo' })).status).toBe(403);
    expect((await post(manager.auth, `/v1/payables/${wrong.body.invoiceId}/void`, { reason: 'x' })).status).toBe(400); // a real reason is needed
    const voided = await post(manager.auth, `/v1/payables/${wrong.body.invoiceId}/void`, { reason: 'keyed 100 instead of 10' });
    expect(voided.status).toBe(200);
    expect(await onHand(t, p)).toBe(0);
    await assertLedgerAgrees(t);
    expect((await post(manager.auth, `/v1/payables/${wrong.body.invoiceId}/void`, { reason: 'again' })).status).toBe(409);
    const owed = (await get(manager.auth, '/v1/payables')).body;
    expect(owed.outstandingCents).toBe(0);
    expect(owed.items[0]).toMatchObject({ voided: true, balanceCents: 0, voidReason: 'keyed 100 instead of 10' });
    expect((await post(manager.auth, `/v1/payables/${wrong.body.invoiceId}/payments`, { amountCents: 100, method: 'cash' })).body.code).toBe('invoice-voided');
    expect((await get(manager.auth, '/v1/payables?open=true')).body.items).toHaveLength(0);

    // the corrected invoice goes in under the same number
    const right = await enter('VD-1', 10, 'VB1');
    expect(right.status).toBe(201);
    expect(await onHand(t, p)).toBe(10);
    // ...and two live invoices still cannot share a number
    expect((await enter('VD-1', 1, 'VB2')).status).toBe(409);

    // it is on the audit trail with the reason
    const { pool } = await boot();
    const events = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT detail FROM audit_events WHERE action = 'supplier.invoice_void'`)).rows);
    expect(events).toHaveLength(1);
    expect(events[0].detail.reason).toBe('keyed 100 instead of 10');

    // once some of it is sold the void is refused, and nothing changes
    expect((await sell(t.owner.auth, { lines: [{ productId: p, qty: 3 }], payments: [{ method: 'cash', amountCents: 15000 }] })).status).toBe(201);
    const refused = await post(manager.auth, `/v1/payables/${right.body.invoiceId}/void`, { reason: 'changed my mind' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('stock-already-used');
    expect(await onHand(t, p)).toBe(7);

    // and once money moved
    const paid = await enter('VD-2', 5, 'VB3');
    await post(manager.auth, `/v1/payables/${paid.body.invoiceId}/payments`, { amountCents: 1000, method: 'cash' });
    const noVoid = await post(manager.auth, `/v1/payables/${paid.body.invoiceId}/void`, { reason: 'wrong' });
    expect(noVoid.status).toBe(409);
    expect(noVoid.body.code).toBe('invoice-has-payments');
    await assertLedgerAgrees(t);
  });

  it('lets a manager correct a supplier\'s details, and refuses a name another supplier already has', async () => {
    await boot();
    const t = await newTenant('Supplier Edit');
    const manager = await addStaff(t, 'manager');
    const pharmacist = await addStaff(t, 'pharmacist');
    const a = await makeSupplier(t.owner.auth);
    const b = await makeSupplier(t.owner.auth);
    const changed = await patch(manager.auth, `/v1/suppliers/${a}`, { name: 'Kenya Pharma Ltd', phone: '0722000111' });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ name: 'Kenya Pharma Ltd', phone: '254722000111' });
    expect((await patch(pharmacist.auth, `/v1/suppliers/${a}`, { name: 'Nope' })).status).toBe(403);
    expect((await patch(manager.auth, `/v1/suppliers/${b}`, { name: 'Kenya Pharma Ltd' })).status).toBe(409);
    // an inactive supplier drops out of the default list and cannot be received from, but is kept
    expect((await patch(manager.auth, `/v1/suppliers/${b}`, { active: false })).body.active).toBe(false);
    const listed = (await get(manager.auth, '/v1/suppliers')).body.items.map((s: any) => s.id);
    expect(listed).toContain(a);
    expect(listed).not.toContain(b);
    expect((await get(manager.auth, '/v1/suppliers?includeInactive=true')).body.items.map((s: any) => s.id)).toContain(b);
  });
});

describe.runIf(on)('batch recall, quarantine and bulk expiry write-off (real Postgres, RLS on)', () => {
  it('never sells a quarantined or recalled batch, shows it, and only a manager puts it back on sale', async () => {
    await boot();
    const t = await newTenant('Recall Chemist');
    const pharmacist = await addStaff(t, 'pharmacist');
    const manager = await addStaff(t, 'manager');
    const cashier = await addStaff(t, 'cashier');
    const p = await makeProduct(t.owner.auth);
    await receive(t.owner.auth, p, [{ batchNo: 'GOOD', expiryDate: dayOffset(400), qty: 5 }, { batchNo: 'BAD', expiryDate: dayOffset(100), qty: 5 }]);
    const batches = (await get(t.owner.auth, `/v1/stock/batches?productId=${p}`)).body.items;
    const bad = batches.find((b: any) => b.batchNo === 'BAD').id;

    expect((await post(cashier.auth, `/v1/stock/batches/${bad}/status`, {})).status).toBe(404); // wrong verb
    expect((await patch(cashier.auth, `/v1/stock/batches/${bad}/status`, { status: 'recalled', reason: 'manufacturer recall' })).status).toBe(403);
    expect((await patch(pharmacist.auth, `/v1/stock/batches/${bad}/status`, { status: 'recalled' })).status).toBe(400); // a reason is needed
    const held = await patch(pharmacist.auth, `/v1/stock/batches/${bad}/status`, { status: 'recalled', reason: 'manufacturer recall notice 14' });
    expect(held.status).toBe(200);

    // FEFO would have taken BAD first (sooner expiry); it must take GOOD, and run out at 5
    const sale = await sell(t.owner.auth, { lines: [{ productId: p, qty: 5 }], payments: [{ method: 'cash', amountCents: 25000 }] });
    expect(sale.status).toBe(201);
    const left = (await get(t.owner.auth, `/v1/stock/batches?productId=${p}`)).body.items;
    expect(Object.fromEntries(left.map((b: any) => [b.batchNo, b.qtyOnHand]))).toEqual({ BAD: 5 });
    const more = await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(more.status).toBe(409);
    expect(more.body.code).toBe('insufficient-stock');

    // visible: on the batch, in the stock list (as held, not as sellable), and in the alerts
    expect(left[0]).toMatchObject({ status: 'recalled', statusReason: 'manufacturer recall notice 14' });
    const summary = (await get(t.owner.auth, '/v1/stock')).body.items.find((s: any) => s.productId === p);
    expect(summary).toMatchObject({ inDate: 0, held: 5 });
    const alerts = (await get(t.owner.auth, '/v1/stock/alerts')).body;
    expect(alerts.held).toHaveLength(1);
    expect(alerts.held[0]).toMatchObject({ batchNo: 'BAD', status: 'recalled' });
    expect((await get(t.owner.auth, '/v1/stock/batches?status=recalled')).body.items).toHaveLength(1);

    // a pharmacist can hold but not release; a manager can
    expect((await patch(pharmacist.auth, `/v1/stock/batches/${bad}/status`, { status: 'available', reason: 'cleared by supplier' })).status).toBe(403);
    expect((await patch(manager.auth, `/v1/stock/batches/${bad}/status`, { status: 'available', reason: 'supplier cleared this lot' })).status).toBe(200);
    expect((await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] })).status).toBe(201);
    const { pool } = await boot();
    const audit = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT action FROM audit_events WHERE action LIKE 'stock.batch_%' ORDER BY id`)).rows.map((r) => r.action));
    expect(audit).toEqual(['stock.batch_recalled', 'stock.batch_available']);
    await assertLedgerAgrees(t);
  });

  it('refuses a serial-numbered pack from a held batch', async () => {
    await boot();
    const t = await newTenant('Serial Recall');
    const p = await makeProduct(t.owner.auth);
    const rec = await receive(t.owner.auth, p, [{ batchNo: 'SR1', expiryDate: dayOffset(300), qty: 3, serials: ['S1', 'S2', 'S3'] }]);
    expect(rec.status).toBe(201);
    await patch(t.owner.auth, `/v1/stock/batches/${rec.body.received[0].batchId}/status`, { status: 'quarantined', reason: 'cold chain broken' });
    const res = await sell(t.owner.auth, { lines: [{ productId: p, serials: ['S1'] }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('batch-held');
  });

  it('writes off every expired batch in one action, audited, and leaves controlled drugs for a witnessed write-off', async () => {
    await boot();
    const t = await newTenant('Bulk Writeoff');
    const pharmacist = await addStaff(t, 'pharmacist');
    const manager = await addStaff(t, 'manager');
    const a = await makeProduct(t.owner.auth);
    const b = await makeProduct(t.owner.auth);
    const cd = await makeProduct(t.owner.auth, { category: 'controlled' });
    await insertExpiredBatch(t, a, 7, 'EXP-A');
    await insertExpiredBatch(t, b, 3, 'EXP-B');
    await insertExpiredBatch(t, cd, 2, 'EXP-C');
    await receive(t.owner.auth, a, [{ batchNo: 'FRESH', expiryDate: dayOffset(300), qty: 4 }]);

    expect((await post(pharmacist.auth, '/v1/stock/writeoff-expired', {})).status).toBe(403);
    const done = await post(manager.auth, '/v1/stock/writeoff-expired', { reason: 'quarterly expiry clearance' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ batches: 2, units: 10, valueCents: 10000 });
    expect(done.body.skippedControlled).toHaveLength(1);
    expect(done.body.skippedControlled[0]).toMatchObject({ batchNo: 'EXP-C', qty: 2 });
    expect(await onHand(t, a)).toBe(4); // the fresh batch is untouched
    expect(await onHand(t, b)).toBe(0);
    expect(await onHand(t, cd)).toBe(2);
    const alerts = (await get(t.owner.auth, '/v1/stock/alerts')).body;
    expect(alerts.expired.map((e: any) => e.batchNo)).toEqual(['EXP-C']);

    const { pool } = await boot();
    const events = await pool.withOrg(t.orgId, async (c) => (await c.query(`SELECT action, detail FROM audit_events WHERE action LIKE 'stock.%writeoff%' ORDER BY id`)).rows);
    expect(events.map((e) => e.action)).toEqual(['stock.expiry_writeoff', 'stock.expiry_writeoff', 'stock.bulk_expiry_writeoff']);
    expect(events[2].detail).toMatchObject({ batches: 2, units: 10, reason: 'quarterly expiry clearance' });
    // running it again finds nothing more to write off
    expect((await post(manager.auth, '/v1/stock/writeoff-expired', {})).body).toMatchObject({ batches: 0, units: 0 });
    await assertLedgerAgrees(t);
  });
});

import { afterAll, describe, expect, it, vi } from 'vitest';
import { addStaff, assertLedgerAgrees, boot, dayOffset, get, makeProduct, newTenant, on, onHand, post, receive, sell, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });
const rxLine = (productId: string, qty = 1) => ({ productId, qty, dispensing: { patientName: 'Achieng Otieno', patientAgeYears: 29, patientSex: 'female', prescriberName: 'Dr Mwangi', prescriberRegNo: 'A1234', prescriptionRef: 'RX-77', directions: 'Twice daily' } });

describe.runIf(on)('prescription dispensing and the controlled-drug register (real Postgres, RLS on)', () => {
  afterAll(shutdown);

  it('lets only a pharmacist (or above) dispense a prescription item, and only with the patient and prescriber recorded', async () => {
    await boot();
    const t = await newTenant('Rx Chemist');
    const cashier = await addStaff(t, 'cashier');
    const pharmacist = await addStaff(t, 'pharmacist');
    const rx = await makeProduct(t.owner.auth, { category: 'prescription', name: 'Amoxicillin 500mg' });
    await receive(t.owner.auth, rx, [{ batchNo: 'AMX1', expiryDate: dayOffset(300), qty: 20 }]);

    expect((await sell(cashier.auth, { lines: [rxLine(rx)], payments: [{ method: 'cash', amountCents: 5000 }] })).status).toBe(403);
    const missing = await sell(pharmacist.auth, { lines: [{ productId: rx, qty: 1 }], payments: [{ method: 'cash', amountCents: 5000 }] });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('dispensing-required');

    const ok = await sell(pharmacist.auth, { lines: [rxLine(rx, 2)], payments: [{ method: 'cash', amountCents: 10000 }] });
    expect(ok.status).toBe(201);
    const log = (await get(pharmacist.auth, '/v1/dispensing')).body.items;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ product: 'Amoxicillin 500mg', qty: 2, patientName: 'Achieng Otieno', prescriberName: 'Dr Mwangi', prescriberRegNo: 'A1234', batches: 'AMX1' });
    // a cashier cannot read the log, and the record cannot be edited by the application role
    expect((await get(cashier.auth, '/v1/dispensing')).status).toBe(403);
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE dispensing_records SET patient_name = 'Someone Else'`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`DELETE FROM dispensing_records`))).rejects.toThrow(/permission denied/);
    const csv = await get(pharmacist.auth, '/v1/dispensing/export.csv');
    expect(csv.text.split('\n')[0]).toContain('patient');
    expect(csv.text).toContain('Achieng Otieno');
  });

  it('cannot void a sale that dispensed a prescription item', async () => {
    await boot();
    const t = await newTenant('NoVoid Chemist');
    const rx = await makeProduct(t.owner.auth, { category: 'prescription' });
    await receive(t.owner.auth, rx, [{ batchNo: 'N1', expiryDate: dayOffset(300), qty: 5 }]);
    const sale = (await sell(t.owner.auth, { lines: [rxLine(rx)], payments: [{ method: 'cash', amountCents: 5000 }] })).body;
    const res = await post(t.owner.auth, `/v1/sales/${sale.saleId}/void`, { reason: 'changed mind' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('void-dispensed');
  });

  it('needs a different person as witness for every controlled movement, and keeps a true running balance', async () => {
    await boot();
    const t = await newTenant('Controlled Chemist');
    const ph1 = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const cashier = await addStaff(t, 'cashier');
    const cd = await makeProduct(t.owner.auth, { category: 'controlled', name: 'Diazepam 5mg' });

    // receiving
    expect((await receive(ph1.auth, cd, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 30 }])).status).toBe(400); // no witness at all
    const self = await receive(ph1.auth, cd, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 30 }], { witness: { phone: ph1.phone, pin: ph1.pin } });
    expect(self.status).toBe(422);
    expect(self.body.code).toBe('witness-must-differ');
    const wrongPin = await receive(ph1.auth, cd, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 30 }], { witness: { phone: ph2.phone, pin: '000000' } });
    expect(wrongPin.status).toBe(401);
    const noCashierWitness = await receive(ph1.auth, cd, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 30 }], { witness: { phone: cashier.phone, pin: cashier.pin } });
    expect(noCashierWitness.status).toBe(403);
    const good = await receive(ph1.auth, cd, [{ batchNo: 'D1', expiryDate: dayOffset(300), qty: 30 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
    expect(good.status).toBe(201);

    // dispensing
    const line = rxLine(cd, 4);
    expect((await sell(ph1.auth, { lines: [line], payments: [{ method: 'cash', amountCents: 20000 }] })).status).toBe(400);
    const sold = await sell(ph1.auth, { lines: [line], payments: [{ method: 'cash', amountCents: 20000 }], witness: { phone: ph2.phone, pin: ph2.pin } });
    expect(sold.status).toBe(201);
    const register = (await get(ph1.auth, '/v1/controlled/register')).body;
    expect(register.balances[0].balance).toBe(26);
    expect(register.entries.map((e: any) => [e.kind, e.qty_delta, e.balance_after])).toEqual([['dispense', -4, 26], ['receive', 30, 30]]);
    expect(register.entries[0].witness).toMatch(/pharmacist/);
    expect(register.entries[0].actor).not.toBe(register.entries[0].witness);
    expect((await get(cashier.auth, '/v1/controlled/register')).status).toBe(403);
    expect(await onHand(t, cd)).toBe(26);

    // append-only, and a CHECK refuses a negative balance
    const { pool } = await boot();
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE controlled_register SET qty_delta = 99`))).rejects.toThrow(/permission denied/);
    await expect(pool.withOrg(t.orgId, (c) => c.query(`UPDATE controlled_balances SET balance = -1`))).rejects.toThrow(/violates check constraint/);

    // a controlled drug cannot be returned through the till, and its sale cannot be voided
    const detail = (await get(ph1.auth, `/v1/sales/${sold.body.saleId}`)).body;
    expect((await post(t.owner.auth, `/v1/sales/${sold.body.saleId}/returns`, { lineId: detail.lines[0].id, qty: 1, reason: 'patient returned it', refundMethod: 'cash' })).body.code).toBe('return-controlled');
    expect((await post(t.owner.auth, `/v1/sales/${sold.body.saleId}/void`, { reason: 'cashier error' })).body.code).toBe('void-dispensed');
    await assertLedgerAgrees(t);
  });

  it('serialises concurrent controlled dispensing: the register balance never goes wrong or below zero', async () => {
    await boot();
    const t = await newTenant('Controlled Race');
    const ph1 = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const cd = await makeProduct(t.owner.auth, { category: 'controlled' });
    await receive(ph1.auth, cd, [{ batchNo: 'C1', expiryDate: dayOffset(300), qty: 10 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
    const attempts = await Promise.all(Array.from({ length: 14 }, () => sell(ph1.auth, { lines: [rxLine(cd, 1)], payments: [{ method: 'cash', amountCents: 5000 }], witness: { phone: ph2.phone, pin: ph2.pin } })));
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(10);
    const register = (await get(ph1.auth, '/v1/controlled/register?limit=500')).body;
    expect(register.balances[0].balance).toBe(0);
    const balances = register.entries.map((e: any) => e.balance_after).reverse();
    expect(balances).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    await assertLedgerAgrees(t);
  });

  it('treats a stock adjustment on a controlled drug as a witnessed register entry, and an owner/manager-only action', async () => {
    await boot();
    const t = await newTenant('Adjust Chemist');
    const ph = await addStaff(t, 'pharmacist');
    const ph2 = await addStaff(t, 'pharmacist');
    const manager = await addStaff(t, 'manager');
    const cd = await makeProduct(t.owner.auth, { category: 'controlled' });
    await receive(ph.auth, cd, [{ batchNo: 'AD1', expiryDate: dayOffset(300), qty: 10 }], { witness: { phone: ph2.phone, pin: ph2.pin } });
    const batchId = (await get(t.owner.auth, `/v1/stock/batches?productId=${cd}`)).body.items[0].id;
    expect((await post(ph.auth, '/v1/stock/adjust', { batchId, kind: 'adjustment', qtyDelta: -1, reason: 'broken tablet' })).status).toBe(403);
    const noWitness = await post(manager.auth, '/v1/stock/adjust', { batchId, kind: 'adjustment', qtyDelta: -1, reason: 'broken tablet' });
    expect(noWitness.status).toBe(400);
    const done = await post(manager.auth, '/v1/stock/adjust', { batchId, kind: 'adjustment', qtyDelta: -1, reason: 'broken tablet', witness: { phone: ph2.phone, pin: ph2.pin } });
    expect(done.status).toBe(200);
    expect(done.body.qtyOnHand).toBe(9);
    const register = (await get(ph.auth, '/v1/controlled/register')).body;
    expect(register.entries[0]).toMatchObject({ kind: 'adjustment', qty_delta: -1, balance_after: 9, reason: 'broken tablet' });
    // taking more than is on the shelf is refused
    const tooMany = await post(manager.auth, '/v1/stock/adjust', { batchId, kind: 'adjustment', qtyDelta: -50, reason: 'miscount', witness: { phone: ph2.phone, pin: ph2.pin } });
    expect(tooMany.body.code).toBe('insufficient-stock');
    await assertLedgerAgrees(t);
  });
});

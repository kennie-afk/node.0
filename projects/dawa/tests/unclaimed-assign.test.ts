import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { addStaff, boot, dayOffset, get, makeProduct, newTenant, on, patch, post, receive, sell, shutdown } from './helpers';

vi.setConfig({ testTimeout: 90_000 });
afterAll(shutdown);

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'x';
const RUN = Date.now().toString(36).toUpperCase();
let n = 0;
const ref = () => `UCA${RUN}${(n += 1)}`;
const darajaTime = () => new Date(Date.now() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
const tillNo = () => String(Math.floor(Math.random() * 8_000_000) + 1_000_000);

async function confirm(body: Record<string, unknown>) {
  return request((await boot()).app).post(`/v1/mpesa/${SECRET}/confirmation`).send({ TransTime: darajaTime(), MSISDN: '254700123456', BillRefNumber: 'ROOM 4', ...body });
}

describe.runIf(on)('operator assigns money from an unregistered till to a pharmacy', () => {
  it('moves it into the right organisation\'s till as a normal payment, once, and never into a second organisation', async () => {
    await boot();
    const { listUnclaimed, assignUnclaimed } = await import('../src/mpesa/unclaimed');
    const a = await newTenant('Unclaimed A');
    const b = await newTenant('Unclaimed B');
    const till = tillNo();
    const code = ref();
    // paid to a till nobody has registered yet
    expect((await confirm({ TransID: code, TransAmount: 1250, BusinessShortCode: till })).status).toBe(200);
    expect((await listUnclaimed()).map((r) => r.externalRef)).toContain(code);
    expect((await get(a.owner.auth, '/v1/mpesa/unmatched')).body.items.map((u: any) => u.externalRef)).not.toContain(code);

    // the pharmacy registers the till; the operator moves the held payment in
    await patch(a.owner.auth, `/v1/branches/${a.branchId}`, { tillNumber: till });
    const first = await assignUnclaimed(code, a.orgId);
    expect(first).toMatchObject({ alreadyAssigned: false, branchId: a.branchId, matchedSaleId: null });
    const waiting = (await get(a.owner.auth, '/v1/mpesa/unmatched')).body.items.find((u: any) => u.externalRef === code);
    expect(waiting).toMatchObject({ amountCents: 125000, payerMsisdn: '254700123456', reference: 'ROOM 4' });

    // running it again changes nothing
    expect(await assignUnclaimed(code, a.orgId)).toMatchObject({ alreadyAssigned: true });
    expect((await get(a.owner.auth, '/v1/mpesa/unmatched')).body.items.filter((u: any) => u.externalRef === code)).toHaveLength(1);
    // it no longer shows as unassigned, and another organisation cannot take it
    expect((await listUnclaimed()).map((r) => r.externalRef)).not.toContain(code);
    expect((await listUnclaimed({ includeClaimed: true })).find((r) => r.externalRef === code)?.claimedByOrg).toBe(a.orgId);
    await expect(assignUnclaimed(code, b.orgId)).rejects.toThrow(/already assigned to a different organisation/);
    expect((await get(b.owner.auth, '/v1/mpesa/unmatched')).body.items).toHaveLength(0);
    await expect(assignUnclaimed('NOSUCHCODE', a.orgId)).rejects.toThrow(/no unclaimed payment/);
  });

  it('applies it straight to a pending sale of the same amount when one is waiting, and asks which branch when there are several', async () => {
    await boot();
    const { assignUnclaimed } = await import('../src/mpesa/unclaimed');
    const t = await newTenant('Unclaimed Match');
    const p = await makeProduct(t.owner.auth, { listPriceCents: 7700 });
    await receive(t.owner.auth, p, [{ batchNo: 'UM1', expiryDate: dayOffset(300), qty: 5 }]);
    const pending = await sell(t.owner.auth, { lines: [{ productId: p, qty: 1 }], payments: [] });
    expect(pending.status).toBe(201);
    expect(pending.body.status).toBe('pending_payment');
    const code = ref();
    await confirm({ TransID: code, TransAmount: 77, BusinessShortCode: tillNo(), BillRefNumber: '' });
    const out = await assignUnclaimed(code, t.orgId);
    expect(out.matchedSaleId).toBe(pending.body.saleId);
    expect((await get(t.owner.auth, `/v1/sales/${pending.body.saleId}`)).body.status).toBe('completed');

    // a second branch with a different till: the operator has to choose
    const second = (await post(t.owner.auth, '/v1/branches', { name: 'Second Branch' })).body;
    const code2 = ref();
    await confirm({ TransID: code2, TransAmount: 10, BusinessShortCode: tillNo() });
    await expect(assignUnclaimed(code2, t.orgId)).rejects.toThrow(/several branches/);
    expect(await assignUnclaimed(code2, t.orgId, second.id)).toMatchObject({ branchId: second.id });
  });
});

describe.runIf(on)('a manager claims an unmatched till payment for a sale from the console', () => {
  it('puts it against the chosen sale with the amount the till recorded, once, and only for a manager', async () => {
    await boot();
    const t = await newTenant('Claim Chemist');
    const cashier = await addStaff(t, 'cashier');
    const till = tillNo();
    await patch(t.owner.auth, `/v1/branches/${t.branchId}`, { tillNumber: till });
    const p = await makeProduct(t.owner.auth, { listPriceCents: 9900 });
    await receive(t.owner.auth, p, [{ batchNo: 'CL1', expiryDate: dayOffset(300), qty: 5 }]);
    const code = ref();
    // the amount does not match the sale, so it is kept for a person to assign
    await confirm({ TransID: code, TransAmount: 99, BusinessShortCode: till, BillRefNumber: 'NOPE' });
    expect((await get(t.owner.auth, '/v1/mpesa/unmatched')).body.total).toBe(1);
    const sale = (await sell(t.owner.auth, { lines: [{ productId: p, qty: 2 }], payments: [] })).body; // 198.00 due
    expect(sale.status).toBe('pending_payment');

    expect((await post(cashier.auth, `/v1/mpesa/unmatched/${code}/claim`, { saleId: sale.saleId })).status).toBe(403);
    expect((await post(t.owner.auth, '/v1/mpesa/unmatched/NOTAREALCODE/claim', { saleId: sale.saleId })).status).toBe(404);
    const claimed = await post(t.owner.auth, `/v1/mpesa/unmatched/${code}/claim`, { saleId: sale.saleId });
    expect(claimed.status).toBe(201);
    expect(claimed.body).toMatchObject({ paidCents: 9900, dueCents: 9900 }); // the held amount (99.00), not the placeholder
    expect((await get(t.owner.auth, '/v1/mpesa/unmatched')).body.total).toBe(0);
    // the same payment cannot be claimed twice
    expect((await post(t.owner.auth, `/v1/mpesa/unmatched/${code}/claim`, { saleId: sale.saleId })).status).toBe(404);
  });
});

/** Shared by the M-Pesa tests: Daraja-shaped confirmations and a paybill for a tenant. */
import { expect } from 'vitest';
import request from 'supertest';
import { boot, patch } from './helpers';
import type { Tenant } from './helpers';

export const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'mpesa-secret-1234567';
let tx = Math.floor(Math.random() * 1e9);
let paybillSeq = 100_000 + Math.floor(Math.random() * 300_000);

export const transTime = (at = new Date()) => new Date(at.getTime() + 3 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);

export function confirmation(shortCode: string, billRef: string, amount: number, over: Record<string, unknown> = {}) {
  return {
    TransactionType: 'Pay Bill', TransID: `Z${String((tx += 1)).padStart(9, '0')}`, TransTime: transTime(), TransAmount: amount,
    BusinessShortCode: shortCode, BillRefNumber: billRef, MSISDN: '254700000002', ...over
  };
}

export async function setPaybill(t: Tenant): Promise<string> {
  const code = String((paybillSeq += 1));
  expect((await patch(t.owner.auth, `/v1/branches/${t.branchId}`, { paybillNumber: code })).status).toBe(200);
  return code;
}

export async function callback(body: object, secret = SECRET) {
  const { app } = await boot();
  return request(app).post(`/v1/mpesa/c2b/${secret}/confirmation`).send(body);
}

/** Trial balance rows by account code, in cents (debit positive). */
export async function trialByCode(auth: { Authorization: string }): Promise<{ byCode: Record<string, number>; totalDebit: number; totalCredit: number }> {
  const { app } = await boot();
  const res = await request(app).get('/v1/reports/trial-balance').set(auth);
  expect(res.status).toBe(200);
  const byCode: Record<string, number> = {};
  for (const r of res.body.rows as Array<{ code: string; debitCents: number; creditCents: number }>) byCode[r.code] = r.debitCents - r.creditCents;
  return { byCode, totalDebit: res.body.totalDebitCents, totalCredit: res.body.totalCreditCents };
}

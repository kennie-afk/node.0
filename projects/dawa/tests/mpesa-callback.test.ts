import { afterAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { boot, on, shutdown } from './helpers';

// The service is replaced for the whole file so the route's own reaction to each kind of failure can be
// observed: the real service is covered in payments-close.test.ts.
const ingest = vi.hoisted(() => vi.fn());
vi.mock('../src/mpesa/service', async (original) => ({ ...(await original<object>()), ingestConfirmation: ingest }));

const SECRET = process.env.MPESA_CALLBACK_SECRET ?? 'x';
const body = { TransID: 'TX1', TransTime: '20260101120000', TransAmount: 100, BusinessShortCode: '123456', BillRefNumber: '', MSISDN: '254700000001' };

describe.runIf(on)('what the confirmation route tells Daraja when processing goes wrong', () => {
  afterAll(shutdown);

  it('answers 5xx on a transient failure so Daraja retries, instead of acknowledging money it never recorded', async () => {
    const { app } = await boot();
    ingest.mockRejectedValueOnce(new Error('connection terminated unexpectedly'));

    const res = await request(app).post(`/v1/mpesa/${SECRET}/confirmation`).send(body);

    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.ResultCode).not.toBe(0);
  });

  it('acknowledges a malformed confirmation, which will never become valid, so Daraja stops resending it', async () => {
    const { app } = await boot();
    const { BadRequestError } = await import('../src/domain/errors');
    ingest.mockRejectedValueOnce(new BadRequestError('Daraja callback rejected: TransID'));

    const res = await request(app).post(`/v1/mpesa/${SECRET}/confirmation`).send({ nonsense: true });

    expect(res.status).toBe(200);
    expect(res.body.ResultCode).toBe(0);
  });
});

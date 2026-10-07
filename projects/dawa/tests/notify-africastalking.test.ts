import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AfricasTalkingProvider } from '../src/notify/provider';

// A stub standing in for Africa's Talking. Nothing here proves the real service behaves this way: see README.
interface Seen { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: URLSearchParams }
let server: http.Server;
let base = '';
let seen: Seen[] = [];
let respond: (res: http.ServerResponse) => void = () => undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body: new URLSearchParams(raw) });
      respond(res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const json = (status: number, body: unknown) => (res: http.ServerResponse) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const make = (over: Partial<ConstructorParameters<typeof AfricasTalkingProvider>[0]> = {}) => new AfricasTalkingProvider({ username: 'dawa-sandbox', apiKey: 'key-123', baseUrl: base, timeoutMs: 500, ...over });
const message = { to: '254712345678', purpose: 'signup-code' as const, body: 'Your Dawa code is 123456' };

describe('Africa\'s Talking SMS provider (against a stub server)', () => {
  it('posts the documented form to /version1/messaging with the API key header and a +E.164 number', async () => {
    seen = [];
    respond = json(201, { SMSMessageData: { Message: 'Sent to 1/1 Total Cost: KES 0.8000', Recipients: [{ statusCode: 101, number: '+254712345678', cost: 'KES 0.8000', status: 'Success', messageId: 'ATXid_1' }] } });
    const outcome = await make({ senderId: 'DAWA' }).send(message);
    expect(outcome).toEqual({ status: 'sent' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/version1/messaging' });
    expect(seen[0]!.headers.apikey).toBe('key-123');
    expect(seen[0]!.headers.accept).toBe('application/json');
    expect(seen[0]!.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(seen[0]!.body)).toEqual({ username: 'dawa-sandbox', to: '+254712345678', message: 'Your Dawa code is 123456', from: 'DAWA' });
  });

  it('leaves out the sender id when none is configured', async () => {
    seen = [];
    respond = json(201, { SMSMessageData: { Recipients: [{ statusCode: 100, number: '+254712345678', status: 'Processed' }] } });
    expect(await make().send(message)).toEqual({ status: 'sent' });
    expect(seen[0]!.body.has('from')).toBe(false);
  });

  it('reports a refused number as failed, with the provider\'s reason', async () => {
    respond = json(201, { SMSMessageData: { Message: 'Sent to 0/1', Recipients: [{ statusCode: 403, number: '+254712345678', status: 'InvalidPhoneNumber' }] } });
    const outcome = await make().send(message);
    expect(outcome.status).toBe('failed');
    expect((outcome as { error: string }).error).toContain('InvalidPhoneNumber');
  });

  it('reports bad credentials (HTTP 401), an empty recipient list, a non-JSON answer, and a server that never answers as failed - never as sent', async () => {
    respond = (res) => { res.writeHead(401, { 'Content-Type': 'text/plain' }); res.end('The supplied authentication is invalid'); };
    expect(await make().send(message)).toMatchObject({ status: 'failed', error: expect.stringContaining('401') });
    respond = json(201, { SMSMessageData: { Message: 'InsufficientBalance', Recipients: [] } });
    expect(await make().send(message)).toMatchObject({ status: 'failed', error: expect.stringContaining('InsufficientBalance') });
    respond = (res) => { res.writeHead(200); res.end('<html>maintenance</html>'); };
    expect(await make().send(message)).toMatchObject({ status: 'failed', error: expect.stringContaining('not JSON') });
    respond = () => undefined; // hang
    expect(await make({ timeoutMs: 200 }).send(message)).toMatchObject({ status: 'failed' });
    expect(await make({ baseUrl: 'http://127.0.0.1:1' }).send(message)).toMatchObject({ status: 'failed' });
  });
});

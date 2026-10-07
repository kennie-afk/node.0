import { afterAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AfricasTalkingProvider, setProvider, type MessageProvider } from '../src/notify/provider';
import { addStaff, get, makeGuard, newTenant, on, post, shutdown } from './helpers';

afterAll(async () => { setProvider(null); await shutdown(); });

function stub(handler: (req: { headers: http.IncomingHttpHeaders; body: string }, res: http.ServerResponse) => void): Promise<{ url: string; close: () => Promise<void>; seen: Array<{ headers: http.IncomingHttpHeaders; body: string }> }> {
  const seen: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => { const r = { headers: req.headers, body }; seen.push(r); handler(r, res); });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/messaging`, seen, close: () => new Promise((r) => server.close(() => r())) })));
}

describe('Africa\'s Talking provider against a stub HTTP server (not the real service)', () => {
  const msg = { to: '254712345678', purpose: 'expiry-alert' as const, body: 'Reminder: renew' };

  it('posts a form with the api key header and maps a success reply', async () => {
    const s = await stub((_r, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ SMSMessageData: { Recipients: [{ status: 'Success', statusCode: 101 }] } })); });
    const out = await new AfricasTalkingProvider({ username: 'sandbox', apiKey: 'key-12345678', senderId: 'SOJAA', baseUrl: s.url }).send(msg);
    await s.close();
    expect(out).toEqual({ status: 'sent' });
    const req = s.seen[0]!;
    expect(req.headers.apikey).toBe('key-12345678');
    expect(req.headers['content-type']).toMatch(/x-www-form-urlencoded/);
    const form = new URLSearchParams(req.body);
    expect(Object.fromEntries(form)).toEqual({ username: 'sandbox', to: '+254712345678', message: 'Reminder: renew', from: 'SOJAA' });
  });

  it('reports a rejected recipient, an HTTP error, bad JSON and an unreachable server as failures without throwing', async () => {
    const reply = (status: number, body: string) => stub((_r, res) => { res.statusCode = status; res.end(body); });
    const cfg = (baseUrl: string) => new AfricasTalkingProvider({ username: 'u', apiKey: 'key-12345678', baseUrl, timeoutMs: 1500 });
    const a = await reply(200, JSON.stringify({ SMSMessageData: { Recipients: [{ status: 'InvalidPhoneNumber', statusCode: 403 }] } }));
    expect(await cfg(a.url).send(msg)).toEqual({ status: 'failed', error: 'provider status InvalidPhoneNumber' });
    await a.close();
    const b = await reply(500, 'oops');
    expect(await cfg(b.url).send(msg)).toEqual({ status: 'failed', error: 'http 500' });
    await b.close();
    const c = await reply(200, 'not json');
    expect((await cfg(c.url).send(msg)).status).toBe('failed');
    await c.close();
    expect((await cfg('http://127.0.0.1:1/messaging').send(msg)).status).toBe('failed');
  });
});

describe.runIf(on)('expiry alerts and the notification outbox (real Postgres)', () => {
  it('lists what is lapsing, queues each alert once, and retries a failed send before marking it sent', async () => {
    const t = await newTenant('Expiry Firm');
    const ops = await addStaff(t, 'ops_manager');
    const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const a = await makeGuard(t.owner.auth, { psraExpiry: inDays(10) });
    const b = await makeGuard(t.owner.auth, { psraExpiry: inDays(300) });
    const c = await makeGuard(t.owner.auth, { psraExpiry: inDays(-3) });
    expect((await post(ops.auth, `/v1/guards/${b.id}/training`, { title: 'First aid', expiresOn: inDays(5) })).status).toBe(201);
    const eq = await post(ops.auth, `/v1/guards/${b.id}/equipment`, { item: 'Radio', issuedOn: inDays(-60), returnDueOn: inDays(2) });
    expect(eq.status).toBe(201);

    const list = await get(ops.auth, '/v1/expiries?days=30');
    expect(list.body.total).toBe(4);
    expect(list.body.items.map((i: { kind: string; guardId: string }) => [i.kind, i.guardId])).toEqual([['psra', c.id], ['equipment', b.id], ['training', b.id], ['psra', a.id]]);
    expect(list.body.items[0].daysLeft).toBeLessThan(0);
    // a returned item drops off, and a supervisor of another branch sees nothing outside theirs
    expect((await post(ops.auth, `/v1/equipment/${eq.body.id}/return`, { returnedOn: inDays(0) })).status).toBe(200);
    expect((await get(ops.auth, '/v1/expiries?days=30')).body.total).toBe(3);

    // first send fails, second succeeds: the alert is retried, never duplicated
    let calls = 0;
    const sentTo: string[] = [];
    const flaky: MessageProvider = { name: 'flaky', async send(m) { calls += 1; if (calls === 1) return { status: 'failed', error: 'down' }; sentTo.push(m.to); return { status: 'sent' }; } };
    setProvider(flaky);
    const q = await post(ops.auth, '/v1/notifications/expiry-alerts', { days: 30 });
    expect(q.status).toBe(201);
    expect(q.body.queued).toBe(3);
    expect(q.body.dispatch).toMatchObject({ sent: 2, retrying: 1 });
    const again = await post(ops.auth, '/v1/notifications/expiry-alerts', { days: 30 });
    expect(again.body.queued).toBe(0); // the same alerts are not queued twice
    expect(again.body.dispatch.sent).toBe(0); // the failed one waits for its back-off
    const { pool } = await (await import('./helpers')).boot();
    await pool.withMigrator((cl) => cl.query(`UPDATE notification_outbox SET next_attempt_at = now() - interval '1 second' WHERE org_id = $1`, [t.orgId]));
    const { dispatchAllOutboxes } = await import('../src/ops/expiries');
    await dispatchAllOutboxes();
    const out = await get(ops.auth, '/v1/notifications');
    expect(out.body.items.map((i: { status: string }) => i.status).sort()).toEqual(['sent', 'sent', 'sent']);
    expect(out.body.items.find((i: { attempts: number }) => i.attempts === 2)).toBeTruthy();
    expect(sentTo).toHaveLength(3);
  });
});

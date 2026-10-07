import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { AfricasTalkingProvider, MockProvider, setProvider } from '../src/notify/provider';
import type { DeliveryOutcome, MessageProvider, OutboundMessage } from '../src/notify/provider';
import { assertLedgerBalanced, fullStaff, get, lendUntil, makeMember, makeProduct, nairobiDay, newTenant, on, post, shutdown } from './helpers';

vi.setConfig({ testTimeout: 120_000 });
afterAll(shutdown);
afterEach(() => setProvider(null));

const K = (n: number) => n * 100;

interface Seen { path: string; headers: http.IncomingHttpHeaders; form: URLSearchParams }

/** A stand-in for the SMS service: records what it was sent and answers with whatever the test says. */
async function stub(reply: (seen: Seen) => { status: number; body: unknown }) {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const entry = { path: req.url ?? '', headers: req.headers, form: new URLSearchParams(raw) };
      seen.push(entry);
      const out = reply(entry);
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { seen, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const message: OutboundMessage = { to: '254712345678', purpose: 'loan-reminder', body: 'Hello there' };
const cfg = (baseUrl: string) => ({ username: 'sandbox-user', apiKey: 'secret-key-123456', senderId: 'HAZINA', baseUrl });
const accepted = { SMSMessageData: { Message: 'Sent to 1/1', Recipients: [{ statusCode: 101, status: 'Success', number: '+254712345678' }] } };

describe('Africa\'s Talking provider (against a stub server only: NOT verified against the real service)', () => {
  it('posts the documented form fields with the api key header and reads an accepted recipient as sent', async () => {
    const s = await stub(() => ({ status: 201, body: accepted }));
    try {
      expect(await new AfricasTalkingProvider(cfg(s.url)).send(message)).toEqual({ status: 'sent' });
      expect(s.seen).toHaveLength(1);
      expect(s.seen[0]!.path).toBe('/version1/messaging');
      expect(s.seen[0]!.headers.apikey).toBe('secret-key-123456');
      expect(s.seen[0]!.headers['content-type']).toMatch(/x-www-form-urlencoded/);
      expect(Object.fromEntries(s.seen[0]!.form)).toEqual({ username: 'sandbox-user', to: '+254712345678', message: 'Hello there', from: 'HAZINA' });
    } finally {
      await s.close();
    }
  });

  it('reports a rejected recipient, an HTTP error, a non-JSON reply and an unreachable server as failed, never as sent', async () => {
    const rejected = await stub(() => ({ status: 201, body: { SMSMessageData: { Recipients: [{ statusCode: 403, status: 'InvalidPhoneNumber' }] } } }));
    const down = await stub(() => ({ status: 500, body: {} }));
    const empty = await stub(() => ({ status: 201, body: { SMSMessageData: { Message: 'No recipients', Recipients: [] } } }));
    try {
      expect(await new AfricasTalkingProvider(cfg(rejected.url)).send(message)).toEqual({ status: 'failed', error: 'InvalidPhoneNumber (403)' });
      expect(await new AfricasTalkingProvider(cfg(down.url)).send(message)).toEqual({ status: 'failed', error: 'HTTP 500' });
      expect(await new AfricasTalkingProvider(cfg(empty.url)).send(message)).toEqual({ status: 'failed', error: 'No recipients' });
    } finally {
      await Promise.all([rejected.close(), down.close(), empty.close()]);
    }
    const gone = await stub(() => ({ status: 200, body: {} }));
    const url = gone.url;
    await gone.close();
    const outcome = await new AfricasTalkingProvider({ ...cfg(url), timeoutMs: 2_000 }).send(message);
    expect(outcome.status).toBe('failed');
  });
});

class Recording implements MessageProvider {
  readonly name = 'recording';
  sent: OutboundMessage[] = [];
  async send(m: OutboundMessage): Promise<DeliveryOutcome> {
    this.sent.push(m);
    return { status: 'sent' };
  }
}

describe.runIf(on)('instalment and arrears reminders (real Postgres)', () => {
  it('texts on the instalment ladder once a day, and a repeat run sends nothing more', async () => {
    const t = await newTenant('Reminders');
    const s = await fullStaff(t);
    const rec = new Recording();
    setProvider(rec);
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const mk = async (name: string, firstDueOffset: number) => {
      const m = await makeMember(t.owner.auth, name);
      const id = await lendUntil(s, m.id, p, K(6_000), 3, 'disbursed', nairobiDay(Math.min(-5, firstDueOffset - 31)), { firstDueDate: nairobiDay(firstDueOffset) });
      return (await get(t.owner.auth, `/v1/loans/${id}`)).body.loanNo as string;
    };
    const upcoming = await mk('Soon', 3); // due in 3 days
    const dueToday = await mk('Today', 0);
    const week = await mk('Week', -7); // 7 days late: on the ladder
    const odd = await mk('Odd', -5); // 5 days late: not on the ladder

    const run = await post(s.accountant.auth, '/v1/reminders/run', { upcomingDays: 3 });
    expect(run.status).toBe(200);
    expect(run.body).toMatchObject({ sent: 3, failed: 0, alreadySent: 0 });
    const text = rec.sent.map((m) => m.body).join('\n');
    expect(text).toContain(`loan ${upcoming} instalment 1`);
    expect(text).toContain(`due on ${nairobiDay(3)}`);
    expect(text).toContain(`loan ${dueToday}`);
    expect(text).toMatch(new RegExp(`loan ${week} instalment 1 \\(KSh [\\d,.]+\\) is 7 days overdue`));
    expect(text).not.toContain(odd);

    const again = await post(s.accountant.auth, '/v1/reminders/run', { upcomingDays: 3 });
    expect(again.body).toMatchObject({ sent: 0, alreadySent: 3 });
    expect(rec.sent).toHaveLength(3);
    expect((await post(s.teller.auth, '/v1/reminders/run', {})).status).toBe(403);
    await assertLedgerBalanced(t);
  });

  it('records a provider failure instead of pretending the message went', async () => {
    const t = await newTenant('Reminder Failure');
    const s = await fullStaff(t);
    setProvider({ name: 'broken', send: async () => ({ status: 'failed', error: 'down' }) });
    const p = await makeProduct(t.owner.auth, { method: 'flat', annualRateBp: 1200 });
    const m = await makeMember(t.owner.auth);
    await lendUntil(s, m.id, p, K(6_000), 3, 'disbursed', nairobiDay(-30), { firstDueDate: nairobiDay(-1) });
    const run = await post(s.accountant.auth, '/v1/reminders/run', {});
    expect(run.body).toMatchObject({ sent: 0, failed: 1 });
    void MockProvider;
  });
});

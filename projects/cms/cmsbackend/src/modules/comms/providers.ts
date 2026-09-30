/**
 * Delivery providers behind one interface each. SMS_MODE=mock (the default) records messages in
 * memory and sends nothing; africastalking calls the real gateway. Nothing in the domain code
 * knows which one is live.
 */
export interface SendResult {
  providerRef: string;
}

export interface SmsProvider {
  send(to: string, body: string): Promise<SendResult>;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<SendResult>;
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const mockOutbox: Array<{ channel: 'SMS' | 'EMAIL'; to: string; subject?: string; body: string }> = [];

export class MockSmsProvider implements SmsProvider {
  async send(to: string, body: string): Promise<SendResult> {
    mockOutbox.push({ channel: 'SMS', to, body });
    return { providerRef: `mock-sms-${mockOutbox.length}` };
  }
}

export class MockEmailProvider implements EmailProvider {
  async send(to: string, subject: string, body: string): Promise<SendResult> {
    mockOutbox.push({ channel: 'EMAIL', to, subject, body });
    return { providerRef: `mock-email-${mockOutbox.length}` };
  }
}

export interface AfricasTalkingConfig {
  username: string;
  apiKey: string;
  senderId?: string;
  sandbox?: boolean;
  fetchImpl?: FetchLike;
}

/** Africa's Talking bulk SMS. Status codes 100-102 mean accepted; anything else is a failure. */
export class AfricasTalkingSmsProvider implements SmsProvider {
  constructor(private readonly config: AfricasTalkingConfig) {}

  async send(to: string, body: string): Promise<SendResult> {
    const host = this.config.sandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const form = new URLSearchParams({ username: this.config.username, to, message: body });
    if (this.config.senderId) form.set('from', this.config.senderId);
    const fetchImpl = this.config.fetchImpl ?? ((globalThis as any).fetch as FetchLike);
    const response = await fetchImpl(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: this.config.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Africa's Talking answered HTTP ${response.status}`);
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Africa's Talking returned a response that is not JSON");
    }
    const recipient = parsed?.SMSMessageData?.Recipients?.[0];
    if (!recipient) throw new Error(`Africa's Talking accepted nothing: ${parsed?.SMSMessageData?.Message ?? 'no recipients'}`);
    const code = Number(recipient.statusCode);
    if (code < 100 || code > 102) throw new Error(`Africa's Talking rejected the message: ${recipient.status ?? code}`);
    return { providerRef: String(recipient.messageId ?? 'unknown') };
  }
}

/** Generic JSON-over-HTTP mail relay (any transactional provider with a simple endpoint). */
export class HttpEmailProvider implements EmailProvider {
  constructor(private readonly url: string, private readonly token: string, private readonly from: string, private readonly fetchImpl?: FetchLike) {}

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    const fetchImpl = this.fetchImpl ?? ((globalThis as any).fetch as FetchLike);
    const response = await fetchImpl(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to, subject, text: body })
    });
    if (!response.ok) throw new Error(`mail relay answered HTTP ${response.status}`);
    const parsed = JSON.parse((await response.text()) || '{}');
    return { providerRef: String(parsed.id ?? parsed.messageId ?? 'relay') };
  }
}

let smsOverride: SmsProvider | null = null;
let emailOverride: EmailProvider | null = null;

/** Tests inject stubs here. */
export function setProviders(sms: SmsProvider | null, email: EmailProvider | null): void {
  smsOverride = sms;
  emailOverride = email;
}

export function getSmsProvider(): SmsProvider {
  if (smsOverride) return smsOverride;
  if (process.env.SMS_MODE === 'africastalking') {
    const username = process.env.AT_USERNAME;
    const apiKey = process.env.AT_API_KEY;
    if (!username || !apiKey) throw new Error('SMS_MODE=africastalking needs AT_USERNAME and AT_API_KEY');
    return new AfricasTalkingSmsProvider({ username, apiKey, senderId: process.env.AT_SENDER_ID, sandbox: process.env.AT_SANDBOX === 'true' });
  }
  return new MockSmsProvider();
}

export function getEmailProvider(): EmailProvider {
  if (emailOverride) return emailOverride;
  if (process.env.EMAIL_MODE === 'http') {
    const url = process.env.EMAIL_HTTP_URL;
    const token = process.env.EMAIL_HTTP_TOKEN;
    if (!url || !token) throw new Error('EMAIL_MODE=http needs EMAIL_HTTP_URL and EMAIL_HTTP_TOKEN');
    return new HttpEmailProvider(url, token, process.env.EMAIL_FROM ?? 'noreply@localhost');
  }
  return new MockEmailProvider();
}

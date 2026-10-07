/**
 * Outbound messages (verification codes, billing reminders) go through one interface so a provider is a single class,
 * not a change to every caller.
 *
 * `mock` records and logs the message so an operator can relay a code by hand during a pilot. `africastalking` sends SMS
 * through Africa's Talking's bulk SMS HTTP API. That class was written from the provider's public documentation and has
 * only been exercised against a stub server in tests: it has NOT been run against the real service (or its sandbox), and
 * no account, sender id or delivery report has been checked. Treat it as unverified until one real code has arrived.
 */
import { withoutTenant } from '../persistence/pool';
import { logger } from '../common/logger';
import { env } from '../config/env';

export type MessagePurpose = 'signup-code' | 'billing-reminder';

export interface OutboundMessage {
  to: string;
  purpose: MessagePurpose;
  body: string;
}

export type DeliveryOutcome = { status: 'sent' | 'logged' } | { status: 'failed'; error: string };

export interface MessageProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<DeliveryOutcome>;
}

export class MockProvider implements MessageProvider {
  readonly name = 'mock';

  async send(message: OutboundMessage): Promise<DeliveryOutcome> {
    // The body is deliberately in the log: with no real provider this is how an operator reads
    // a code to relay. A real provider must never log a code.
    logger.info('message logged, not sent', { to: message.to, purpose: message.purpose, body: message.body });
    return { status: 'logged' };
  }
}

export interface AfricasTalkingConfig {
  username: string;
  apiKey: string;
  baseUrl: string;
  senderId?: string;
  timeoutMs: number;
}

/** Statuses Africa's Talking documents as accepted for delivery: 100 Processed, 101 Sent, 102 Queued. */
const AT_ACCEPTED = new Set([100, 101, 102]);

export class AfricasTalkingProvider implements MessageProvider {
  readonly name = 'africastalking';

  constructor(private readonly config: AfricasTalkingConfig) {}

  async send(message: OutboundMessage): Promise<DeliveryOutcome> {
    // our numbers are stored as 254XXXXXXXXX; the API wants +254XXXXXXXXX
    const to = message.to.startsWith('+') ? message.to : `+${message.to}`;
    const form = new URLSearchParams({ username: this.config.username, to, message: message.body });
    if (this.config.senderId) form.set('from', this.config.senderId);
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/version1/messaging`, {
        method: 'POST',
        headers: { apiKey: this.config.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
    } catch (error) {
      return { status: 'failed', error: `request to the SMS provider failed: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (!response.ok) return { status: 'failed', error: `the SMS provider answered HTTP ${response.status}` };
    let body: any;
    try {
      body = await response.json();
    } catch {
      return { status: 'failed', error: 'the SMS provider answered with something that is not JSON' };
    }
    // never log the message: it carries a verification code
    const recipient = body?.SMSMessageData?.Recipients?.[0];
    if (!recipient) return { status: 'failed', error: `the SMS provider accepted no recipient (${String(body?.SMSMessageData?.Message ?? 'no detail')})` };
    if (!AT_ACCEPTED.has(Number(recipient.statusCode))) return { status: 'failed', error: `the SMS provider refused the number: ${String(recipient.status ?? recipient.statusCode)}` };
    logger.info('sms handed to provider', { purpose: message.purpose, messageId: recipient.messageId });
    return { status: 'sent' };
  }
}

let active: MessageProvider | null = null;

export function provider(): MessageProvider {
  if (!active) {
    active = env.NOTIFY_MODE === 'africastalking'
      ? new AfricasTalkingProvider({ username: env.AT_USERNAME!, apiKey: env.AT_API_KEY!, baseUrl: env.AT_BASE_URL, senderId: env.AT_SENDER_ID, timeoutMs: env.AT_TIMEOUT_MS })
      : new MockProvider();
  }
  return active;
}

/** Test seam: swap the provider. */
export function setProvider(next: MessageProvider | null): void {
  active = next;
}

const RETENTION_HOURS = 24;

export interface SendResult {
  id: string;
  status: 'sent' | 'logged' | 'failed';
}

/**
 * Records the message, hands it to the provider, records the outcome. Verification codes are short
 * lived, so messages older than a day are purged on every send rather than kept for ever.
 */
export async function sendMessage(message: OutboundMessage): Promise<SendResult> {
  const chosen = provider();
  const id = await withoutTenant(async (client) => {
    await client.query(`DELETE FROM outbound_messages WHERE created_at < now() - ($1 || ' hours')::interval`, [String(RETENTION_HOURS)]);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO outbound_messages (to_phone, purpose, body, provider, status) VALUES ($1, $2, $3, $4, 'queued') RETURNING id`,
      [message.to, message.purpose, message.body, chosen.name]
    );
    return rows[0]!.id;
  });

  let outcome: DeliveryOutcome;
  try {
    outcome = await chosen.send(message);
  } catch (error) {
    outcome = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }

  await withoutTenant((client) =>
    client.query(`UPDATE outbound_messages SET status = $2, error = $3 WHERE id = $1`, [
      id,
      outcome.status,
      outcome.status === 'failed' ? outcome.error : null
    ])
  );
  return { id, status: outcome.status };
}

export interface RecentMessage {
  id: string;
  to: string;
  purpose: string;
  body: string;
  status: string;
  createdAt: Date;
}

export async function recentMessages(limit = 20): Promise<RecentMessage[]> {
  return withoutTenant(async (client) => {
    const { rows } = await client.query(
      `SELECT id, to_phone, purpose, body, status, created_at FROM outbound_messages ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map((row) => ({ id: row.id, to: row.to_phone, purpose: row.purpose, body: row.body, status: row.status, createdAt: row.created_at }));
  });
}


/**
 * The seam where Dawa would talk to the national track-and-trace platforms (NTTS, with Practice360 and Facility360
 * for licensing) - and nothing else.
 *
 * NO INTEGRATION EXISTS. As of this writing no interface specification, payload format, authentication scheme or
 * certification process for those platforms has been published to Dawa, and none is assumed here. The only adapter
 * is `NotIntegratedAdapter`, which refuses to send and says why. Everything a report would need is captured in
 * `ntts_outbox` in the same transaction as the stock change, so when a specification is published an adapter can be
 * written against it and the history replayed. Until then the log can be exported as plain CSV; that file is Dawa's
 * own format and is NOT an official submission.
 */
import { PoolClient } from 'pg';
import { env } from '../config/env';

export interface TrackAndTraceEvent {
  id: number;
  eventType: string;
  gtin: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  serial: string | null;
  qty: number;
  occurredAt: Date;
}

export class NotIntegratedError extends Error {
  constructor() {
    super('Dawa is not integrated with the national track-and-trace platforms. No specification has been published to it, so nothing is sent.');
  }
}

export interface TrackAndTraceAdapter {
  readonly name: string;
  readonly integrated: boolean;
  submit(events: TrackAndTraceEvent[]): Promise<void>;
}

export class NotIntegratedAdapter implements TrackAndTraceAdapter {
  readonly name = 'not-integrated';
  readonly integrated = false;
  async submit(): Promise<void> {
    throw new NotIntegratedError();
  }
}

let active: TrackAndTraceAdapter = new NotIntegratedAdapter();
export const adapter = (): TrackAndTraceAdapter => active;
/** Test seam, and the place a real adapter is installed once a specification exists. */
export function setAdapter(next: TrackAndTraceAdapter): void {
  active = next;
}

export async function status(client: PoolClient, branchId: string | null) {
  const row = (
    await client.query(
      `SELECT count(*)::int AS pending, to_char(min(occurred_at), 'YYYY-MM-DD') AS oldest FROM ntts_outbox WHERE ($1::uuid IS NULL OR branch_id = $1) AND status = 'pending'`,
      [branchId]
    )
  ).rows[0];
  return {
    integrated: adapter().integrated,
    adapter: adapter().name,
    pendingEvents: row.pending as number,
    oldestPending: row.oldest as string | null,
    notice:
      'Dawa is NOT connected to the national track-and-trace platforms: no interface has been published to it. It records what such a report would contain, ' +
      'and you can export that log. The export is Dawa\'s own format and is not an official submission. Register on the government platforms yourself as the Ministry requires.',
    expiryWarningDays: env.EXPIRY_WARNING_DAYS
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  // a leading = + - @ would be run as a formula by a spreadsheet; neutralise it
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Dawa's internal activity log as CSV. Not an official format. */
export async function exportCsv(client: PoolClient, branchId: string | null, from: string, to: string): Promise<string> {
  const rows = (
    await client.query(
      `SELECT o.id, o.occurred_at, b.code AS branch, o.event_type, p.name AS product, o.gtin, o.batch_no, to_char(o.expiry_date, 'YYYY-MM-DD') AS expiry_date, o.serial, o.qty
         FROM ntts_outbox o JOIN products p ON p.id = o.product_id JOIN branches b ON b.id = o.branch_id
        WHERE ($1::uuid IS NULL OR o.branch_id = $1) AND (o.occurred_at AT TIME ZONE b.timezone)::date BETWEEN $2 AND $3 ORDER BY o.id LIMIT 100000`,
      [branchId, from, to]
    )
  ).rows;
  const header = ['id', 'occurred_at', 'branch', 'event', 'product', 'gtin', 'batch_no', 'expiry_date', 'serial', 'qty'];
  const lines = [header.join(',')];
  for (const r of rows) lines.push([r.id, r.occurred_at, r.branch, r.event_type, r.product, r.gtin, r.batch_no, r.expiry_date, r.serial, r.qty].map(csvCell).join(','));
  return `${lines.join('\n')}\n`;
}

export async function listEvents(client: PoolClient, branchId: string | null, limit = 100): Promise<TrackAndTraceEvent[]> {
  const rows = (
    await client.query(
      `SELECT id, event_type, gtin, batch_no, to_char(expiry_date, 'YYYY-MM-DD') AS expiry_date, serial, qty, occurred_at
         FROM ntts_outbox WHERE ($1::uuid IS NULL OR branch_id = $1) ORDER BY id DESC LIMIT $2`,
      [branchId, Math.min(limit, 500)]
    )
  ).rows;
  return rows.map((r) => ({ id: Number(r.id), eventType: r.event_type, gtin: r.gtin, batchNo: r.batch_no, expiryDate: r.expiry_date, serial: r.serial, qty: r.qty, occurredAt: r.occurred_at }));
}

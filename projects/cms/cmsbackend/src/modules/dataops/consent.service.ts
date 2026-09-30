import { Transaction } from 'sequelize';
import { assertMember, camel, insertRow, select } from '../ops-kit';

export const CONSENT_PURPOSES = ['COMMUNICATIONS', 'DATA_PROCESSING', 'PHOTOS', 'GIVING_RECORDS', 'CHILD_CHECKIN'] as const;
export type Channel = 'SMS' | 'EMAIL' | 'ANY';

export interface ConsentInput {
  memberId: number;
  purpose: string;
  channel: Channel;
  granted: boolean;
  source: string;
  userId?: number | null;
  notes?: string | null;
}

/** Consent is an append-only history: withdrawing adds a record, it never edits the old one. */
export async function recordConsent(t: Transaction, churchId: number, input: ConsentInput): Promise<number> {
  await assertMember(t, churchId, input.memberId);
  return insertRow(
    t,
    'consent_records',
    churchId,
    {
      member_id: input.memberId,
      purpose: input.purpose,
      channel: input.channel,
      granted: input.granted,
      source: input.source,
      recorded_by_user_id: input.userId ?? null,
      notes: input.notes ?? null,
      recorded_at: new Date()
    },
    false
  );
}

export async function listConsents(t: Transaction, churchId: number, memberId: number) {
  const rows = await select<any>(t, `SELECT * FROM consent_records WHERE church_id = ? AND member_id = ? ORDER BY id DESC`, [churchId, memberId]);
  return rows.map((r) => camel(r, { bools: ['granted'] }));
}

/**
 * Members who must not be contacted on this channel for this purpose: the most recent applicable
 * record (this channel or ANY) says "not granted". With COMMS_REQUIRE_CONSENT=true the absence of
 * any granting record also suppresses, for churches that run strictly opt-in.
 */
export async function suppressedMembers(t: Transaction, churchId: number, memberIds: number[], channel: 'SMS' | 'EMAIL', purpose = 'COMMUNICATIONS'): Promise<Set<number>> {
  const strict = process.env.COMMS_REQUIRE_CONSENT === 'true';
  const latest = new Map<number, boolean>();
  for (let i = 0; i < memberIds.length; i += 500) {
    const chunk = memberIds.slice(i, i + 500);
    const rows = await select<any>(
      t,
      `SELECT member_id, granted FROM consent_records WHERE church_id = ? AND purpose = ? AND channel IN (?, 'ANY') AND member_id IN (${chunk.map(() => '?').join(',')}) ORDER BY id`,
      [churchId, purpose, channel, ...chunk]
    );
    for (const row of rows) latest.set(Number(row.member_id), row.granted === true || row.granted === 1);
  }
  const out = new Set<number>();
  for (const id of memberIds) {
    const state = latest.get(id);
    if (state === false || (strict && state !== true)) out.add(id);
  }
  return out;
}

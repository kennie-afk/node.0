import { createHmac, timingSafeEqual } from 'node:crypto';
import { Transaction } from 'sequelize';
import { env } from '../../config/env';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { assertRef, getRow, insertRow, select } from '../ops-kit';

/**
 * Member QR cards. The code carries no personal data, only "church.member.signature". The signature is an
 * HMAC under the server secret, so a code cannot be forged or guessed from a member id. Codes are stateless:
 * a lost card is handled by the usher seeing the photo/name on screen, not by revoking the code.
 */
const PREFIX = 'hq1';
const sign = (churchId: number, memberId: number) => createHmac('sha256', env.JWT_SECRET).update(`memberqr|${churchId}|${memberId}`).digest('base64url').slice(0, 22);

export function memberToken(churchId: number, memberId: number): string {
  return `${PREFIX}.${churchId}.${memberId}.${sign(churchId, memberId)}`;
}

/** Returns the member id for a valid code issued by this church, or null for anything else. */
export function parseToken(churchId: number, raw: string): number | null {
  const parts = raw.trim().split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const [, c, m, sig] = parts;
  if (!/^\d{1,10}$/.test(c) || !/^\d{1,10}$/.test(m) || Number(c) !== churchId) return null;
  const expected = Buffer.from(sign(churchId, Number(m)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Number(m);
}

export async function churchToday(t: Transaction, churchId: number): Promise<string> {
  const row = (await select<any>(t, 'SELECT timezone FROM churches WHERE id = ?', [churchId]))[0];
  try { return new Date().toLocaleDateString('en-CA', { timeZone: row?.timezone ?? 'Africa/Nairobi' }); } catch { return new Date().toISOString().slice(0, 10); }
}

export async function cardFor(t: Transaction, churchId: number, memberId: number) {
  const m = await getRow(t, 'members', churchId, memberId, 'member');
  return { memberId, name: `${m.first_name} ${m.last_name}`, token: memberToken(churchId, memberId) };
}

export interface ScanInput { token: string; eventId?: number | null; sermonId?: number | null; date?: string }

/** Marks the scanned member present. Scanning the same card twice for the same occasion reports it instead of duplicating. */
export async function scan(t: Transaction, churchId: number, i: ScanInput) {
  const memberId = parseToken(churchId, i.token);
  if (!memberId) throw new BadRequestError('This is not a valid member code for this church');
  const m = (await select<any>(t, 'SELECT id, first_name, last_name, profile_picture_url FROM members WHERE church_id = ? AND id = ?', [churchId, memberId]))[0];
  if (!m) throw new NotFoundError('That member no longer exists');
  await assertRef(t, 'events', churchId, i.eventId, 'eventId');
  await assertRef(t, 'sermons', churchId, i.sermonId, 'sermonId');
  const date = i.date ?? (await churchToday(t, churchId));
  const member = { id: m.id, name: `${m.first_name} ${m.last_name}`, photoUrl: m.profile_picture_url ?? null };
  const existing = (await select<any>(t,
    'SELECT id FROM attendance WHERE church_id = ? AND member_id = ? AND attendance_date = ? AND event_id IS NOT DISTINCT FROM ? AND sermon_id IS NOT DISTINCT FROM ? LIMIT 1',
    [churchId, memberId, date, i.eventId ?? null, i.sermonId ?? null]))[0];
  if (existing) return { status: 'ALREADY' as const, attendanceId: existing.id, date, member };
  const id = await insertRow(t, 'attendance', churchId, { member_id: memberId, attendance_date: date, event_id: i.eventId ?? null, sermon_id: i.sermonId ?? null, attendance_type: 'In-person', notes: 'QR scan' });
  return { status: 'RECORDED' as const, attendanceId: id, date, member };
}

/** Members whose cards a church can print: paged by id. */
export async function cards(t: Transaction, churchId: number, after: number, limit: number) {
  const rows = await select<any>(t, 'SELECT id, first_name, last_name FROM members WHERE church_id = ? AND id > ? ORDER BY id LIMIT ?', [churchId, after, limit]);
  return rows.map((m) => ({ memberId: m.id, name: `${m.first_name} ${m.last_name}`, token: memberToken(churchId, m.id) }));
}

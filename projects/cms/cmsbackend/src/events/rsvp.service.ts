/**
 * Event registration. A registration is for one OCCURRENCE (a date) of an event, so a weekly
 * class can be booked per week. Capacity applies per occurrence and counts seats (party size).
 * When an occurrence is full a registration joins the waitlist; when seats free up, waitlisted
 * registrations are promoted first-in-first-out (a later, smaller party may take a seat an earlier,
 * larger one could not use; seats are never held back).
 *
 * The event row is locked for the duration of a booking or cancellation, so two people taking the
 * last seat at once cannot both get it.
 */
import { Transaction } from 'sequelize';
import { exec, forUpdate, select, selectOne } from '../modules/finance/sql';
import { insertReturningId } from '../modules/giving/shared';
import { toInt } from '../common/money';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors';
import { expand, parseRule } from './recurrence';

export interface EventRow {
  id: number;
  name: string;
  startTime: Date;
  capacity: number | null;
  isRecurring: boolean;
  recurrencePattern: string | null;
}

export async function loadEvent(t: Transaction, churchId: number, id: number, lock = false): Promise<EventRow> {
  const row = await selectOne<any>(t, `SELECT id, name, start_time, capacity, is_recurring, recurrence_pattern FROM events WHERE church_id = :churchId AND id = :id ${lock ? forUpdate() : ''}`, { churchId, id });
  if (!row) throw new NotFoundError(`Event ${id} was not found in this church`);
  return { id: toInt(row.id), name: row.name, startTime: new Date(row.start_time), capacity: row.capacity === null ? null : toInt(row.capacity), isRecurring: row.is_recurring === true || row.is_recurring === 1, recurrencePattern: row.recurrence_pattern };
}

/** Occurrence start instants of one event inside a window; a non-recurring event has just its own start. */
export function occurrencesOf(event: EventRow, from: string, to: string, limit = 500): { starts: Date[]; truncated: boolean } {
  const parsed = event.isRecurring && event.recurrencePattern ? parseRule(event.recurrencePattern) : null;
  if (parsed && 'rule' in parsed) return expand(parsed.rule, event.startTime, from, to, limit);
  // One-off events, and recurring ones whose pattern is legacy free text, count as a single occurrence.
  const day = event.startTime.toISOString().slice(0, 10);
  return { starts: day >= from && day <= to ? [event.startTime] : [], truncated: false };
}

/** The event must really occur on this date, or a seat could be booked on a day nothing happens. */
function assertOccurs(event: EventRow, date: string) {
  if (occurrencesOf(event, date, date, 1).starts.length === 0) throw new BadRequestError(`${event.name} does not take place on ${date}`);
}

const seatsTaken = async (t: Transaction, churchId: number, eventId: number, date: string) =>
  toInt((await selectOne<any>(t, `SELECT COALESCE(SUM(party_size), 0) AS n FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND occurrence_date = :date AND status = 'GOING'`, { churchId, eventId, date }))?.n);

export interface RsvpInput {
  occurrenceDate: string;
  memberId?: number | null;
  guestName?: string | null;
  partySize?: number;
  note?: string | null;
}

export async function register(t: Transaction, churchId: number, actorId: number | null, eventId: number, input: RsvpInput) {
  const event = await loadEvent(t, churchId, eventId, true);
  assertOccurs(event, input.occurrenceDate);
  const partySize = input.partySize ?? 1;
  if (event.capacity !== null && partySize > event.capacity) throw new BadRequestError(`a party of ${partySize} can never fit in ${event.capacity} seats`);
  if (input.memberId) {
    const member = await selectOne(t, `SELECT id FROM members WHERE church_id = :churchId AND id = :id`, { churchId, id: input.memberId });
    if (!member) throw new BadRequestError('memberId does not refer to a member in this church');
    const dup = await selectOne(t, `SELECT id FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND occurrence_date = :date AND member_id = :memberId AND status <> 'CANCELLED'`, { churchId, eventId, date: input.occurrenceDate, memberId: input.memberId });
    if (dup) throw new ConflictError('that member is already registered for this date');
  }
  const taken = await seatsTaken(t, churchId, eventId, input.occurrenceDate);
  const fits = event.capacity === null || taken + partySize <= event.capacity;
  const now = new Date();
  const id = await insertReturningId(
    t,
    `INSERT INTO event_rsvps (church_id, event_id, occurrence_date, member_id, guest_name, party_size, status, note, created_by, created_at, updated_at)
     VALUES (:churchId, :eventId, :date, :memberId, :guest, :party, :status, :note, :actor, :now, :now)`,
    { churchId, eventId, date: input.occurrenceDate, memberId: input.memberId ?? null, guest: input.guestName ?? null, party: partySize, status: fits ? 'GOING' : 'WAITLIST', note: input.note ?? null, actor: actorId, now }
  );
  return getRsvp(t, churchId, eventId, id);
}

export async function getRsvp(t: Transaction, churchId: number, eventId: number, id: number) {
  const row = await selectOne<any>(t, `${RSVP_SELECT} WHERE r.church_id = :churchId AND r.event_id = :eventId AND r.id = :id`, { churchId, eventId, id });
  if (!row) throw new NotFoundError(`Registration ${id} was not found for this event`);
  return dto(row);
}

const RSVP_SELECT = `SELECT r.id, r.event_id, r.occurrence_date, r.member_id, r.guest_name, r.party_size, r.status, r.note, r.created_at, m.first_name, m.last_name
  FROM event_rsvps r LEFT JOIN members m ON m.church_id = r.church_id AND m.id = r.member_id`;

function dto(r: any) {
  return {
    id: toInt(r.id),
    eventId: toInt(r.event_id),
    occurrenceDate: String(r.occurrence_date).slice(0, 10),
    memberId: r.member_id === null ? null : toInt(r.member_id),
    name: r.member_id === null ? r.guest_name : `${r.first_name} ${r.last_name}`,
    partySize: toInt(r.party_size),
    status: r.status as 'GOING' | 'WAITLIST' | 'CANCELLED',
    note: r.note ?? null,
    createdAt: new Date(r.created_at).toISOString()
  };
}

/** The roster of one occurrence, with seats used and left, and each waitlisted party's position. */
export async function roster(t: Transaction, churchId: number, eventId: number, date: string) {
  const event = await loadEvent(t, churchId, eventId);
  const rows = await select<any>(t, `${RSVP_SELECT} WHERE r.church_id = :churchId AND r.event_id = :eventId AND r.occurrence_date = :date AND r.status <> 'CANCELLED' ORDER BY r.id`, { churchId, eventId, date });
  const items = rows.map(dto);
  let position = 0;
  const data = items.map((r) => (r.status === 'WAITLIST' ? { ...r, waitlistPosition: ++position } : { ...r, waitlistPosition: null }));
  const taken = items.filter((r) => r.status === 'GOING').reduce((s, r) => s + r.partySize, 0);
  return { eventId, occurrenceDate: date, capacity: event.capacity, seatsTaken: taken, seatsLeft: event.capacity === null ? null : Math.max(event.capacity - taken, 0), waitlisted: position, data };
}

/** Cancels, then offers the freed seats to the waitlist in order. Returns the registrations that were promoted. */
export async function cancel(t: Transaction, churchId: number, eventId: number, id: number) {
  const event = await loadEvent(t, churchId, eventId, true);
  const row = await selectOne<any>(t, `SELECT id, occurrence_date, status FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND id = :id`, { churchId, eventId, id });
  if (!row) throw new NotFoundError(`Registration ${id} was not found for this event`);
  if (row.status === 'CANCELLED') return { cancelled: id, promoted: [] as number[] };
  const date = String(row.occurrence_date).slice(0, 10);
  await exec(t, `UPDATE event_rsvps SET status = 'CANCELLED', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id });
  const promoted: number[] = [];
  if (event.capacity !== null && row.status === 'GOING') {
    let taken = await seatsTaken(t, churchId, eventId, date);
    const waiting = await select<any>(t, `SELECT id, party_size FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND occurrence_date = :date AND status = 'WAITLIST' ORDER BY id`, { churchId, eventId, date });
    for (const w of waiting) {
      const size = toInt(w.party_size);
      if (taken + size <= event.capacity) {
        await exec(t, `UPDATE event_rsvps SET status = 'GOING', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id: toInt(w.id) });
        taken += size;
        promoted.push(toInt(w.id));
      }
    }
  }
  return { cancelled: id, promoted };
}

/** Changing capacity may free seats (promote) or leave the room over-subscribed (existing seats are kept). */
export async function promoteWaitlist(t: Transaction, churchId: number, eventId: number): Promise<number[]> {
  const event = await loadEvent(t, churchId, eventId, true);
  if (event.capacity === null) {
    const all = await select<any>(t, `SELECT id FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND status = 'WAITLIST'`, { churchId, eventId });
    for (const r of all) await exec(t, `UPDATE event_rsvps SET status = 'GOING', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id: toInt(r.id) });
    return all.map((r) => toInt(r.id));
  }
  const dates = await select<any>(t, `SELECT DISTINCT occurrence_date FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND status = 'WAITLIST'`, { churchId, eventId });
  const promoted: number[] = [];
  for (const d of dates) {
    const date = String(d.occurrence_date).slice(0, 10);
    let taken = await seatsTaken(t, churchId, eventId, date);
    const waiting = await select<any>(t, `SELECT id, party_size FROM event_rsvps WHERE church_id = :churchId AND event_id = :eventId AND occurrence_date = :date AND status = 'WAITLIST' ORDER BY id`, { churchId, eventId, date });
    for (const w of waiting) {
      const size = toInt(w.party_size);
      if (taken + size <= event.capacity) {
        await exec(t, `UPDATE event_rsvps SET status = 'GOING', updated_at = :now WHERE church_id = :churchId AND id = :id`, { now: new Date(), churchId, id: toInt(w.id) });
        taken += size;
        promoted.push(toInt(w.id));
      }
    }
  }
  return promoted;
}

/** Occurrences of every event in a window, newest data first being irrelevant: sorted by start. */
export async function occurrencesInWindow(t: Transaction, churchId: number, from: string, to: string) {
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (!(days >= 0) || days > 366) throw new BadRequestError('the window must be between 0 and 366 days');
  const toExclusive = `${to}T23:59:59.999Z`;
  const rows = await select<any>(
    t,
    `SELECT id, name, type, start_time, end_time, location, capacity, is_recurring, recurrence_pattern FROM events
      WHERE church_id = :churchId AND ((is_recurring = :no AND start_time >= :fromTs AND start_time <= :toTs) OR (is_recurring = :yes AND start_time <= :toTs))
      ORDER BY start_time, id LIMIT 2000`,
    { churchId, no: false, yes: true, fromTs: new Date(`${from}T00:00:00Z`), toTs: new Date(toExclusive) }
  );
  const out: Array<{ eventId: number; name: string; type: string | null; startsAt: string; endsAt: string | null; date: string; location: string | null; capacity: number | null; recurring: boolean }> = [];
  let truncated = false;
  for (const r of rows) {
    const event: EventRow = { id: toInt(r.id), name: r.name, startTime: new Date(r.start_time), capacity: r.capacity === null ? null : toInt(r.capacity), isRecurring: r.is_recurring === true || r.is_recurring === 1, recurrencePattern: r.recurrence_pattern };
    const duration = r.end_time ? new Date(r.end_time).getTime() - event.startTime.getTime() : null;
    const { starts, truncated: more } = occurrencesOf(event, from, to, 366);
    truncated = truncated || more;
    for (const s of starts) {
      out.push({ eventId: event.id, name: event.name, type: r.type ?? null, startsAt: s.toISOString(), endsAt: duration === null ? null : new Date(s.getTime() + duration).toISOString(), date: s.toISOString().slice(0, 10), location: r.location ?? null, capacity: event.capacity, recurring: event.isRecurring });
    }
  }
  out.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.eventId - b.eventId);
  if (out.length > 1000) truncated = true;
  return { from, to, truncated, data: out.slice(0, 1000) };
}

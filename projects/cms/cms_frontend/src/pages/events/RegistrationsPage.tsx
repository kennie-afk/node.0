import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Card, Combobox, DataTable, ErrorState, Field, formatDate, Input, InlineConfirm, PageHeader, PageLoader, Select, StatusPill, todayISO, useQuery, useToast, type ComboOption } from '../../ui';
import { http, normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { searchMembers } from '../../api/memberLookup';
import type { Event, Occurrence, Roster, Rsvp } from '../../api/eventApi';

const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Registrations for one event: pick a date, see seats and the waitlist, register people, cancel. */
export default function RegistrationsPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const writable = can('members:write');
  const event = useQuery(() => http.get<Event>(`/events/${id}`), [id]);
  const dates = useQuery(() => http.get<{ data: Occurrence[] }>('/events/occurrences', { from: todayISO(), to: plusDays(todayISO(), 120) }), [id]);
  const mine = useMemo(() => (dates.data?.data ?? []).filter((o) => o.eventId === id), [dates.data, id]);
  const [picked, setPicked] = useState('');
  const date = picked || mine[0]?.date || '';
  const roster = useQuery(() => (date ? http.get<Roster>(`/events/${id}/rsvps`, { date }) : Promise.resolve(null)), [id, date]);
  const [who, setWho] = useState<ComboOption<number> | null>(null);
  const [guest, setGuest] = useState('');
  const [party, setParty] = useState('1');
  const [busy, setBusy] = useState(false);

  if (event.error && !event.data) return <div className="ui-page"><ErrorState message={event.error.message} onRetry={event.refetch} requestId={event.error.requestId} /></div>;
  if (!event.data) return <PageLoader />;

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await http.post<Rsvp>(`/events/${id}/rsvps`, { occurrenceDate: date, ...(who ? { memberId: who.value } : { guestName: guest.trim() }), partySize: Number(party) || 1 });
      toast.success(res.status === 'WAITLIST' ? 'Added to the waitlist' : 'Registered');
      setWho(null); setGuest(''); setParty('1');
      roster.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async (r: Rsvp) => {
    try {
      const res = await http.delete<{ promoted: number[] }>(`/events/${id}/rsvps/${r.id}`);
      toast.success(res.promoted.length ? `Cancelled; ${res.promoted.length} moved up from the waitlist` : 'Cancelled');
      roster.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const r = roster.data;
  return (
    <div className="ui-page ui-stack">
      <PageHeader title={`Registrations: ${event.data.name}`} crumbs={[{ label: 'Events', to: '/events' }]} subtitle={r ? (r.capacity ? `${r.seatsTaken} of ${r.capacity} seats taken${r.waitlisted ? `, ${r.waitlisted} on the waitlist` : ''}` : `${r.seatsTaken} registered, no seat limit`) : undefined} />
      <Card>
        <Field label="Date">
          {(c) => (
            <Select {...c} value={date} onChange={(e) => setPicked(e.target.value)} disabled={mine.length === 0}>
              {mine.length === 0 && <option value="">No upcoming dates</option>}
              {mine.map((o) => <option key={o.date} value={o.date}>{formatDate(o.date)}</option>)}
            </Select>
          )}
        </Field>
      </Card>
      {writable && date && (
        <Card title="Register someone">
          <form className="ui-form-grid" onSubmit={register}>
            <Field label="Member">{(c) => <Combobox {...c} search={searchMembers} value={who} onChange={setWho} placeholder="Search members" />}</Field>
            <Field label="Or a guest" hint="Used when no member is chosen">{(c) => <Input {...c} value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={150} disabled={Boolean(who)} />}</Field>
            <Field label="Seats">{(c) => <Input {...c} type="number" min={1} max={20} value={party} onChange={(e) => setParty(e.target.value)} />}</Field>
            <div className="ui-form-actions"><Button type="submit" variant="primary" loading={busy} disabled={!who && guest.trim().length < 2}>Register</Button></div>
          </form>
        </Card>
      )}
      <Card title="Who is coming" flush>
        <DataTable<Rsvp>
          rowKey={(x) => x.id}
          rows={r?.data ?? []}
          loading={roster.loading && !r}
          error={roster.error && !r ? roster.error : null}
          onRetry={roster.refetch}
          empty={<span>{date ? 'Nobody has registered for this date yet.' : 'This event has no upcoming dates.'}</span>}
          columns={[
            { key: 'name', header: 'Name', render: (x) => x.name ?? '-' },
            { key: 'party', header: 'Seats', numeric: true, render: (x) => x.partySize },
            { key: 'status', header: 'Status', render: (x) => (x.status === 'WAITLIST' ? <StatusPill status="WAITLIST" /> : <StatusPill status="GOING" />) },
            { key: 'pos', header: 'Waitlist place', numeric: true, render: (x) => x.waitlistPosition ?? '' },
            { key: 'act', header: '', render: (x) => writable && <InlineConfirm label="Cancel" question="Cancel this registration?" confirmLabel="Cancel it" onConfirm={() => cancel(x)} /> }
          ]}
        />
      </Card>
    </div>
  );
}

import { useCallback, useState, type FormEvent } from 'react';
import { Badge, Button, Card, Combobox, DataTable, Field, FilterBar, InlineConfirm, Input, PageHeader, Pagination, SearchInput, Select, Textarea, formatDate, formatDateTime, todayISO, useQuery, useToast, type ComboOption } from '../../ui';
import { http, normalizeError, type ApiError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { createAttendance, deleteAttendance, fetchAttendancePage, updateAttendance, type Attendance, type AttendanceType } from '../../api/attendanceApi';
import { FormError, KeyValue } from '../../features/finance/components/common';
import type { PageOf } from '../../features/resource/types';

const PAGE_SIZE = 25;
export type AttendanceKind = 'general' | 'event' | 'sermon';

const COPY: Record<AttendanceKind, { title: string; subtitle: string; search: string; record: string }> = {
  general: { title: 'Attendance', subtitle: 'Who was present, in person or online, for services, events and sermons.', search: 'Search by member or guest name', record: 'Record attendance' },
  event: { title: 'Event attendance', subtitle: 'Who attended each event.', search: 'Search by member or guest name', record: 'Record event attendance' },
  sermon: { title: 'Sermon attendance', subtitle: 'Who heard each sermon, in the room or online.', search: 'Search by member or guest name', record: 'Record sermon attendance' }
};

// Pickers ask the server for matches; none of these tables is ever loaded whole.
const searchMembers = async (q: string) =>
  (await http.get<PageOf<{ id: number; firstName: string; lastName: string; phoneNumber?: string }>>('/members', { q, pageSize: 10 })).data.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`, meta: m.phoneNumber }));
const searchEvents = async (q: string) =>
  (await http.get<PageOf<{ id: number; name: string; startTime: string }>>('/events', { q, pageSize: 10 })).data.map((e) => ({ value: e.id, label: e.name, meta: formatDate(e.startTime) }));
const searchSermons = async (q: string) =>
  (await http.get<PageOf<{ id: number; title: string; datePreached: string }>>('/sermons', { q, pageSize: 10 })).data.map((s) => ({ value: s.id, label: s.title, meta: formatDate(s.datePreached) }));

type Pick = ComboOption<number> | null;

interface FormState {
  member: Pick;
  guestName: string;
  attendanceDate: string;
  event: Pick;
  sermon: Pick;
  attendanceType: AttendanceType;
  notes: string;
}

const blank = (): FormState => ({ member: null, guestName: '', attendanceDate: todayISO(), event: null, sermon: null, attendanceType: 'In-person', notes: '' });

function fromRecord(r: Attendance): FormState {
  return {
    member: r.memberId ? { value: r.memberId, label: r.attendeeMember ? `${r.attendeeMember.firstName} ${r.attendeeMember.lastName}` : `Member ${r.memberId}` } : null,
    guestName: r.guestName ?? '',
    attendanceDate: r.attendanceDate.slice(0, 10),
    event: r.eventId ? { value: r.eventId, label: r.attendedEvent?.name ?? `Event ${r.eventId}` } : null,
    sermon: r.sermonId ? { value: r.sermonId, label: r.attendedSermon?.title ?? `Sermon ${r.sermonId}` } : null,
    attendanceType: r.attendanceType,
    notes: r.notes ?? ''
  };
}

interface FormProps {
  kind: AttendanceKind;
  record: Attendance | null;
  submitting: boolean;
  error: ApiError | null;
  onSubmit: (values: FormState) => void;
  onCancel: () => void;
}

function AttendanceForm({ kind, record, submitting, error, onSubmit, onCancel }: FormProps) {
  const [v, setV] = useState<FormState>(record ? fromRecord(record) : blank());
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setV((s) => ({ ...s, [key]: value }));
  const hasWho = v.member !== null || v.guestName.trim() !== '';
  const hasWhat = kind === 'event' ? v.event !== null : kind === 'sermon' ? v.sermon !== null : true;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (hasWho && hasWhat && v.attendanceDate) onSubmit(v);
  };
  return (
    <form className="ui-form" onSubmit={submit} aria-label={record ? 'Edit attendance' : 'Record attendance'}>
      <div className="ui-form-grid">
        <Field label="Member" hint="Leave blank for a guest" error={error?.fieldMessage('memberId')}>
          {(c) => <Combobox {...c} search={searchMembers} value={v.member} onChange={(o) => set('member', o)} placeholder="Search members" />}
        </Field>
        <Field label="Guest name" hint="When the person is not a member" error={error?.fieldMessage('guestName')}>
          {(c) => <Input {...c} maxLength={255} value={v.guestName} onChange={(e) => set('guestName', e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Date" required error={error?.fieldMessage('attendanceDate')}>
          {(c) => <Input {...c} type="date" value={v.attendanceDate} onChange={(e) => set('attendanceDate', e.target.value)} />}
        </Field>
        <Field label="Attendance type" required error={error?.fieldMessage('attendanceType')}>
          {(c) => (
            <Select {...c} value={v.attendanceType} onChange={(e) => set('attendanceType', e.target.value as AttendanceType)}>
              <option value="In-person">In person</option>
              <option value="Online">Online</option>
              <option value="Other">Other</option>
            </Select>
          )}
        </Field>
        {kind !== 'sermon' && (
          <Field label="Event" required={kind === 'event'} error={error?.fieldMessage('eventId')}>
            {(c) => <Combobox {...c} search={searchEvents} value={v.event} onChange={(o) => set('event', o)} placeholder="Search events" />}
          </Field>
        )}
        {kind !== 'event' && (
          <Field label="Sermon" required={kind === 'sermon'} error={error?.fieldMessage('sermonId')}>
            {(c) => <Combobox {...c} search={searchSermons} value={v.sermon} onChange={(o) => set('sermon', o)} placeholder="Search sermons" />}
          </Field>
        )}
        <Field label="Notes" className="is-wide" error={error?.fieldMessage('notes')}>
          {(c) => <Textarea {...c} rows={2} value={v.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
      {!hasWho && <span className="ui-hint">Choose a member or type a guest name.</span>}
      <FormError error={error} />
      <div className="ui-form-actions">
        <Button type="submit" variant="primary" loading={submitting} disabled={!hasWho || !hasWhat || !v.attendanceDate}>Save</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

interface EventDetail { id: number; name: string; startTime: string; endTime?: string | null; location?: string | null; description?: string | null }
interface SermonDetail { id: number; title: string; datePreached: string; speaker?: { firstName: string; lastName: string } | null; guestSpeakerName?: string | null; summary?: string | null; passageReference?: string | null }

/** The event or sermon behind a record, fetched only when asked for. */
function DetailCard({ target, onClose }: { target: { kind: 'event' | 'sermon'; id: number }; onClose: () => void }) {
  const detail = useQuery(() => http.get<EventDetail & SermonDetail>(`/${target.kind === 'event' ? 'events' : 'sermons'}/${target.id}`), [target.kind, target.id]);
  const d = detail.data;
  const items: Array<[string, React.ReactNode]> = [];
  if (d && target.kind === 'event') {
    items.push(['Name', d.name], ['Starts', formatDateTime(d.startTime)]);
    if (d.endTime) items.push(['Ends', formatDateTime(d.endTime)]);
    if (d.location) items.push(['Location', d.location]);
    if (d.description) items.push(['Description', d.description]);
  } else if (d) {
    items.push(['Title', d.title], ['Preached', formatDate(d.datePreached)]);
    if (d.speaker) items.push(['Speaker', `${d.speaker.firstName} ${d.speaker.lastName}`]);
    if (d.guestSpeakerName) items.push(['Guest speaker', d.guestSpeakerName]);
    if (d.passageReference) items.push(['Passage', d.passageReference]);
    if (d.summary) items.push(['Summary', d.summary]);
  }
  return (
    <Card title={target.kind === 'event' ? 'Event details' : 'Sermon details'} actions={<Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}>
      {detail.loading && !d ? <span className="ui-hint">Loading</span> : detail.error && !d ? <span className="ui-error-text">{detail.error.message}</span> : <KeyValue items={items} />}
    </Card>
  );
}

export default function AttendanceScreen({ kind }: { kind: AttendanceKind }) {
  const copy = COPY[kind];
  const { can } = useAuth();
  const toast = useToast();
  const writable = can('members:write');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [eventFilter, setEventFilter] = useState<Pick>(null);
  const [sermonFilter, setSermonFilter] = useState<Pick>(null);
  const [editing, setEditing] = useState<{ row: Attendance | null } | null>(null);
  const [detail, setDetail] = useState<{ kind: 'event' | 'sermon'; id: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const list = useQuery(
    () => fetchAttendancePage({ page, pageSize: PAGE_SIZE, q: q || undefined, kind: kind === 'general' ? undefined : kind, eventId: eventFilter?.value, sermonId: sermonFilter?.value }),
    [page, q, kind, eventFilter?.value, sermonFilter?.value]
  );
  const onSearch = useCallback((text: string) => {
    setQ(text);
    setPage(1);
  }, []);
  const close = () => {
    setEditing(null);
    setError(null);
  };

  const save = async (v: FormState) => {
    const row = editing?.row ?? null;
    const body = {
      memberId: v.member?.value ?? null,
      guestName: v.guestName.trim() || null,
      attendanceDate: v.attendanceDate,
      eventId: kind === 'sermon' ? null : (v.event?.value ?? null),
      sermonId: kind === 'event' ? null : (v.sermon?.value ?? null),
      attendanceType: v.attendanceType,
      notes: v.notes.trim() || null
    };
    setSubmitting(true);
    setError(null);
    try {
      if (row) await updateAttendance(row.id, body);
      else await createAttendance(body);
      toast.success('Attendance saved');
      close();
      list.refetch();
    } catch (failure) {
      setError(normalizeError(failure));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (row: Attendance) => {
    try {
      await deleteAttendance(row.id);
      toast.success('Attendance deleted');
      if (list.data && list.data.data.length === 1 && page > 1) setPage(page - 1);
      else list.refetch();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  const data = list.data;
  const filtered = q !== '' || eventFilter !== null || sermonFilter !== null;
  const link = (label: string, target: { kind: 'event' | 'sermon'; id: number }) => (
    <Button size="sm" variant="ghost" onClick={() => setDetail(target)}>{label}</Button>
  );

  return (
    <div className="ui-page ui-stack">
      <PageHeader title={copy.title} subtitle={copy.subtitle} actions={writable && <Button variant="primary" size="sm" onClick={() => { setError(null); setEditing({ row: null }); }}>{copy.record}</Button>} />

      {editing && (
        <Card title={editing.row ? 'Edit attendance' : copy.record}>
          <AttendanceForm key={editing.row?.id ?? 'new'} kind={kind} record={editing.row} submitting={submitting} error={error} onSubmit={save} onCancel={close} />
        </Card>
      )}

      {detail && <DetailCard target={detail} onClose={() => setDetail(null)} />}

      <FilterBar>
        <SearchInput onSearch={onSearch} placeholder={copy.search} />
        {kind !== 'sermon' && (
          <div className="ui-field">
            <Combobox search={searchEvents} value={eventFilter} onChange={(o) => { setEventFilter(o); setPage(1); }} placeholder="Filter by event" />
          </div>
        )}
        {kind !== 'event' && (
          <div className="ui-field">
            <Combobox search={searchSermons} value={sermonFilter} onChange={(o) => { setSermonFilter(o); setPage(1); }} placeholder="Filter by sermon" />
          </div>
        )}
      </FilterBar>

      <DataTable
        columns={[
          { key: 'date', header: 'Date', render: (r) => formatDate(r.attendanceDate) },
          {
            key: 'who',
            header: 'Attendee',
            render: (r) => (r.attendeeMember ? <strong>{r.attendeeMember.firstName} {r.attendeeMember.lastName}</strong> : <span><strong>{r.guestName}</strong> <Badge>Guest</Badge></span>)
          },
          { key: 'type', header: 'Type', render: (r) => <Badge tone={r.attendanceType === 'In-person' ? 'ok' : 'info'}>{r.attendanceType === 'In-person' ? 'In person' : r.attendanceType}</Badge> },
          ...(kind !== 'sermon' ? [{ key: 'event', header: 'Event', render: (r: Attendance) => (r.attendedEvent ? link(r.attendedEvent.name, { kind: 'event', id: r.attendedEvent.id }) : '-') }] : []),
          ...(kind !== 'event' ? [{ key: 'sermon', header: 'Sermon', render: (r: Attendance) => (r.attendedSermon ? link(r.attendedSermon.title, { kind: 'sermon', id: r.attendedSermon.id }) : '-') }] : []),
          { key: 'notes', header: 'Notes', render: (r) => r.notes || '-' },
          ...(writable
            ? [{
                key: '_actions',
                header: <span className="ui-sr-only">Actions</span>,
                align: 'right' as const,
                render: (r: Attendance) => (
                  <span className="ui-row" style={{ justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing({ row: r }); }}>Edit</Button>
                    <InlineConfirm label="Delete" question="Delete this record?" confirmLabel="Delete" onConfirm={() => remove(r)} />
                  </span>
                )
              }]
            : [])
        ]}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        loading={list.loading && !data}
        error={list.error && !data ? list.error : null}
        onRetry={list.refetch}
        empty={<span>{filtered ? 'No attendance records match.' : `No attendance recorded yet.${writable ? ` Use “${copy.record}” to add one.` : ''}`}</span>}
        footer={data && data.total > 0 ? <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="records" /> : undefined}
      />
    </div>
  );
}

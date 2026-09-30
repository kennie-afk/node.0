import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Input, PageHeader, Select, Textarea, formatDateTime, useQuery, useToast } from '../../ui';
import { availability, createBooking, listResources, type Recurrence } from '../../api/facilitiesApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { FormBanner, Notice } from '../../features/ops/components/FormBanner';
import { DateTimeInput } from '../../features/ops/components/DateTimeInput';
import { useDebounced } from '../../features/ops/components/useDebounced';
import { useFormSubmit } from '../../features/ops/components/useFormSubmit';
import { isoToLocalDate } from '../../features/ops/lib/dates';

export default function BookingFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { submit, busy, error, fieldError } = useFormSubmit();
  const toast = useToast();
  const resources = useQuery(listResources, []);
  const [resourceId, setResourceId] = useState<number | ''>(params.get('resourceId') ? Number(params.get('resourceId')) : '');
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [freq, setFreq] = useState<Recurrence['freq']>('WEEKLY');
  const [interval, setIntervalN] = useState('1');
  const [count, setCount] = useState('4');

  const range = useDebounced(`${resourceId}|${startsAt}|${endsAt}`, 400);
  const [r, s, e] = range.split('|');
  const validRange = r !== '' && s !== '' && e !== '' && new Date(e) > new Date(s);
  const busySlots = useQuery(() => availability(Number(r), s, e), [range], { enabled: validRange });
  const clashes = busySlots.data?.busy ?? [];
  const resource = resources.data?.find((x) => x.id === resourceId);
  const timeError = startsAt && endsAt && new Date(endsAt) <= new Date(startsAt) ? 'The end must be after the start.' : undefined;
  const series = useMemo(() => Math.min(52, Math.max(2, Number(count) || 2)), [count]);

  return (
    <OpsPage>
      <PageHeader title="New booking" crumbs={[{ label: 'Facilities', to: '/facilities/bookings' }, { label: 'New booking' }]} />
      <form
        className="ui-form"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (resourceId === '') return;
          let result: { count: number; status: string } | null = null;
          const ok = await submit(async () => {
            result = await createBooking({ resourceId, title, startsAt, endsAt, notes: notes.trim() || null, recurrence: repeat ? { freq, interval: Number(interval) || 1, count: series } : undefined });
          });
          if (ok && result) {
            const made = result as { count: number; status: string };
            toast.success(made.status === 'PENDING' ? `${made.count} booking${made.count === 1 ? '' : 's'} held for approval.` : `${made.count} booking${made.count === 1 ? '' : 's'} confirmed.`);
            navigate(`/facilities/bookings?resourceId=${resourceId}&week=${isoToLocalDate(startsAt)}`);
          }
        }}
      >
        <FormBanner error={error} />
        <Field label="Room or item" required>
          {(c) => (
            <Select {...c} value={resourceId} onChange={(ev) => setResourceId(ev.target.value === '' ? '' : Number(ev.target.value))}>
              <option value="">Choose…</option>
              {(resources.data ?? []).filter((x) => x.isActive).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </Select>
          )}
        </Field>
        {resource?.requiresApproval && <Notice tone="info">{resource.name} needs an administrator's approval. The booking is held (shown dashed) until then.</Notice>}
        <Field label="What for" required error={fieldError('title')}>{(c) => <Input {...c} value={title} onChange={(ev) => setTitle(ev.target.value)} maxLength={200} />}</Field>
        <div className="ui-form-grid">
          <Field label="Starts" required error={fieldError('startsAt')}>{(c) => <DateTimeInput {...c} value={startsAt} onChange={(v) => { setStartsAt(v); if (!endsAt && v) setEndsAt(new Date(new Date(v).getTime() + 3600000).toISOString()); }} />}</Field>
          <Field label="Ends" required error={timeError ?? fieldError('endsAt')}>{(c) => <DateTimeInput {...c} value={endsAt} onChange={setEndsAt} />}</Field>
        </div>
        {clashes.length > 0 && (
          <Notice tone="bad" title="This time is already taken">
            {clashes.map((b) => <div key={b.id}>{b.title}: {formatDateTime(b.startsAt)} - {formatDateTime(b.endsAt)} ({b.status.toLowerCase()})</div>)}
            Booking will be refused. Pick another time, or cancel the existing booking first.
          </Notice>
        )}
        {validRange && clashes.length === 0 && busySlots.data && <Notice tone="ok">That time is free.</Notice>}
        <label className="ops-check"><input type="checkbox" checked={repeat} onChange={(ev) => setRepeat(ev.target.checked)} /> Repeats</label>
        {repeat && (
          <div className="ui-form-grid">
            <Field label="Every">{(c) => <Select {...c} value={freq} onChange={(ev) => setFreq(ev.target.value as Recurrence['freq'])}><option value="DAILY">Day</option><option value="WEEKLY">Week</option><option value="MONTHLY">Month</option></Select>}</Field>
            <Field label="Interval" hint="1 = every, 2 = every other">{(c) => <Input {...c} type="number" min={1} max={12} value={interval} onChange={(ev) => setIntervalN(ev.target.value)} />}</Field>
            <Field label="Occurrences" hint="2 to 52. All or none are booked.">{(c) => <Input {...c} type="number" min={2} max={52} value={count} onChange={(ev) => setCount(ev.target.value)} />}</Field>
          </div>
        )}
        <Field label="Notes" error={fieldError('notes')}>{(c) => <Textarea {...c} rows={2} value={notes} maxLength={500} onChange={(ev) => setNotes(ev.target.value)} />}</Field>
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={resourceId === '' || title.trim().length < 2 || !validRange || clashes.length > 0}>{repeat ? `Book ${series} times` : 'Book'}</Button>
          <Button to="/facilities/bookings" variant="ghost">Cancel</Button>
        </div>
      </form>
    </OpsPage>
  );
}

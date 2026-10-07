import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import { Link } from 'react-router-dom';
import { Badge, formatDateTime } from '../../ui';
import type { Event } from '../../api/eventApi';

const TYPES = ['Service', 'Meeting', 'Outreach', 'Conference', 'Other'].map((t) => ({ value: t, label: t }));

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const FREQ_LABEL: Record<string, string> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' };

/** The repeat rule the server stores (an RRULE subset), read back as form fields. */
function parseRepeat(pattern?: string | null) {
  const out = { repeat: '', repeatEvery: '', repeatDays: '', repeatUntil: '', repeatCount: '' };
  if (!pattern) return out;
  for (const piece of pattern.split(';')) {
    const [k, v = ''] = piece.split('=');
    if (k === 'FREQ') out.repeat = v;
    else if (k === 'INTERVAL') out.repeatEvery = v;
    else if (k === 'BYDAY') out.repeatDays = v;
    else if (k === 'COUNT') out.repeatCount = v;
    else if (k === 'UNTIL') out.repeatUntil = /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : '';
  }
  return out;
}

function describeRepeat(pattern?: string | null): string {
  const r = parseRepeat(pattern);
  if (!r.repeat) return pattern || 'Yes';
  const every = Number(r.repeatEvery || 1);
  const base = every === 1 ? `Every ${FREQ_LABEL[r.repeat]}` : `Every ${every} ${FREQ_LABEL[r.repeat]}s`;
  const days = r.repeatDays ? ` on ${r.repeatDays.split(',').join(', ')}` : '';
  const end = r.repeatCount ? `, ${r.repeatCount} times` : r.repeatUntil ? `, until ${r.repeatUntil}` : '';
  return `${base}${days}${end}`;
}

function buildPattern(v: Record<string, unknown>): string | null {
  const freq = String(v.repeat ?? '');
  if (!freq) return null;
  const parts = [`FREQ=${freq}`];
  const every = Number(v.repeatEvery || 1);
  if (every > 1) parts.push(`INTERVAL=${every}`);
  const days = String(v.repeatDays ?? '').toUpperCase().split(/[\s,]+/).filter((d) => DAY_CODES.includes(d));
  if (freq === 'WEEKLY' && days.length) parts.push(`BYDAY=${days.join(',')}`);
  const count = Number(v.repeatCount || 0);
  const until = String(v.repeatUntil ?? '').replace(/-/g, '');
  if (count > 0) parts.push(`COUNT=${count}`);
  else if (until) parts.push(`UNTIL=${until}`);
  return parts.join(';');
}

const config: ResourceConfig<Event> = {
  noun: 'event',
  plural: 'events',
  title: 'Events',
  subtitle: 'Services, meetings and programs, newest first.',
  endpoint: '/events',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by name or location',
  columns: [
    {
      key: 'startTime',
      header: 'When',
      render: (e) => (
        <span>
          {formatDateTime(e.startTime)}
          {e.endTime ? <span className="ui-card-sub"> to {formatDateTime(e.endTime)}</span> : null}
          {new Date(e.startTime).getTime() > Date.now() ? <> <Badge tone="info">Upcoming</Badge></> : null}
        </span>
      )
    },
    {
      key: 'name',
      header: 'Event',
      render: (e) => (
        <span>
          <Link to={`/events/${e.id}/registrations`} title="Registrations"><strong>{e.name}</strong></Link>
          {e.description ? <div className="ui-card-sub">{e.description}</div> : null}
        </span>
      )
    },
    { key: 'type', header: 'Type', render: (e) => e.type || '-' },
    { key: 'location', header: 'Location', render: (e) => e.location || '-' },
    { key: 'capacity', header: 'Seats', numeric: true, render: (e) => (e.capacity ? e.capacity : '-') },
    {
      key: 'recurrence',
      header: 'Repeats',
      render: (e) => (e.isRecurring ? describeRepeat(e.recurrencePattern) : '-')
    }
  ],
  fields: [
    { name: 'name', label: 'Name', required: true, maxLength: 255 },
    { name: 'type', label: 'Type', type: 'select', options: TYPES },
    { name: 'startTime', label: 'Starts', type: 'datetime-local', required: true },
    { name: 'endTime', label: 'Ends', type: 'datetime-local', hint: 'Leave blank if open ended.' },
    { name: 'location', label: 'Location', maxLength: 255 },
    { name: 'capacity', label: 'Seats', type: 'number', hint: 'Leave blank for no limit; extra registrations join a waitlist.' },
    { name: 'repeat', label: 'Repeats', type: 'select', options: [{ value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }], hint: 'Blank: does not repeat.' },
    { name: 'repeatEvery', label: 'Every', type: 'number', hint: 'Every 2 = every second week (1 to 52).' },
    { name: 'repeatDays', label: 'On days', maxLength: 30, hint: 'Weekly only, e.g. SU,WE. Blank: the start day.' },
    { name: 'repeatCount', label: 'Ends after', type: 'number', hint: 'Number of times. Or set an end date.' },
    { name: 'repeatUntil', label: 'Ends on', type: 'date' },
    { name: 'description', label: 'Description', type: 'textarea' }
  ],
  toForm: (e) => ({
    name: e.name,
    type: e.type ?? '',
    startTime: e.startTime.slice(0, 16),
    endTime: (e.endTime ?? '').slice(0, 16),
    location: e.location ?? '',
    capacity: e.capacity ?? '',
    ...(e.isRecurring ? parseRepeat(e.recurrencePattern) : parseRepeat(null)),
    description: e.description ?? ''
  }),
  toPayload: (v) => {
    const text = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null);
    const pattern = buildPattern(v);
    return {
      name: String(v.name ?? '').trim(),
      type: text(v.type),
      startTime: v.startTime,
      endTime: text(v.endTime),
      location: text(v.location),
      description: text(v.description),
      capacity: v.capacity === '' || v.capacity === undefined || v.capacity === null ? null : Number(v.capacity),
      isRecurring: pattern !== null,
      recurrencePattern: pattern
    };
  }
};

export default function EventsPage() {
  return <ResourcePage config={config} />;
}

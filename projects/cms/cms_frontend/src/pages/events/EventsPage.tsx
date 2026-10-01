import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import { Badge, formatDateTime } from '../../ui';
import type { Event } from '../../api/eventApi';

const TYPES = ['Service', 'Meeting', 'Outreach', 'Conference', 'Other'].map((t) => ({ value: t, label: t }));

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
          <strong>{e.name}</strong>
          {e.description ? <div className="ui-card-sub">{e.description}</div> : null}
        </span>
      )
    },
    { key: 'type', header: 'Type', render: (e) => e.type || '-' },
    { key: 'location', header: 'Location', render: (e) => e.location || '-' },
    {
      key: 'recurrence',
      header: 'Repeats',
      render: (e) => (e.isRecurring ? e.recurrencePattern || 'Yes' : '-')
    }
  ],
  fields: [
    { name: 'name', label: 'Name', required: true, maxLength: 255 },
    { name: 'type', label: 'Type', type: 'select', options: TYPES },
    { name: 'startTime', label: 'Starts', type: 'datetime-local', required: true },
    { name: 'endTime', label: 'Ends', type: 'datetime-local', hint: 'Leave blank if open ended.' },
    { name: 'location', label: 'Location', maxLength: 255 },
    { name: 'isRecurring', label: 'Repeats', type: 'checkbox', hint: 'This event repeats' },
    { name: 'recurrencePattern', label: 'Repeat pattern', maxLength: 255, hint: 'e.g. Every Sunday' },
    { name: 'description', label: 'Description', type: 'textarea' }
  ],
  toForm: (e) => ({
    name: e.name,
    type: e.type ?? '',
    startTime: e.startTime.slice(0, 16),
    endTime: (e.endTime ?? '').slice(0, 16),
    location: e.location ?? '',
    isRecurring: e.isRecurring === true,
    recurrencePattern: e.recurrencePattern ?? '',
    description: e.description ?? ''
  })
};

export default function EventsPage() {
  return <ResourcePage config={config} />;
}

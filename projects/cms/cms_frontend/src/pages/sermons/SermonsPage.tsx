import { Link } from 'react-router-dom';
import ResourcePage from '../../features/resource/ResourcePage';
import type { PageOf, ResourceConfig } from '../../features/resource/types';
import { http } from '../../api/http';
import { formatDate, formatDateTime } from '../../ui';
import type { Sermon } from '../../api/sermonApi';
import type { Member } from '../../api/memberApi';
import type { Event } from '../../api/eventApi';

const searchMembers = async (q: string) =>
  (await http.get<PageOf<Member>>('/members', { q, pageSize: 10 })).data.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}`, meta: m.email ?? undefined }));

const searchEvents = async (q: string) =>
  (await http.get<PageOf<Event>>('/events', { q, pageSize: 10 })).data.map((e) => ({ value: e.id, label: e.name, meta: formatDateTime(e.startTime) }));

const config: ResourceConfig<Sermon> = {
  noun: 'sermon',
  plural: 'sermons',
  title: 'Sermons',
  subtitle: 'Teachings, with speaker, passage and recordings.',
  endpoint: '/sermons',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by title',
  columns: [
    { key: 'datePreached', header: 'Preached', render: (s) => formatDate(s.datePreached) },
    {
      key: 'title',
      header: 'Sermon',
      render: (s) => (
        <span>
          <Link to={`/sermons/${s.id}/media`} title="Recordings and notes"><strong>{s.title}</strong></Link>
          {s.summary ? <div className="ui-card-sub">{s.summary.length > 120 ? `${s.summary.slice(0, 120)}...` : s.summary}</div> : null}
        </span>
      )
    },
    { key: 'speaker', header: 'Speaker', render: (s) => (s.speaker ? `${s.speaker.firstName} ${s.speaker.lastName}` : '-') },
    { key: 'passageReference', header: 'Passage', render: (s) => s.passageReference || '-' },
    { key: 'event', header: 'Event', render: (s) => s.event?.name ?? '-' },
    {
      key: 'media',
      header: 'Media',
      render: (s) =>
        s.audioUrl || s.videoUrl ? (
          <span className="ui-row">
            {s.audioUrl && <a href={s.audioUrl} target="_blank" rel="noopener noreferrer">Listen</a>}
            {s.videoUrl && <a href={s.videoUrl} target="_blank" rel="noopener noreferrer">Watch</a>}
          </span>
        ) : '-'
    }
  ],
  fields: [
    { name: 'title', label: 'Title', required: true, maxLength: 255, hint: 'At least 5 characters.' },
    { name: 'datePreached', label: 'Date preached', type: 'date', required: true },
    { name: 'speakerMemberId', label: 'Speaker', type: 'lookup', search: searchMembers },
    { name: 'eventId', label: 'Event', type: 'lookup', search: searchEvents },
    { name: 'passageReference', label: 'Passage', maxLength: 100, hint: 'e.g. John 3:16' },
    { name: 'audioUrl', label: 'Audio URL', type: 'text', maxLength: 255 },
    { name: 'videoUrl', label: 'Video URL', type: 'text', maxLength: 255 },
    { name: 'summary', label: 'Summary', type: 'textarea' },
    { name: 'notes', label: 'Notes', type: 'textarea' }
  ],
  toForm: (s) => ({
    title: s.title,
    datePreached: (s.datePreached ?? '').slice(0, 10),
    speakerMemberId: s.speakerMemberId ? { value: s.speakerMemberId, label: s.speaker ? `${s.speaker.firstName} ${s.speaker.lastName}` : `Member ${s.speakerMemberId}` } : null,
    eventId: s.eventId ? { value: s.eventId, label: s.event?.name ?? `Event ${s.eventId}` } : null,
    passageReference: s.passageReference ?? '',
    audioUrl: s.audioUrl ?? '',
    videoUrl: s.videoUrl ?? '',
    summary: s.summary ?? '',
    notes: s.notes ?? ''
  })
};

export default function SermonsPage() {
  return <ResourcePage config={config} />;
}

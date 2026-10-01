import ResourcePage from '../../features/resource/ResourcePage';
import type { ResourceConfig } from '../../features/resource/types';
import { Badge, formatDateTime } from '../../ui';
import type { Announcement } from '../../api/announcementApi';

const AUDIENCES = ['All', 'Members', 'Leaders', 'Specific Group'].map((a) => ({ value: a, label: a }));

// The form's date-time inputs hold no zone; the API wants a full ISO time, and the list slices it
// back the same way, so a value round-trips unchanged.
const toIso = (v: unknown) => (typeof v === 'string' && v.trim() ? `${v.trim()}:00Z` : null);

const config: ResourceConfig<Announcement> = {
  noun: 'announcement',
  plural: 'announcements',
  title: 'Announcements',
  subtitle: 'Notices to the congregation, newest first.',
  endpoint: '/announcements',
  writePermission: 'members:write',
  searchPlaceholder: 'Search by title or content',
  columns: [
    {
      key: 'title',
      header: 'Announcement',
      render: (a) => (
        <span>
          <strong>{a.title}</strong>
          <div className="ui-card-sub">{a.content.length > 120 ? `${a.content.slice(0, 120)}...` : a.content}</div>
        </span>
      )
    },
    { key: 'publicationDate', header: 'Published', render: (a) => formatDateTime(a.publicationDate) },
    { key: 'expiryDate', header: 'Expires', render: (a) => formatDateTime(a.expiryDate) },
    { key: 'targetAudience', header: 'Audience', render: (a) => a.targetAudience || '-' },
    { key: 'isPublished', header: 'Status', render: (a) => (a.isPublished ? <Badge tone="ok">Published</Badge> : <Badge>Draft</Badge>) },
    { key: 'author', header: 'Author', render: (a) => a.author?.username ?? '-' }
  ],
  fields: [
    { name: 'title', label: 'Title', required: true, maxLength: 255 },
    { name: 'targetAudience', label: 'Audience', type: 'select', options: AUDIENCES },
    { name: 'publicationDate', label: 'Publication date', type: 'datetime-local', hint: 'Blank means now.' },
    { name: 'expiryDate', label: 'Expiry date', type: 'datetime-local', hint: 'Blank means it does not expire.' },
    { name: 'isPublished', label: 'Published', type: 'checkbox', hint: 'Publish now', initial: true },
    { name: 'content', label: 'Content', type: 'textarea', required: true, hint: 'At least 10 characters.' }
  ],
  toForm: (a) => ({
    title: a.title,
    targetAudience: a.targetAudience ?? '',
    publicationDate: (a.publicationDate ?? '').slice(0, 16),
    expiryDate: (a.expiryDate ?? '').slice(0, 16),
    isPublished: a.isPublished,
    content: a.content
  }),
  toPayload: (v) => {
    const publicationDate = toIso(v.publicationDate);
    return {
      title: String(v.title ?? '').trim(),
      content: String(v.content ?? '').trim(),
      targetAudience: v.targetAudience || null,
      isPublished: v.isPublished === true,
      expiryDate: toIso(v.expiryDate),
      // The column cannot be empty, so a blank date is left out rather than cleared.
      ...(publicationDate ? { publicationDate } : {})
    };
  }
};

export default function AnnouncementsPage() {
  return <ResourcePage config={config} />;
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DataTable, EmptyState, FilterBar, LoadMore, PageHeader, Select, formatDateTime, useKeysetList, type Column } from '../../ui';
import type { SecurityEvent, SecurityEventType } from '../../api/checkinApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { CheckinTabs } from './CheckinTabs';

const TONE: Record<SecurityEventType, 'ok' | 'bad' | 'warn' | 'info'> = { CHECK_IN: 'info', CHECK_OUT: 'ok', DENIED: 'bad', FLAGGED: 'warn', OVERRIDE: 'warn' };
const LABEL: Record<SecurityEventType, string> = { CHECK_IN: 'Check-in', CHECK_OUT: 'Check-out', DENIED: 'Refused', FLAGGED: 'Flagged', OVERRIDE: 'Override' };

const columns: Array<Column<SecurityEvent>> = [
  { key: 'at', header: 'When', render: (e) => formatDateTime(e.createdAt) },
  { key: 'type', header: 'Event', render: (e) => <Badge tone={TONE[e.type]}>{LABEL[e.type]}</Badge> },
  { key: 'child', header: 'Child', render: (e) => (e.childId ? <Link to={`/checkin/children/${e.childId}`}>Child #{e.childId}</Link> : '') },
  { key: 'detail', header: 'Detail', render: (e) => e.detail ?? '' },
  { key: 'actor', header: 'By user', numeric: true, render: (e) => e.actorUserId ?? '' }
];

/** Append-only: nobody, including administrators, can edit or delete these rows. */
export default function SecurityTrailPage() {
  const [type, setType] = useState<SecurityEventType | ''>('');
  const list = useKeysetList<SecurityEvent>('/checkin/events', { type: type || undefined });
  return (
    <OpsPage>
      <PageHeader title="Children's check-in" subtitle="A permanent record of every check-in, collection, refused code and override. It cannot be edited." />
      <CheckinTabs active="security" />
      <FilterBar>
        <div className="ui-field">
          <Select aria-label="Event type" value={type} onChange={(e) => setType(e.target.value as SecurityEventType | '')}>
            <option value="">All events</option>
            {(Object.keys(LABEL) as SecurityEventType[]).map((t) => <option key={t} value={t}>{LABEL[t]}</option>)}
          </Select>
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(e) => e.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title="Nothing recorded" message="Security events appear as children are checked in and out." />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="events" /> : undefined} />
    </OpsPage>
  );
}

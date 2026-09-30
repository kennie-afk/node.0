import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DataTable, EmptyState, FilterBar, LoadMore, PageHeader, Select, StatusPill, formatDateTime, useKeysetList, useToast, type Column } from '../../ui';
import { processOutbox, type OutboxMessage, type OutboxStatus } from '../../api/commsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { CommsTabs } from './CommsTabs';

const columns: Array<Column<OutboxMessage>> = [
  { key: 'to', header: 'To', render: (m) => <span className="ops-mono">{m.toAddress}</span> },
  { key: 'channel', header: 'Channel', render: (m) => m.channel },
  { key: 'campaign', header: 'Campaign', render: (m) => (m.campaignId ? <Link to={`/comms/campaigns/${m.campaignId}`}>#{m.campaignId}</Link> : 'Direct') },
  { key: 'status', header: 'Status', render: (m) => <StatusPill status={m.status} /> },
  { key: 'attempts', header: 'Tries', numeric: true, render: (m) => m.attempts },
  { key: 'error', header: 'Note', render: (m) => m.lastError ?? '' },
  { key: 'at', header: 'When', render: (m) => formatDateTime(m.sentAt ?? m.createdAt) }
];

export default function OutboxPage() {
  const [status, setStatus] = useState<OutboxStatus | ''>('');
  const list = useKeysetList<OutboxMessage>('/comms/outbox', { status: status || undefined });
  const { can } = useAuth();
  const toast = useToast();
  return (
    <OpsPage>
      <PageHeader title="Communications" subtitle="Every message the system has tried to send, newest first." actions={can('users:manage') ? <Button variant="secondary" onClick={async () => { try { const r = await processOutbox(); toast.success(`Sent ${r.sent}, failed ${r.failed}, retrying ${r.retried}.`); list.refresh(); } catch (e) { toast.error(normalizeError(e).message); } }}>Deliver queue now</Button> : undefined} />
      <CommsTabs active="outbox" />
      <FilterBar>
        <div className="ui-field">
          <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as OutboxStatus | '')}>
            <option value="">All statuses</option>
            <option value="QUEUED">Queued</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="SKIPPED">Skipped</option>
          </Select>
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={list.items} rowKey={(m) => m.id} loading={list.loading} error={list.error} onRetry={list.refresh} empty={<EmptyState title="No messages" message="Messages appear here once a campaign is sent." />} footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="messages" /> : undefined} />
    </OpsPage>
  );
}

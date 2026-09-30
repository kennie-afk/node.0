import { Plus } from 'lucide-react';
import { Button, DataTable, EmptyState, LoadMore, PageHeader, StatusPill, formatDateTime, useKeysetList, type Column } from '../../ui';
import type { Campaign } from '../../api/commsApi';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { CommsTabs } from './CommsTabs';

const columns: Array<Column<Campaign>> = [
  { key: 'name', header: 'Campaign' },
  { key: 'channel', header: 'Channel', render: (c) => c.channel },
  { key: 'status', header: 'Status', render: (c) => <StatusPill status={c.status} /> },
  { key: 'recipients', header: 'Recipients', numeric: true, render: (c) => c.recipientCount },
  { key: 'created', header: 'Created', render: (c) => formatDateTime(c.createdAt) }
];

export default function CampaignsPage() {
  const list = useKeysetList<Campaign>('/comms/campaigns');
  return (
    <OpsPage>
      <PageHeader title="Communications" subtitle="Send SMS and email to the people you choose. Members who opted out are never messaged." actions={<Button to="/comms/campaigns/new" variant="primary" icon={<Plus size={12} aria-hidden />}>New campaign</Button>} />
      <CommsTabs active="campaigns" />
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(c) => c.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.refresh}
        rowHref={(c) => `/comms/campaigns/${c.id}`}
        empty={<EmptyState title="No campaigns yet" message="Write a message, pick an audience and send it. Nothing goes out until you press Send." action={<Button to="/comms/campaigns/new" variant="primary">New campaign</Button>} />}
        footer={list.items.length > 0 ? <LoadMore shown={list.items.length} hasMore={list.hasMore} loading={list.loadingMore} onMore={list.loadMore} noun="campaigns" /> : undefined}
      />
    </OpsPage>
  );
}

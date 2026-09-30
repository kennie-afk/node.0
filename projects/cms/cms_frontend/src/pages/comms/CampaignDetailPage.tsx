import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, Card, DataTable, EmptyState, ErrorState, InlineConfirm, LoadMore, PageHeader, PageLoader, StatTile, StatusPill, Select, formatDateTime, useKeysetList, useQuery, useToast, type Column } from '../../ui';
import { cancelCampaign, getCampaign, processOutbox, sendCampaign, type OutboxMessage, type OutboxStatus } from '../../api/commsApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { OpsPage } from '../../features/ops/components/OpsPage';
import { Notice } from '../../features/ops/components/FormBanner';
import { usePolling } from '../../features/ops/components/usePolling';
import { smsSegments } from '../../features/ops/lib/sms';

const columns: Array<Column<OutboxMessage>> = [
  { key: 'to', header: 'To', render: (m) => <span className="ops-mono">{m.toAddress}</span> },
  { key: 'status', header: 'Status', render: (m) => <StatusPill status={m.status} /> },
  { key: 'attempts', header: 'Attempts', numeric: true, render: (m) => m.attempts },
  { key: 'error', header: 'Note', render: (m) => m.lastError ?? '' },
  { key: 'sent', header: 'Sent', render: (m) => (m.sentAt ? formatDateTime(m.sentAt) : '') }
];

export default function CampaignDetailPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const { can } = useAuth();
  const campaign = useQuery(() => getCampaign(id), [id]);
  const [status, setStatus] = useState<OutboxStatus | ''>('');
  const outbox = useKeysetList<OutboxMessage>('/comms/outbox', { campaignId: id, status: status || undefined });
  const inFlight = campaign.data?.status === 'QUEUED' || campaign.data?.status === 'SENDING';

  usePolling(() => {
    campaign.refetch();
    outbox.refresh();
  }, 20_000, inFlight);

  if (campaign.loading && !campaign.data) return <PageLoader />;
  if (campaign.error && !campaign.data) return <ErrorState message={campaign.error.message} onRetry={campaign.refetch} requestId={campaign.error.requestId} />;
  const c = campaign.data!;
  const delivery = c.delivery ?? {};
  const parts = c.channel === 'SMS' ? smsSegments(c.body).segments : 0;

  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.success(done);
      campaign.refetch();
      outbox.refresh();
    } catch (failure) {
      toast.error(normalizeError(failure).message);
    }
  };

  return (
    <OpsPage>
      <PageHeader
        title={c.name}
        crumbs={[{ label: 'Communications', to: '/comms/campaigns' }, { label: c.name }]}
        subtitle={<>{c.channel} · <StatusPill status={c.status} /> · created {formatDateTime(c.createdAt)}</>}
        actions={
          <>
            <Button variant="ghost" icon={<RefreshCw size={12} aria-hidden />} onClick={() => { campaign.refetch(); outbox.refresh(); }}>Refresh</Button>
            {c.status === 'DRAFT' && <InlineConfirm label="Send now" variant="secondary" question="Send this to the audience now? It cannot be recalled." confirmLabel="Send" onConfirm={() => act(() => sendCampaign(id), 'Queued for delivery.')} />}
            {(c.status === 'QUEUED' || c.status === 'DRAFT') && <InlineConfirm label="Cancel campaign" question="Cancel this campaign? Messages not yet sent are dropped." onConfirm={() => act(() => cancelCampaign(id), 'Campaign cancelled.')} />}
            {can('users:manage') && inFlight && <Button variant="secondary" onClick={() => act(async () => { const r = await processOutbox(); toast.show(`Sent ${r.sent}, failed ${r.failed}, retrying ${r.retried}.`, 'info'); }, 'Delivery run finished.')}>Deliver queue now</Button>}
          </>
        }
      />
      <div className="ui-grid" style={{ ['--ui-min' as string]: '120px' }}>
        <StatTile label="Recipients" value={c.recipientCount} />
        <StatTile label="Sent" value={delivery.SENT ?? 0} tone={delivery.SENT ? 'ok' : undefined} />
        <StatTile label="Queued" value={delivery.QUEUED ?? 0} />
        <StatTile label="Failed" value={delivery.FAILED ?? 0} tone={delivery.FAILED ? 'bad' : undefined} />
        <StatTile label="Skipped" value={delivery.SKIPPED ?? 0} foot="No consent or no address" />
      </div>
      <div className="ops-split">
        <Card title="Delivery" flush actions={<Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as OutboxStatus | '')}><option value="">All statuses</option><option value="QUEUED">Queued</option><option value="SENT">Sent</option><option value="FAILED">Failed</option><option value="SKIPPED">Skipped</option></Select>}>
          <DataTable
            columns={columns}
            rows={outbox.items}
            rowKey={(m) => m.id}
            loading={outbox.loading}
            error={outbox.error}
            onRetry={outbox.refresh}
            empty={<EmptyState title="Nothing in the log" message={c.status === 'DRAFT' ? 'Send the campaign to see delivery here.' : 'No messages match this filter.'} />}
            footer={outbox.items.length > 0 ? <LoadMore shown={outbox.items.length} hasMore={outbox.hasMore} loading={outbox.loadingMore} onMore={outbox.loadMore} noun="messages" /> : undefined}
          />
        </Card>
        <Card title="Message">
          <div className="ops-note-body">{c.body}</div>
          {parts > 0 && <div className="ops-muted" style={{ marginTop: 8 }}>{parts} SMS part{parts === 1 ? '' : 's'} per recipient</div>}
          {c.status === 'DRAFT' && <div style={{ marginTop: 8 }}><Notice tone="info">This is a draft. Nothing has been sent.</Notice></div>}
        </Card>
      </div>
    </OpsPage>
  );
}

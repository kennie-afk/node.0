import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDate, PageHeader, PageLoader, StatTile, StatusPill, useKeysetList, useQuery, LoadMore } from '../../ui';
import { getCampaign, type Pledge } from '../../api/givingApi';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, Progress } from '../../features/finance/components/common';

export default function CampaignDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const { data: c, error, refetch } = useQuery(() => getCampaign(id), [id]);
  const pledges = useKeysetList<Pledge>('/giving/pledges', { campaignId: id });
  if (error && !c) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!c) return <PageLoader />;
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={c.name}
        crumbs={[{ label: 'Campaigns', to: '/giving/campaigns' }]}
        actions={
          <div className="ui-row">
            <StatusPill status={c.status} />
            {can('giving:write') && <Button to={`/giving/pledges/new?campaignId=${id}`} size="sm">Add pledge</Button>}
            {can('giving:write') && <Button to={`/giving/contributions/new?campaignId=${id}`} size="sm">Record gift</Button>}
            {can('giving:write') && <Button to={`/giving/campaigns/${id}/edit`} size="sm" variant="ghost">Edit</Button>}
          </div>
        }
      />
      <div className="ui-grid" style={{ ['--ui-min' as string]: '170px' }}>
        <StatTile label="Goal" value={<Money value={c.goal} />} />
        <StatTile label="Pledged" value={<Money value={c.pledged} />} foot={`${c.pledgeCount} pledges`} />
        <StatTile label="Raised" value={<Money value={c.raised} />} foot={`${c.giftCount} gifts from ${c.donorCount} donors`} />
        <StatTile label="Remaining" value={<Money value={c.remaining} />} />
      </div>
      <Card>
        <Progress basisPoints={c.progressBasisPoints} tone={c.progressBasisPoints >= 10000 ? 'ok' : undefined} />
        <KeyValue items={[['Starts', formatDate(c.startDate)], ['Ends', c.endDate ? formatDate(c.endDate) : 'open'], ['Description', c.description ?? '-'], ['Progress', `${(c.progressBasisPoints / 100).toFixed(1)}%`]]} />
      </Card>
      <Card title="Pledges" flush>
        <DataTable<Pledge>
          rowKey={(p) => p.id}
          rows={pledges.items}
          loading={pledges.loading}
          error={pledges.error}
          onRetry={pledges.refresh}
          rowHref={(p) => `/giving/pledges/${p.id}`}
          columns={[
            { key: 'who', header: 'Member', render: (p) => <Link to={`/giving/pledges/${p.id}`}>{p.memberName}</Link> },
            { key: 'amount', header: 'Pledged', numeric: true, render: (p) => <Money value={p.amount} /> },
            { key: 'given', header: 'Given', numeric: true, render: (p) => <Money value={p.fulfilled} /> },
            { key: 'out', header: 'Outstanding', numeric: true, render: (p) => <Money value={p.outstanding} /> },
            { key: 'bar', header: 'Progress', render: (p) => <Progress basisPoints={p.progressBasisPoints} /> }
          ]}
          empty={<span>No pledges yet.</span>}
          footer={<LoadMore shown={pledges.items.length} hasMore={pledges.hasMore} loading={pledges.loadingMore} onMore={pledges.loadMore} noun="pledges" />}
        />
      </Card>
    </div>
  );
}

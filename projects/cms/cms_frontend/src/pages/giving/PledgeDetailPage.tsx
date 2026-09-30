import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDate, LoadMore, PageHeader, PageLoader, StatusPill, useKeysetList, useQuery, useToast } from '../../ui';
import { cancelPledge, getPledge, type Gift } from '../../api/givingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, Progress, ReasonAction } from '../../features/finance/components/common';

export default function PledgeDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: p, error, refetch } = useQuery(() => getPledge(id), [id]);
  const gifts = useKeysetList<Gift>('/giving/contributions', { pledgeId: id });
  if (error && !p) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!p) return <PageLoader />;
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`${p.memberName} · pledge`}
        crumbs={[{ label: 'Pledges', to: '/giving/pledges' }]}
        actions={
          <div className="ui-row">
            <StatusPill status={p.status} />
            {can('giving:write') && p.status === 'ACTIVE' && (
              <>
                <Button to={`/giving/contributions/new?memberId=${p.memberId}&pledgeId=${p.id}${p.campaignId ? `&campaignId=${p.campaignId}` : ''}`} size="sm" variant="primary">Record a gift toward it</Button>
                <Button to={`/giving/pledges/${p.id}/edit`} size="sm">Edit</Button>
                <ReasonAction label="Cancel pledge" confirmLabel="Cancel pledge" onConfirm={async (reason) => { try { await cancelPledge(p.id, reason); toast.success('Pledge cancelled'); refetch(); } catch (f) { toast.error(normalizeError(f).message); } }} />
              </>
            )}
          </div>
        }
      />
      <Card>
        <Progress basisPoints={p.progressBasisPoints} tone={p.progressBasisPoints >= 10000 ? 'ok' : undefined} />
        <KeyValue items={[
          ['Pledged', <Money key="a" value={p.amount} strong />], ['Given so far', <Money key="f" value={p.fulfilled} />], ['Outstanding', <Money key="o" value={p.outstanding} />],
          ['Due by now', <Money key="d" value={p.dueToDate} />], ['Behind schedule', p.behind === '0.00' ? 'On track' : <Money key="b" value={p.behind} />],
          ['Schedule', `${p.frequency.replace('_', ' ').toLowerCase()}${p.installment ? ` · ${p.installment}` : ''}`], ['Starts', formatDate(p.startDate)], ['Ends', p.endDate ? formatDate(p.endDate) : 'open'],
          ['Member', <Link key="m" to={`/giving/statements/${p.memberId}`}>{p.memberName}</Link>], ['Notes', p.notes ?? '-']
        ]} />
      </Card>
      <Card title="Gifts toward this pledge" flush>
        <DataTable<Gift>
          rowKey={(g) => g.id}
          rows={gifts.items}
          loading={gifts.loading}
          error={gifts.error}
          rowHref={(g) => `/giving/contributions/${g.id}`}
          columns={[
            { key: 'date', header: 'Date', render: (g) => formatDate(g.date) },
            { key: 'receipt', header: 'Receipt', render: (g) => g.receiptNo ?? '-' },
            { key: 'amount', header: 'Amount', numeric: true, render: (g) => <Money value={g.amount} /> },
            { key: 'status', header: 'Status', render: (g) => <StatusPill status={g.status} /> }
          ]}
          empty={<span>No gifts linked to this pledge yet.</span>}
          footer={<LoadMore shown={gifts.items.length} hasMore={gifts.hasMore} loading={gifts.loadingMore} onMore={gifts.loadMore} noun="gifts" />}
        />
      </Card>
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Button, Card, DataTable, ErrorState, Field, formatDate, formatDateTime, MoneyInput, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { countBatch, getBatch, reopenBatch, verifyBatch } from '../../api/givingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money } from '../../features/finance/components/common';

export default function BatchDetailPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const toast = useToast();
  const { data: batch, error, refetch } = useQuery(() => getBatch(id), [id]);
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  if (error && !batch) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!batch) return <PageLoader />;

  const act = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await work(); toast.success(done); refetch(); } catch (failure) { toast.error(normalizeError(failure).message); } finally { setBusy(false); }
  };
  const write = can('giving:write');
  const variance = batch.variance && batch.variance !== '0.00' ? batch.variance : null;

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`Batch #${batch.batchNo} · ${batch.name}`}
        crumbs={[{ label: 'Counting batches', to: '/giving/batches' }]}
        actions={
          <div className="ui-row">
            <StatusPill status={batch.status} />
            {write && batch.status === 'OPEN' && <Button to={`/giving/batches/${id}/entry`} size="sm">Enter gifts</Button>}
          </div>
        }
      />
      <Card title="Two-person control">
        <KeyValue
          items={[
            ['Service date', formatDate(batch.serviceDate)],
            ['Gifts entered', batch.itemCount],
            ['Entered total', <Money key="e" value={batch.itemsTotal} strong />],
            ['Counted total', batch.countedTotal ? <Money key="c" value={batch.countedTotal} strong /> : 'not counted'],
            ['Variance', variance ? <Money key="v" value={variance} /> : batch.countedTotal ? 'none' : '-'],
            ['Counted at', batch.countedAt ? formatDateTime(batch.countedAt) : '-'],
            ['Posted at', batch.postedAt ? formatDateTime(batch.postedAt) : '-']
          ]}
        />
        {write && batch.status === 'OPEN' && (
          <form
            className="ui-row"
            style={{ marginTop: 12 }}
            onSubmit={(e) => { e.preventDefault(); void act(() => countBatch(id, counted), 'Counted. A different person must now verify it.'); }}
            aria-label="Record the counted total"
          >
            <Field label="Cash counted (what is physically there)">{(c) => <MoneyInput {...c} value={counted} onChange={setCounted} />}</Field>
            <Button type="submit" variant="primary" loading={busy} disabled={!counted || batch.itemCount === 0}>Record count</Button>
          </form>
        )}
        {write && batch.status === 'COUNTED' && (
          <div className="ui-row" style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy} onClick={() => act(() => verifyBatch(id), 'Verified and posted to the ledger')}>Verify and post</Button>
            <Button variant="secondary" loading={busy} onClick={() => act(() => reopenBatch(id), 'Batch reopened')}>Reopen to correct</Button>
            <span className="fin-muted">The person who opened or counted this batch cannot verify it. The server refuses.</span>
          </div>
        )}
        {batch.journalEntryId && <p style={{ marginTop: 12 }}><Link to={`/finance/journal/${batch.journalEntryId}`}>View the ledger entry</Link></p>}
      </Card>
      <Card title="Gifts in this batch" flush>
        <DataTable
          rowKey={(i) => i.id}
          rows={batch.items}
          rowHref={(i) => `/giving/contributions/${i.id}`}
          columns={[
            { key: 'receipt', header: 'Receipt', render: (i) => i.receiptNo ?? <span className="fin-muted">after posting</span> },
            { key: 'who', header: 'Donor', render: (i) => i.memberName ?? '-' },
            { key: 'type', header: 'Type', render: (i) => i.contributionType },
            { key: 'method', header: 'Method', render: (i) => i.paymentMethod ?? '-' },
            { key: 'amount', header: 'Amount', numeric: true, render: (i) => <Money value={i.amount} /> },
            { key: 'status', header: 'Status', render: (i) => <StatusPill status={i.status} /> }
          ]}
          empty={<span>No gifts entered yet.</span>}
        />
      </Card>
    </div>
  );
}

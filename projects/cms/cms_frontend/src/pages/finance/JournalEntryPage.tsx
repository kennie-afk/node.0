import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, DataTable, ErrorState, formatDate, formatDateTime, PageHeader, PageLoader, useQuery, useToast, Button } from '../../ui';
import { getJournalEntry, reverseJournal } from '../../api/financeApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money, PrintButton, ReasonAction, ReversedFlag, SourcePill } from '../../features/finance/components/common';

const SOURCE_LINKS: Record<string, (id: string) => string> = {
  CONTRIBUTION: (id) => `/giving/contributions/${id}`,
  BILL: (id) => `/payables/bills/${id}`,
  BILL_PAYMENT: () => '/payables/bills',
  PAYROLL: (id) => `/payroll/runs/${id}`
};

export default function JournalEntryPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const { data: e, error, refetch } = useQuery(() => getJournalEntry(id), [id]);
  if (error && !e) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!e) return <PageLoader />;
  const link = e.sourceId ? SOURCE_LINKS[e.sourceType]?.(e.sourceId) : undefined;
  const reversible = e.sourceType === 'MANUAL' && e.reversedByEntryId === null && e.reversesEntryId === null;
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`Entry #${e.entryNo}`}
        subtitle={e.memo}
        crumbs={[{ label: 'Journal', to: '/finance/journal' }]}
        actions={
          <div className="ui-row no-print">
            <PrintButton />
            {can('finance:post') && reversible && (
              <ReasonAction
                label="Reverse entry"
                question="Why is it being reversed?"
                confirmLabel="Reverse"
                onConfirm={async (reason) => {
                  try { const r = await reverseJournal(e.id, { reason }); toast.success('Reversed'); navigate(`/finance/journal/${r.id}`); } catch (f) { toast.error(normalizeError(f).message); }
                }}
              />
            )}
          </div>
        }
      />
      <Card title="Entry" actions={<ReversedFlag reversed={e.reversedByEntryId !== null} />}>
        <KeyValue
          items={[
            ['Date', formatDate(e.entryDate)], ['Source', <SourcePill key="s" source={e.sourceType} />], ['Total', <Money key="t" value={e.total} strong />], ['Posted', formatDateTime(e.postedAt)],
            ['Reverses', e.reversesEntryId ? <Link key="r" to={`/finance/journal/${e.reversesEntryId}`}>#{e.reversesEntryId}</Link> : '-'],
            ['Reversed by', e.reversedByEntryId ? <Link key="rb" to={`/finance/journal/${e.reversedByEntryId}`}>#{e.reversedByEntryId}</Link> : '-'],
            ['Document', link ? <Link key="d" to={link}>Open the source</Link> : '-'], ['Hash', <code key="h" title={e.hash}>{e.hash.slice(0, 16)}…</code>]
          ]}
        />
        {!reversible && e.sourceType !== 'MANUAL' && e.reversedByEntryId === null && <p className="fin-muted" style={{ marginTop: 8 }}>Posted by the {e.sourceType.toLowerCase().replace(/_/g, ' ')} module; void it there so both stay in step.</p>}
      </Card>
      <Card title="Lines" flush>
        <DataTable
          rowKey={(l) => l.lineNo}
          rows={e.lines}
          columns={[
            { key: 'acct', header: 'Account', render: (l) => <Link to={`/finance/accounts/${l.accountId}/register`}>{l.accountCode} · {l.accountName}</Link> },
            { key: 'fund', header: 'Fund', render: (l) => l.fundCode },
            { key: 'memo', header: 'Note', render: (l) => l.memo ?? '' },
            { key: 'debit', header: 'Debit', numeric: true, render: (l) => (l.debit === '0.00' ? '' : <Money value={l.debit} />) },
            { key: 'credit', header: 'Credit', numeric: true, render: (l) => (l.credit === '0.00' ? '' : <Money value={l.credit} />) }
          ]}
          totals={<tr><td colSpan={3}>Totals</td><td className="ui-num"><Money value={e.total} strong /></td><td className="ui-num"><Money value={e.total} strong /></td></tr>}
        />
      </Card>
      <Button to="/finance/journal" variant="ghost" className="no-print">Back to the journal</Button>
    </div>
  );
}

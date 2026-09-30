import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { Button, Card, DataTable, ErrorState, formatDate, formatDateTime, InlineConfirm, PageHeader, PageLoader, StatusPill, useQuery, useToast } from '../../ui';
import { deleteReconciliation, finalizeReconciliation, getReconciliation } from '../../api/bankingApi';
import { normalizeError } from '../../api/http';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money } from '../../features/finance/components/common';

/** The reconciliation session. The difference must be exactly zero, with nothing unmatched, to finalise. */
export default function ReconciliationPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { can } = useAuth();
  const toast = useToast();
  const { data: rec, error, refetch } = useQuery(() => getReconciliation(id), [id]);
  const [busy, setBusy] = useState(false);
  if (error && !rec) return <div className="ui-page"><ErrorState message={error.message} onRetry={refetch} requestId={error.requestId} /></div>;
  if (!rec) return <PageLoader />;
  const s = rec.summary;
  const final = rec.status === 'FINALIZED';
  const difference = final ? rec.difference : s?.difference;
  const zero = difference === '0.00';

  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={`Reconciliation · ${formatDate(rec.statementDate)}`}
        crumbs={[{ label: 'Accounts', to: '/banking/accounts' }, { label: 'Account', to: `/banking/accounts/${rec.bankAccountId}` }]}
        actions={<StatusPill status={rec.status} tone={final ? 'ok' : 'info'} />}
      />
      <Card title="The numbers">
        <KeyValue items={[
          ['Statement closing balance', <Money key="s" value={rec.statementBalance} strong />],
          ['Opening balance', <Money key="o" value={s?.startingBalance ?? rec.openingBalance} />],
          ['Matched ledger activity', s ? <Money key="m" value={s.matchedLedgerTotal} /> : '-'],
          ['Ignored', s ? <Money key="i" value={s.ignoredTotal} /> : '-'],
          ['Cleared balance', <Money key="c" value={final ? rec.clearedBalance ?? '0.00' : s?.clearedBalance ?? '0.00'} strong />],
          ['Difference', <span key="d" className={zero ? 'fin-ok' : 'fin-warn'} style={{ padding: '2px 8px', display: 'inline-block' }}>{difference ?? '-'}{zero ? ' — balanced' : ''}</span>],
          ...(final && rec.finalizedAt ? ([['Finalised', formatDateTime(rec.finalizedAt)]] as Array<[string, string]>) : [])
        ]} />
        {!final && can('finance:close') && (
          <div className="ui-row" style={{ marginTop: 12 }}>
            <Button variant="primary" loading={busy} disabled={!s?.canFinalize} onClick={async () => { setBusy(true); try { await finalizeReconciliation(id); toast.success('Reconciliation finalised and locked'); refetch(); } catch (f) { toast.error(normalizeError(f).message); } finally { setBusy(false); } }}>Finalise</Button>
            <Button to={`/banking/accounts/${rec.bankAccountId}/match`}>Match more transactions</Button>
            <InlineConfirm label="Discard" question="Discard this reconciliation?" onConfirm={async () => { try { await deleteReconciliation(id); toast.success('Discarded'); navigate(`/banking/accounts/${rec.bankAccountId}`); } catch (f) { toast.error(normalizeError(f).message); } }} />
            {!s?.canFinalize && <span className="fin-muted">Finalising needs a zero difference and no unmatched bank lines.</span>}
          </div>
        )}
      </Card>
      {!final && s && s.unmatchedStatementLines.length > 0 && (
        <Card title={`${s.unmatchedStatementLines.length} bank lines still unmatched`} flush actions={<Link to={`/banking/accounts/${rec.bankAccountId}/match`}>Match them</Link>}>
          <DataTable rowKey={(l) => l.id} rows={s.unmatchedStatementLines} columns={[
            { key: 'date', header: 'Date', render: (l) => formatDate(l.date) },
            { key: 'desc', header: 'Description', render: (l) => l.description },
            { key: 'amt', header: 'Amount', numeric: true, render: (l) => <Money value={l.amount} /> }
          ]} />
        </Card>
      )}
    </div>
  );
}

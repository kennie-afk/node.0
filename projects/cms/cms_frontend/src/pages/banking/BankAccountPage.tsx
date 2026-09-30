import { Link, useParams } from 'react-router-dom';
import { Button, Card, DataTable, ErrorState, formatDate, formatDateTime, PageHeader, PageLoader, StatusPill, useQuery } from '../../ui';
import { getUnreconciled, listBankAccounts, listReconciliations, listStatements } from '../../api/bankingApi';
import { useAuth } from '../../context/auth-context';
import { KeyValue, Money } from '../../features/finance/components/common';

export default function BankAccountPage() {
  const id = Number(useParams().id);
  const { can } = useAuth();
  const accounts = useQuery(() => listBankAccounts(true), []);
  const statements = useQuery(() => listStatements(id), [id]);
  const recs = useQuery(() => listReconciliations(id), [id]);
  const unrec = useQuery(() => getUnreconciled(id), [id]);
  const account = accounts.data?.find((a) => a.id === id);
  if (accounts.error && !accounts.data) return <div className="ui-page"><ErrorState message={accounts.error.message} onRetry={accounts.refetch} requestId={accounts.error.requestId} /></div>;
  if (!account) return <PageLoader />;
  const write = can('finance:post');
  return (
    <div className="ui-page ui-stack">
      <PageHeader
        title={account.name}
        crumbs={[{ label: 'Accounts', to: '/banking/accounts' }]}
        actions={
          <div className="ui-row">
            <Button size="sm" to={`/finance/accounts/${account.glAccountId}/register`}>Ledger register</Button>
            {write && <Button size="sm" to={`/banking/accounts/${id}/import`}>Import a statement</Button>}
            {write && <Button size="sm" to={`/banking/accounts/${id}/match`}>Match transactions</Button>}
            {write && <Button size="sm" variant="primary" to={`/banking/accounts/${id}/reconcile/new`}>Start a reconciliation</Button>}
          </div>
        }
      />
      <Card>
        <KeyValue items={[['Ledger balance', <Money key="b" value={account.ledgerBalance ?? '0.00'} strong />], ['Kind', account.kind.replace(/_/g, ' ').toLowerCase()], ['Account number', account.accountNumber ?? '-'], ['Unmatched bank lines', unrec.data ? unrec.data.statementLines.length : '…'], ['Ledger lines not on a statement', unrec.data ? unrec.data.ledgerLines.length : '…']]} />
        {unrec.data && <p style={{ marginTop: 8 }}>Bank-only <Money value={unrec.data.totals.bankOnly} /> · ledger-only <Money value={unrec.data.totals.ledgerOnly} /> · net <Money value={unrec.data.totals.net} strong /></p>}
      </Card>
      <Card title="Imported statements" flush>
        <DataTable rowKey={(s) => s.id} rows={statements.data ?? []} loading={statements.loading} error={statements.error} columns={[
          { key: 'label', header: 'Statement', render: (s) => s.label ?? `#${s.id}` },
          { key: 'period', header: 'Period', render: (s) => (s.periodStart ? `${formatDate(s.periodStart)} – ${s.periodEnd ? formatDate(s.periodEnd) : ''}` : '-') },
          { key: 'lines', header: 'Lines', numeric: true, render: (s) => s.lineCount },
          { key: 'close', header: 'Closing balance', numeric: true, render: (s) => (s.closingBalance ? <Money value={s.closingBalance} /> : '-') },
          { key: 'src', header: 'Source', render: (s) => s.source },
          { key: 'at', header: 'Imported', render: (s) => formatDateTime(s.importedAt) }
        ]} empty={<span>No statements imported yet.</span>} />
      </Card>
      <Card title="Reconciliations" flush>
        <DataTable rowKey={(r) => r.id} rows={recs.data ?? []} loading={recs.loading} error={recs.error} rowHref={(r) => `/banking/reconciliations/${r.id}`} columns={[
          { key: 'date', header: 'Statement date', render: (r) => formatDate(r.statementDate) },
          { key: 'bal', header: 'Statement balance', numeric: true, render: (r) => <Money value={r.statementBalance} /> },
          { key: 'diff', header: 'Difference', numeric: true, render: (r) => (r.difference ? <Money value={r.difference} /> : '-') },
          { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} tone={r.status === 'FINALIZED' ? 'ok' : 'info'} /> }
        ]} empty={<span>No reconciliations yet. <Link to={`/banking/accounts/${id}/reconcile/new`}>Start one</Link>.</span>} />
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, DataTable, formatDate, PageHeader, StatusPill, useQuery } from '../../ui';
import { listBankAccounts, listReconciliations, type Reconciliation } from '../../api/bankingApi';
import { Money } from '../../features/finance/components/common';
import { SectionTabs } from '../../features/finance/components/SectionTabs';

type Row = Reconciliation & { accountName: string };

export default function ReconciliationsPage() {
  const accounts = useQuery(() => listBankAccounts(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!accounts.data) return;
    Promise.all(accounts.data.filter((a) => a.kind !== 'CASH').map(async (a) => (await listReconciliations(a.id)).map((r) => ({ ...r, accountName: a.name })))).then((groups) =>
      setRows(groups.flat().sort((x, y) => y.statementDate.localeCompare(x.statementDate)))
    );
  }, [accounts.data]);
  return (
    <div className="ui-page ui-stack">
      <PageHeader title="Reconciliations" subtitle="Where the books were last checked against the bank" />
      <SectionTabs section="banking" active="/banking/reconciliations" />
      <Card flush>
        <DataTable<Row>
          rowKey={(r) => r.id}
          rows={rows ?? []}
          loading={rows === null}
          rowHref={(r) => `/banking/reconciliations/${r.id}`}
          columns={[
            { key: 'acct', header: 'Account', render: (r) => <Link to={`/banking/accounts/${r.bankAccountId}`}>{r.accountName}</Link> },
            { key: 'date', header: 'Statement date', render: (r) => formatDate(r.statementDate) },
            { key: 'bal', header: 'Statement balance', numeric: true, render: (r) => <Money value={r.statementBalance} /> },
            { key: 'diff', header: 'Difference', numeric: true, render: (r) => (r.difference ? <Money value={r.difference} /> : '-') },
            { key: 'status', header: 'Status', render: (r) => <StatusPill status={r.status} tone={r.status === 'FINALIZED' ? 'ok' : 'info'} /> }
          ]}
          empty={<span>No reconciliations yet. Open an account and start one.</span>}
        />
      </Card>
    </div>
  );
}

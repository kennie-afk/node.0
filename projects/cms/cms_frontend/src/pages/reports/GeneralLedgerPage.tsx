import { Link } from 'react-router-dom';
import { Card, DataTable, useQuery } from '../../ui';
import { getGeneralLedger } from '../../api/reportsApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function GeneralLedgerPage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getGeneralLedger({ from: range.from, to: range.to, fundId: range.fundId || undefined }), [range.from, range.to, range.fundId]);
  return (
    <ReportFrame title="General ledger" subtitle={data ? `${data.from} to ${data.to}` : 'Open an account to see its postings'} loading={loading} error={error} onRetry={refetch} csv={{ path: '/reports/general-ledger', query: { from: range.from, to: range.to, fundId: range.fundId || undefined }, name: 'general-ledger.csv' }} filters={<RangeFilters range={range} />}>
      <Card flush>
        <DataTable rowKey={(a) => a.accountId} rows={data?.accounts ?? []} columns={[
          { key: 'n', header: 'Account', render: (a) => <Link to={`/finance/accounts/${a.accountId}/register?from=${range.from}&to=${range.to}`}>{a.code} · {a.name}</Link> },
          { key: 't', header: 'Type', render: (a) => a.type.toLowerCase() },
          { key: 'o', header: 'Opening', numeric: true, render: (a) => <Money value={a.opening} /> },
          { key: 'd', header: 'Debits', numeric: true, render: (a) => <Money value={a.debits} /> },
          { key: 'c', header: 'Credits', numeric: true, render: (a) => <Money value={a.credits} /> },
          { key: 'cl', header: 'Closing', numeric: true, render: (a) => <Money value={a.closing} strong /> }
        ]} empty={<span>No activity in this period.</span>} />
      </Card>
    </ReportFrame>
  );
}

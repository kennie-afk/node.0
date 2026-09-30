import { Link } from 'react-router-dom';
import { Card, DataTable, StatusPill, useQuery } from '../../ui';
import { getTrialBalance } from '../../api/financeApi';
import { Money } from '../../features/finance/components/common';
import { RangeFilters, ReportFrame } from '../../features/finance/components/report';
import { useRangeParams } from '../../features/finance/components/useRangeParams';

export default function TrialBalancePage() {
  const range = useRangeParams();
  const { data, error, loading, refetch } = useQuery(() => getTrialBalance({ asOf: range.asOf, fundId: range.fundId ? Number(range.fundId) : undefined }), [range.asOf, range.fundId]);
  return (
    <ReportFrame title="Trial balance" subtitle={data ? `As of ${data.asOf}` : undefined} loading={loading} error={error} onRetry={refetch} filters={<RangeFilters range={range} mode="asOf" />}>
      {data && (
        <Card flush>
          <DataTable rowKey={(l) => l.accountId} rows={data.lines} columns={[
            { key: 'code', header: 'Code', render: (l) => l.code },
            { key: 'name', header: 'Account', render: (l) => <Link to={`/finance/accounts/${l.accountId}/register`}>{l.name}</Link> },
            { key: 'type', header: 'Type', render: (l) => l.type.toLowerCase() },
            { key: 'd', header: 'Debit', numeric: true, render: (l) => (l.debit === '0.00' ? '' : <Money value={l.debit} />) },
            { key: 'c', header: 'Credit', numeric: true, render: (l) => (l.credit === '0.00' ? '' : <Money value={l.credit} />) }
          ]} totals={<tr><td colSpan={3}>Totals <StatusPill status={data.balanced ? 'Balanced' : 'Out of balance'} tone={data.balanced ? 'ok' : 'bad'} /></td><td className="ui-num"><Money value={data.totalDebit} strong /></td><td className="ui-num"><Money value={data.totalCredit} strong /></td></tr>} empty={<span>No postings yet.</span>} />
        </Card>
      )}
    </ReportFrame>
  );
}
